import { q, q1, type Tx } from './core.js';

export interface Schedule {
  stage_id: number; publish_state: 'draft' | 'published' | 'closed';
  open_at: Date | null; close_at: Date | null;
  target_type: 'all' | 'level' | 'grade' | 'class' | 'students';
  target_level: string | null; target_grade: number | null; target_class_id: number | null;
  pass_score: number; max_attempts: number; allow_retry: boolean; require_previous: boolean;
  show_answers: 'after_attempt' | 'after_close' | 'never';
}
export interface StudentCtx { id: string; class_id: number; level: string; grade: number }

/** Teacher-facing effective status. */
export function effectiveStatus(s: Pick<Schedule, 'publish_state' | 'open_at' | 'close_at'>, now = new Date()) {
  if (s.publish_state === 'draft') return 'draft';
  if (s.publish_state === 'closed') return 'closed';
  if (s.open_at && now < s.open_at) return 'scheduled';
  if (s.close_at && now >= s.close_at) return 'ended';
  return 'open';
}

export type StudentStageState = 'open' | 'upcoming' | 'completed' | 'locked' | 'ended' | 'expired_incomplete';

export async function studentCtx(userId: string, c?: Tx): Promise<StudentCtx> {
  const sql = `SELECT sp.user_id AS id, sp.class_id, cl.level::text AS level, cl.grade
               FROM student_profiles sp JOIN classes cl ON cl.id = sp.class_id WHERE sp.user_id=$1`;
  const r = c ? (await c.query(sql, [userId])).rows[0] : await q1(sql, [userId]);
  if (!r) throw new Error('student profile missing');
  return r;
}

/** Every rule that decides what a student may do with a stage. Evaluated on the server only. */
export async function stageAccess(stu: StudentCtx, stageId: number, c?: Tx, now = new Date()) {
  const run = async (sql: string, p: unknown[]) => (c ? (await c.query(sql, p)).rows : await q(sql, p));
  const [s] = (await run('SELECT * FROM stage_schedules WHERE stage_id=$1', [stageId])) as Schedule[];
  const [ex] = await run('SELECT * FROM stage_exceptions WHERE stage_id=$1 AND student_id=$2', [stageId, stu.id]);
  const [pr] = await run('SELECT * FROM stage_progress WHERE stage_id=$1 AND student_id=$2', [stageId, stu.id]);
  const [cnt] = await run(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='in_progress')::int AS open
                           FROM stage_attempts WHERE stage_id=$1 AND student_id=$2`, [stageId, stu.id]);
  let prevDone = true;
  if (s.require_previous && stageId > 1) {
    const [p] = await run("SELECT 1 FROM stage_progress WHERE stage_id=$1 AND student_id=$2 AND status='completed'", [stageId - 1, stu.id]);
    prevDone = !!p;
  }
  let targeted = false;
  switch (s.target_type) {
    case 'all': targeted = true; break;
    case 'level': targeted = s.target_level === stu.level; break;
    case 'grade': targeted = s.target_level === stu.level && s.target_grade === stu.grade; break;
    case 'class': targeted = s.target_class_id === stu.class_id; break;
    case 'students': {
      const [t] = await run('SELECT 1 FROM stage_target_students WHERE stage_id=$1 AND student_id=$2', [stageId, stu.id]);
      targeted = !!t;
    }
  }
  const granted = !!ex?.grant_access;
  const closeAt: Date | null = ex?.close_at_override ?? s.close_at;
  const visible = s.publish_state !== 'draft' && (targeted || granted);
  const manuallyClosed = s.publish_state === 'closed' && !granted;
  const completed = pr?.status === 'completed';
  const maxAttempts = (s.allow_retry ? s.max_attempts : 1) + (ex?.extra_attempts ?? 0);
  const attemptsUsed: number = cnt.n;
  const hasOpenAttempt = cnt.open > 0;

  let state: StudentStageState;
  let reason = '';
  if (!visible) { state = 'locked'; reason = 'المرحلة غير متاحة لكِ حاليًا'; }
  else if (completed) state = 'completed';
  else if (manuallyClosed) { state = 'locked'; reason = 'أغلقت المعلمة هذه المرحلة'; }
  else if (s.open_at && now < s.open_at) { state = 'upcoming'; reason = 'لم يحن موعد فتح المرحلة'; }
  else if (closeAt && now >= closeAt) { state = attemptsUsed > 0 ? 'expired_incomplete' : 'ended'; reason = 'انتهت فترة المرحلة'; }
  else if (!prevDone && !granted) { state = 'locked'; reason = 'أكملي المرحلة السابقة أولًا'; }
  else state = 'open';

  const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed);
  const canStart = state === 'open' && !hasOpenAttempt && attemptsLeft > 0;
  const canContinue = state === 'open' && hasOpenAttempt;
  if (state === 'open' && !canStart && !canContinue) reason = 'استنفدتِ عدد المحاولات المسموح بها';

  return { schedule: s, state, reason, canStart, canContinue, attemptsUsed, attemptsLeft, maxAttempts, closeAt, openAt: s.open_at, progress: pr ?? null };
}

/** Whether correct answers may be revealed for a stage attempt now. */
export function answersVisible(s: Schedule, closeAt: Date | null, now = new Date()) {
  if (s.show_answers === 'never') return false;
  if (s.show_answers === 'after_attempt') return true;
  return !!closeAt && now >= closeAt;
}

// --------------------------------------------------------------- scoring
export function scoreMinigame(content: any, key: any, payload: any, max: number) {
  if (content.game === 'classify') {
    const ans: Record<string, string> = payload?.map ?? {};
    const ids = Object.keys(key.map);
    const correct = ids.filter((id) => ans[id] === key.map[id]).length;
    return { points: Math.round((correct / ids.length) * max), detail: Object.fromEntries(ids.map((id) => [id, { correct: ans[id] === key.map[id], expected: key.map[id] }])) };
  }
  if (content.game === 'spot') {
    const sel = new Set<string>(Array.isArray(payload?.selected) ? payload.selected : []);
    const flags = new Set<string>(key.flags);
    const hits = [...sel].filter((x) => flags.has(x)).length;
    const wrong = [...sel].filter((x) => !flags.has(x)).length;
    const pts = Math.max(0, Math.round(((hits - wrong) / flags.size) * max));
    return { points: pts, detail: { flags: key.flags, why: key.why, hits, wrong } };
  }
  // order
  const order: string[] = Array.isArray(payload?.order) ? payload.order : [];
  const correct = key.order.filter((id: string, i: number) => order[i] === id).length;
  return { points: Math.round((correct / key.order.length) * max), detail: { order: key.order, correctPositions: correct } };
}
