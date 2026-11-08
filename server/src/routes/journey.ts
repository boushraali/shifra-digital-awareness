/** Student side of «رحلة الوعي الرقمي». All gating and scoring happens here, never in the browser. */
import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, requireAuth, bad, forbidden, notFound, notify, teacherIds, HttpError } from '../lib/core.js';
import { stageAccess, studentCtx, answersVisible, scoreMinigame } from '../lib/journey.js';
import { issueCertificate } from '../lib/certs.js';

export const journey = Router();
journey.use(requireAuth('student'));

const LABEL: Record<string, string> = {
  open: 'متاحة الآن', upcoming: 'قريبًا', completed: 'مكتملة', locked: 'مغلقة', ended: 'انتهت المدة', expired_incomplete: 'غير مكتملة — انتهى الوقت',
};

journey.get('/', ah(async (req, res) => {
  const stu = await studentCtx(req.user!.id);
  const stages = await q('SELECT id, slug, title, topic, summary, color, icon, badge_name, key_name FROM stages ORDER BY id');
  const out = [];
  for (const s of stages) {
    const a = await stageAccess(stu, s.id);
    out.push({
      ...s, state: a.state, stateLabel: LABEL[a.state], reason: a.reason, canStart: a.canStart, canContinue: a.canContinue,
      openAt: a.openAt, closeAt: a.closeAt, attemptsUsed: a.attemptsUsed, attemptsLeft: a.attemptsLeft, maxAttempts: a.maxAttempts,
      passScore: a.schedule.pass_score, bestScore: a.progress?.best_score ?? null, completedAt: a.progress?.completed_at ?? null,
    });
  }
  const pts = await q1<{ points: number; keys: number; badges: number }>(
    `SELECT coalesce(sum(points),0)::int AS points, count(*) FILTER (WHERE kind='key')::int AS keys, count(*) FILTER (WHERE kind='badge')::int AS badges
     FROM achievements WHERE student_id=$1`, [stu.id]);
  res.json({ stages: out, totals: pts });
}));

/** Load a stage for playing. Only when it is open for this student (or already completed, for review). */
journey.get('/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const stu = await studentCtx(req.user!.id);
  const a = await stageAccess(stu, id);
  if (!(a.state === 'open' || a.state === 'completed')) throw new HttpError(403, a.reason || 'المرحلة غير متاحة');
  const stage = await q1('SELECT id, slug, title, topic, summary, color, icon, badge_name, key_name, intro FROM stages WHERE id=$1', [id]);
  const steps = await q(
    `SELECT s.id, s.position, s.kind, s.title, s.content, s.max_points,
            coalesce(json_agg(json_build_object('id', c.id, 'label', c.label) ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL), '[]') AS choices
     FROM scenarios s LEFT JOIN scenario_choices c ON c.scenario_id = s.id
     WHERE s.stage_id=$1 GROUP BY s.id ORDER BY s.position`, [id]);
  // shuffle «order» minigame items so the stored correct order is not revealed
  for (const st of steps) if (st.content?.game === 'order') st.content.steps = shuffle(st.content.steps);
  const attempt = await q1("SELECT id, attempt_no, started_at FROM stage_attempts WHERE stage_id=$1 AND student_id=$2 AND status='in_progress'", [id, stu.id]);
  let answered: any[] = [];
  if (attempt) answered = await responsesFor(attempt.id);
  res.json({ stage, steps, attempt, answered, access: { state: a.state, canStart: a.canStart, attemptsLeft: a.attemptsLeft, closeAt: a.closeAt, passScore: a.schedule.pass_score } });
}));

async function responsesFor(attemptId: string) {
  return q(
    `SELECT r.scenario_id, r.choice_id, r.points, r.payload, s.kind, c.outcome, c.followup
     FROM stage_responses r JOIN scenarios s ON s.id=r.scenario_id LEFT JOIN scenario_choices c ON c.id=r.choice_id
     WHERE r.attempt_id=$1 ORDER BY s.position`, [attemptId]).then((rows) =>
    rows.map((r) => ({
      scenarioId: r.scenario_id, choiceId: r.choice_id, kind: r.kind,
      // quiz feedback is deferred; scenario outcomes are part of the story
      outcome: r.kind === 'scenario' ? r.outcome : undefined,
      followup: r.kind === 'scenario' && r.followup ? { prompt: r.followup.prompt, options: r.followup.options.map((o: any) => o.label) } : undefined,
      followupAnswer: r.payload?.followup ?? null,
      followupOutcome: r.payload?.followup != null && r.followup ? r.followup.options[r.payload.followup]?.outcome : undefined,
      detail: r.kind === 'minigame' ? r.payload?.detail : undefined,
      points: r.kind === 'quiz' ? undefined : r.points,
    })));
}

journey.post('/:id/start', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const out = await tx(async (c) => {
    // serialize concurrent starts for this student/stage
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`stage:${id}:${req.user!.id}`]);
    const stu = await studentCtx(req.user!.id, c);
    const a = await stageAccess(stu, id, c);
    if (a.canContinue) {
      const { rows: [open] } = await c.query("SELECT id FROM stage_attempts WHERE stage_id=$1 AND student_id=$2 AND status='in_progress'", [id, stu.id]);
      return { attemptId: open.id, resumed: true };
    }
    if (!a.canStart) throw new HttpError(403, a.reason || 'لا يمكن بدء المرحلة');
    const { rows: [mx] } = await c.query('SELECT sum(max_points)::int AS m FROM scenarios WHERE stage_id=$1', [id]);
    const { rows: [att] } = await c.query(
      'INSERT INTO stage_attempts(stage_id, student_id, attempt_no, max_points) VALUES ($1,$2,$3,$4) RETURNING id',
      [id, stu.id, a.attemptsUsed + 1, mx.m]);
    await c.query(
      `INSERT INTO stage_progress(stage_id, student_id, attempts_count) VALUES ($1,$2,1)
       ON CONFLICT (stage_id, student_id) DO UPDATE SET attempts_count = stage_progress.attempts_count + 1,
         status = CASE WHEN stage_progress.status='completed' THEN 'completed' ELSE 'in_progress' END`, [id, stu.id]);
    return { attemptId: att.id, resumed: false };
  });
  res.json(out);
}));

/** Loads the attempt, verifies ownership and that the stage window is still open. */
async function liveAttempt(c: any, attemptId: string, userId: string) {
  const { rows: [att] } = await c.query('SELECT * FROM stage_attempts WHERE id=$1 FOR UPDATE', [attemptId]);
  if (!att) throw notFound();
  if (att.student_id !== userId) throw forbidden();
  if (att.status !== 'in_progress') throw bad('هذه المحاولة منتهية');
  const stu = await studentCtx(userId, c);
  const a = await stageAccess(stu, att.stage_id, c);
  // expired attempts are closed by the scheduled job (lib/jobs.ts)
  if (a.state !== 'open') throw new HttpError(403, 'انتهت فترة المرحلة — لم تعد المحاولة متاحة');
  return { att, access: a };
}

const answerSchema = z.object({
  scenarioId: z.number().int(),
  choiceId: z.number().int().optional(),
  followup: z.number().int().min(0).max(5).optional(),
  payload: z.object({
    map: z.record(z.string(), z.string()).optional(),
    selected: z.array(z.string()).max(50).optional(),
    order: z.array(z.string()).max(50).optional(),
  }).optional(),
});

journey.post('/attempts/:aid/answer', ah(async (req, res) => {
  const aid = z.string().uuid().parse(req.params.aid);
  const body = answerSchema.parse(req.body);
  const result = await tx(async (c) => {
    const { att } = await liveAttempt(c, aid, req.user!.id);
    const { rows: [sc] } = await c.query('SELECT * FROM scenarios WHERE id=$1 AND stage_id=$2', [body.scenarioId, att.stage_id]);
    if (!sc) throw notFound('الخطوة غير موجودة');
    const { rows: [prev] } = await c.query('SELECT * FROM stage_responses WHERE attempt_id=$1 AND scenario_id=$2', [aid, sc.id]);

    // ---- branch (follow-up) answer for an already-answered scenario
    if (body.followup !== undefined) {
      if (!prev || sc.kind !== 'scenario') throw bad('لا يوجد سؤال متابعة لهذه الخطوة');
      const { rows: [ch] } = await c.query('SELECT * FROM scenario_choices WHERE id=$1', [prev.choice_id]);
      if (!ch.followup) throw bad('لا يوجد سؤال متابعة لهذه الخطوة');
      if (prev.payload?.followup != null) throw bad('تمت الإجابة مسبقًا');
      const opt = ch.followup.options[body.followup];
      if (!opt) throw bad('خيار غير صالح');
      const pts = Math.min(sc.max_points, prev.points + opt.points);
      await c.query('UPDATE stage_responses SET points=$1, payload=$2 WHERE attempt_id=$3 AND scenario_id=$4',
        [pts, JSON.stringify({ ...(prev.payload ?? {}), followup: body.followup, pending: false }), aid, sc.id]);
      return { kind: 'followup', outcome: opt.outcome, points: pts, good: opt.points > 0 };
    }

    if (prev) throw bad('تمت الإجابة على هذه الخطوة مسبقًا');
    // steps are played in order; any pending branch must be resolved first
    const { rows: [st] } = await c.query(
      `SELECT count(*)::int AS n, bool_or(coalesce((payload->>'pending')::boolean,false)) AS pending
       FROM stage_responses WHERE attempt_id=$1`, [aid]);
    if (st.pending) throw bad('أجيبي على سؤال المتابعة أولًا');
    if (sc.position !== st.n + 1) throw bad('يجب إكمال الخطوات بالترتيب');

    if (sc.kind === 'minigame') {
      const { points, detail } = scoreMinigame(sc.content, sc.answer_key, body.payload, sc.max_points);
      await c.query('INSERT INTO stage_responses(attempt_id, scenario_id, payload, points, max_points) VALUES ($1,$2,$3,$4,$5)',
        [aid, sc.id, JSON.stringify({ answer: body.payload ?? {}, detail }), points, sc.max_points]);
      return { kind: 'minigame', points, detail };
    }
    if (!body.choiceId) throw bad('اختاري إجابة');
    const { rows: [ch] } = await c.query('SELECT * FROM scenario_choices WHERE id=$1 AND scenario_id=$2', [body.choiceId, sc.id]);
    if (!ch) throw bad('خيار غير صالح');
    const pending = sc.kind === 'scenario' && !!ch.followup;
    await c.query('INSERT INTO stage_responses(attempt_id, scenario_id, choice_id, payload, points, max_points) VALUES ($1,$2,$3,$4,$5,$6)',
      [aid, sc.id, ch.id, JSON.stringify({ pending }), ch.points, sc.max_points]);
    if (sc.kind === 'quiz') return { kind: 'quiz', recorded: true };
    return {
      kind: 'scenario', outcome: ch.outcome, points: ch.points, best: ch.is_best,
      followup: ch.followup ? { prompt: ch.followup.prompt, options: ch.followup.options.map((o: any) => o.label) } : null,
    };
  });
  res.json(result);
}));

journey.post('/attempts/:aid/finish', ah(async (req, res) => {
  const aid = z.string().uuid().parse(req.params.aid);
  const out = await tx(async (c) => {
    const { att, access } = await liveAttempt(c, aid, req.user!.id);
    const { rows: [tot] } = await c.query(
      `SELECT (SELECT count(*) FROM scenarios WHERE stage_id=$2 AND mandatory)::int AS required,
              count(r.*)::int AS answered, coalesce(sum(r.points),0)::int AS points,
              bool_or(coalesce((r.payload->>'pending')::boolean,false)) AS pending
       FROM stage_responses r WHERE r.attempt_id=$1`, [aid, att.stage_id]);
    if (tot.answered < tot.required || tot.pending) throw bad('أكملي جميع الأنشطة الإلزامية أولًا');
    const pct = Math.round((tot.points / att.max_points) * 10000) / 100;
    const passed = pct >= access.schedule.pass_score;
    await c.query('UPDATE stage_attempts SET status=$1, points=$2, score_pct=$3, finished_at=now() WHERE id=$4',
      [passed ? 'passed' : 'failed', tot.points, pct, aid]);
    await c.query(
      `UPDATE stage_progress SET best_score = GREATEST(coalesce(best_score,0), $3),
         status = CASE WHEN status='completed' OR $4 THEN 'completed' ELSE 'failed' END,
         completed_at = CASE WHEN completed_at IS NULL AND $4 THEN now() ELSE completed_at END
       WHERE stage_id=$1 AND student_id=$2`, [att.stage_id, att.student_id, pct, passed]);
    // points: keep the best result per stage
    await c.query(
      `INSERT INTO achievements(student_id, kind, ref, title, points) VALUES ($1,'points',$2,$3,$4)
       ON CONFLICT (student_id, kind, ref) DO UPDATE SET points = GREATEST(achievements.points, EXCLUDED.points)`,
      [att.student_id, `stage:${att.stage_id}`, 'نقاط المرحلة', tot.points]);
    const { rows: [stage] } = await c.query('SELECT * FROM stages WHERE id=$1', [att.stage_id]);
    let cert = null; let journeyCert = null;
    if (passed) {
      await c.query(`INSERT INTO achievements(student_id, kind, ref, title) VALUES ($1,'badge',$2,$3), ($1,'key',$2,$4) ON CONFLICT DO NOTHING`,
        [att.student_id, `stage:${att.stage_id}`, stage.badge_name, stage.key_name]);
      const { rows: [u] } = await c.query('SELECT full_name FROM users WHERE id=$1', [att.student_id]);
      cert = await issueCertificate(c, { kind: 'stage', studentId: att.student_id, studentName: u.full_name, stageId: stage.id, title: stage.title, score: pct });
      await notify([att.student_id], { kind: 'stage_completed', title: `اكتملت مرحلة «${stage.title}» بنجاح 🎉`, body: `درجتك ${pct}%`, link: '/student/journey', dedupe: `stagedone:${stage.id}` }, c);
      await notify(await teacherIds(c), { kind: 'stage_completed', title: `أكملت ${u.full_name} مرحلة «${stage.title}»`, body: `الدرجة ${pct}%`, link: `/teacher/students/${att.student_id}`, dedupe: `t-stagedone:${stage.id}:${att.student_id}` }, c);
      const { rows: [all] } = await c.query("SELECT count(*)::int AS n FROM stage_progress WHERE student_id=$1 AND status='completed'", [att.student_id]);
      if (all.n === 7) {
        journeyCert = await issueCertificate(c, { kind: 'journey', studentId: att.student_id, studentName: u.full_name, title: 'سفيرة الوعي الرقمي' });
        await c.query(`INSERT INTO achievements(student_id, kind, ref, title, points) VALUES ($1,'badge','journey','سفيرة الوعي الرقمي',50) ON CONFLICT DO NOTHING`, [att.student_id]);
      }
    }
    const reveal = answersVisible(access.schedule, access.closeAt);
    return { passed, scorePct: pct, points: tot.points, maxPoints: att.max_points, passScore: access.schedule.pass_score,
      attemptsLeft: Math.max(0, access.attemptsLeft), certificateId: cert?.id ?? null, journeyCertificateId: journeyCert?.id ?? null,
      badge: passed ? stage.badge_name : null, key: passed ? stage.key_name : null, reviewAvailable: reveal };
  });
  res.json(out);
}));

/** Review of a finished attempt — correct answers only when the teacher's setting allows it. */
journey.get('/attempts/:aid/review', ah(async (req, res) => {
  const aid = z.string().uuid().parse(req.params.aid);
  const att = await q1('SELECT * FROM stage_attempts WHERE id=$1', [aid]);
  if (!att) throw notFound();
  if (att.student_id !== req.user!.id) throw forbidden();
  if (att.status === 'in_progress') throw bad('المحاولة لم تنتهِ بعد');
  const stu = await studentCtx(req.user!.id);
  const a = await stageAccess(stu, att.stage_id);
  if (!answersVisible(a.schedule, a.closeAt)) throw new HttpError(403, 'ستُعرض الإجابات الصحيحة وفق إعدادات المعلمة');
  const rows = await q(
    `SELECT s.position, s.kind, s.title, s.content->>'question' AS question, s.answer_key->>'explanation' AS explanation,
            r.points, r.max_points, mine.label AS my_choice,
            (SELECT label FROM scenario_choices WHERE scenario_id=s.id AND is_best ORDER BY position LIMIT 1) AS best_choice
     FROM scenarios s LEFT JOIN stage_responses r ON r.scenario_id=s.id AND r.attempt_id=$1
     LEFT JOIN scenario_choices mine ON mine.id=r.choice_id
     WHERE s.stage_id=$2 ORDER BY s.position`, [aid, att.stage_id]);
  res.json({ attempt: { scorePct: att.score_pct, status: att.status }, items: rows });
}));

journey.get('/history/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  res.json(await q('SELECT id, attempt_no, status, score_pct, started_at, finished_at FROM stage_attempts WHERE stage_id=$1 AND student_id=$2 ORDER BY attempt_no DESC', [id, req.user!.id]));
}));

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  // make sure it's not accidentally already in the correct order
  return x.every((v, i) => v === a[i]) && x.length > 1 ? [...x.slice(1), x[0]] : x;
}
