import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, bad, notFound, audit, notify } from '../../lib/core.js';
import { effectiveStatus } from '../../lib/journey.js';
import { targetedStudentIds } from '../../lib/jobs.js';
import { sendTable } from './exporting.js';

export const stages = Router();

const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', scheduled: 'مجدولة', open: 'متاحة', closed: 'مغلقة يدويًا', ended: 'منتهية' };

stages.get('/', ah(async (_req, res) => {
  const rows = await q(`
    SELECT s.id, s.title, s.topic, s.summary, s.color, s.icon, sc.*,
      (SELECT count(*) FROM stage_progress p WHERE p.stage_id=s.id)::int AS started,
      (SELECT count(*) FROM stage_progress p WHERE p.stage_id=s.id AND p.status='completed')::int AS completed,
      (SELECT round(avg(score_pct),1) FROM stage_attempts a WHERE a.stage_id=s.id AND a.status IN ('passed','failed')) AS avg_score,
      (SELECT count(*) FROM stage_exceptions e WHERE e.stage_id=s.id)::int AS exceptions,
      cl.level::text AS t_level, cl.grade AS t_grade, cl.section AS t_section
    FROM stages s JOIN stage_schedules sc ON sc.stage_id=s.id LEFT JOIN classes cl ON cl.id=sc.target_class_id ORDER BY s.id`);
  res.json(rows.map((r) => { const st = effectiveStatus(r); return { ...r, status: st, statusLabel: STATUS_LABEL[st] }; }));
}));

/** Matrix of all students × 7 stages, for the «متابعة تقدم الطالبات» page. */
stages.get('/progress/matrix', ah(async (req, res) => {
  const f = z.object({ level: z.enum(['intermediate', 'secondary']).optional(), grade: z.coerce.number().optional(), section: z.string().optional() }).parse(req.query);
  const p: unknown[] = []; const w: string[] = [];
  if (f.level) { p.push(f.level); w.push(`cl.level=$${p.length}`); }
  if (f.grade) { p.push(f.grade); w.push(`cl.grade=$${p.length}`); }
  if (f.section) { p.push(f.section); w.push(`cl.section=$${p.length}`); }
  const rows = await q(`
    SELECT u.id, u.full_name, sp.student_code, cl.level::text AS level, cl.grade, cl.section,
      coalesce(json_object_agg(p.stage_id, json_build_object('status', p.status, 'best', p.best_score, 'attempts', p.attempts_count)) FILTER (WHERE p.stage_id IS NOT NULL), '{}') AS stages
    FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
    LEFT JOIN stage_progress p ON p.student_id=u.id
    WHERE u.role='student' AND u.is_active ${w.length ? 'AND ' + w.join(' AND ') : ''}
    GROUP BY u.id, sp.student_code, cl.id ORDER BY cl.grade, cl.section, u.full_name`, p);
  if (req.query.format) {
    const S: Record<string, string> = { completed: 'مكتملة', in_progress: 'قيد التقدم', failed: 'لم تجتز' };
    return sendTable(res, String(req.query.format), 'تقدم-رحلة-الوعي', [
      ['الطالبة', 'full_name'], ['الرقم', 'student_code'], ['الفصل', (r: any) => `${r.grade}/${r.section}`],
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => [`المرحلة ${n}`, (r: any) => r.stages[n] ? `${S[r.stages[n].status]} (${r.stages[n].best ?? '-'}%)` : '—'] as [string, (r: any) => string]),
    ], rows);
  }
  res.json(rows);
}));

stages.get('/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const s = await q1('SELECT s.*, sc.* FROM stages s JOIN stage_schedules sc ON sc.stage_id=s.id WHERE s.id=$1', [id]);
  if (!s) throw notFound();
  const targets = await q('SELECT t.student_id AS id, u.full_name, sp.student_code FROM stage_target_students t JOIN users u ON u.id=t.student_id JOIN student_profiles sp ON sp.user_id=u.id WHERE t.stage_id=$1', [id]);
  const exceptions = await q(`SELECT e.*, u.full_name, sp.student_code FROM stage_exceptions e JOIN users u ON u.id=e.student_id JOIN student_profiles sp ON sp.user_id=u.id WHERE e.stage_id=$1 ORDER BY e.granted_at DESC`, [id]);
  const steps = await q(`SELECT sc.id, sc.position, sc.kind, sc.title, sc.content, sc.answer_key,
      coalesce(json_agg(json_build_object('label', c.label, 'points', c.points, 'outcome', c.outcome, 'followup', c.followup) ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL), '[]') AS choices
    FROM scenarios sc LEFT JOIN scenario_choices c ON c.scenario_id=sc.id WHERE sc.stage_id=$1 GROUP BY sc.id ORDER BY sc.position`, [id]);
  const st = effectiveStatus(s);
  res.json({ ...s, status: st, statusLabel: STATUS_LABEL[st], targets, exceptions, steps });
}));

const settingsSchema = z.object({
  publish_state: z.enum(['draft', 'published', 'closed']),
  open_at: z.string().datetime({ offset: true }).nullable(),
  close_at: z.string().datetime({ offset: true }).nullable(),
  target_type: z.enum(['all', 'level', 'grade', 'class', 'students']),
  target_level: z.enum(['intermediate', 'secondary']).nullable().optional(),
  target_grade: z.number().int().min(1).max(3).nullable().optional(),
  target_class_id: z.number().int().nullable().optional(),
  target_students: z.array(z.string().uuid()).max(2000).optional(),
  pass_score: z.number().int().min(0).max(100),
  max_attempts: z.number().int().min(1).max(20),
  allow_retry: z.boolean(),
  require_previous: z.boolean(),
  show_answers: z.enum(['after_attempt', 'after_close', 'never']),
}).superRefine((v, ctx) => {
  if (v.open_at && v.close_at && new Date(v.close_at) <= new Date(v.open_at)) ctx.addIssue({ code: 'custom', path: ['close_at'], message: 'موعد الإغلاق يجب أن يكون بعد موعد الفتح' });
  if (v.target_type === 'level' && !v.target_level) ctx.addIssue({ code: 'custom', path: ['target_level'], message: 'اختاري المرحلة الدراسية' });
  if (v.target_type === 'grade' && (!v.target_level || !v.target_grade)) ctx.addIssue({ code: 'custom', path: ['target_grade'], message: 'اختاري المرحلة والصف' });
  if (v.target_type === 'class' && !v.target_class_id) ctx.addIssue({ code: 'custom', path: ['target_class_id'], message: 'اختاري الفصل' });
  if (v.target_type === 'students' && !v.target_students?.length) ctx.addIssue({ code: 'custom', path: ['target_students'], message: 'اختاري طالبة واحدة على الأقل' });
});

stages.put('/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const b = settingsSchema.parse(req.body);
  const out = await tx(async (c) => {
    const { rows: [before] } = await c.query('SELECT * FROM stage_schedules WHERE stage_id=$1 FOR UPDATE', [id]);
    const changedOpen = String(before.open_at?.toISOString?.() ?? null) !== String(b.open_at ? new Date(b.open_at).toISOString() : null) || before.publish_state !== b.publish_state;
    const changedClose = String(before.close_at?.toISOString?.() ?? null) !== String(b.close_at ? new Date(b.close_at).toISOString() : null);
    const { rows: [after] } = await c.query(
      `UPDATE stage_schedules SET publish_state=$2, open_at=$3, close_at=$4, target_type=$5, target_level=$6, target_grade=$7, target_class_id=$8,
         pass_score=$9, max_attempts=$10, allow_retry=$11, require_previous=$12, show_answers=$13, updated_by=$14, updated_at=now(),
         open_notified_at = CASE WHEN $15 THEN NULL ELSE open_notified_at END,
         closing_notified_at = CASE WHEN $16 THEN NULL ELSE closing_notified_at END
       WHERE stage_id=$1 RETURNING *`,
      [id, b.publish_state, b.open_at, b.close_at, b.target_type,
       ['level', 'grade'].includes(b.target_type) ? b.target_level : null, b.target_type === 'grade' ? b.target_grade : null,
       b.target_type === 'class' ? b.target_class_id : null, b.pass_score, b.max_attempts, b.allow_retry, b.require_previous, b.show_answers,
       req.user!.id, changedOpen, changedClose]);
    await c.query('DELETE FROM stage_target_students WHERE stage_id=$1', [id]);
    if (b.target_type === 'students' && b.target_students?.length)
      await c.query('INSERT INTO stage_target_students(stage_id, student_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [id, b.target_students]);
    // classify the change for the audit log
    let action = 'stage.update';
    if (before.publish_state !== 'closed' && b.publish_state === 'closed') action = 'stage.close_early';
    else if (before.publish_state === 'closed' && b.publish_state === 'published') action = 'stage.reopen';
    else if (before.publish_state === 'draft' && b.publish_state === 'published') action = 'stage.publish';
    else if (before.close_at && b.close_at && new Date(b.close_at) > before.close_at) action = 'stage.extend';
    await audit(req.user!.id, action, 'stage', id, { before: pick(before), after: pick(after) }, req.ip, c);
    return after;
  });
  // Settings take effect immediately: access is evaluated live from these rows on every request.
  // Opening notifications are sent by the scheduler (within a minute) once the stage is actually open.
  res.json({ ...out, status: effectiveStatus(out) });
}));
const pick = (s: any) => ({ publish_state: s.publish_state, open_at: s.open_at, close_at: s.close_at, target_type: s.target_type, pass_score: s.pass_score, max_attempts: s.max_attempts });

// ------------------------------------------------- per-student exceptions
stages.put('/:id/exceptions/:sid', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const sid = z.string().uuid().parse(req.params.sid);
  const b = z.object({
    grant_access: z.boolean().default(false), extra_attempts: z.number().int().min(0).max(10).default(0),
    close_at_override: z.string().datetime({ offset: true }).nullable().default(null), reason: z.string().max(300).default(''),
  }).parse(req.body);
  const stu = await q1("SELECT id FROM users WHERE id=$1 AND role='student'", [sid]);
  if (!stu) throw notFound('الطالبة غير موجودة');
  await tx(async (c) => {
    await c.query(`INSERT INTO stage_exceptions(stage_id, student_id, grant_access, extra_attempts, close_at_override, reason, granted_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (stage_id, student_id) DO UPDATE SET grant_access=EXCLUDED.grant_access,
      extra_attempts=EXCLUDED.extra_attempts, close_at_override=EXCLUDED.close_at_override, reason=EXCLUDED.reason, granted_by=EXCLUDED.granted_by, granted_at=now()`,
      [id, sid, b.grant_access, b.extra_attempts, b.close_at_override, b.reason, req.user!.id]);
    await audit(req.user!.id, 'stage.exception', 'stage', id, { student: sid, ...b }, req.ip, c);
    const { rows: [st] } = await c.query('SELECT title FROM stages WHERE id=$1', [id]);
    if (b.grant_access || b.extra_attempts || b.close_at_override)
      await notify([sid], { kind: 'stage_exception', title: `تم منحك استثناء في مرحلة «${st.title}»`, body: b.extra_attempts ? `محاولات إضافية: ${b.extra_attempts}` : '', link: '/student/journey' }, c);
  });
  res.json({ ok: true });
}));
stages.delete('/:id/exceptions/:sid', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const sid = z.string().uuid().parse(req.params.sid);
  await q('DELETE FROM stage_exceptions WHERE stage_id=$1 AND student_id=$2', [id, sid]);
  await audit(req.user!.id, 'stage.exception_remove', 'stage', id, { student: sid }, req.ip);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- results
stages.get('/:id/results', ah(async (req, res) => {
  const id = z.coerce.number().int().min(1).max(7).parse(req.params.id);
  const rows = await stageResults(id);
  if (req.query.format) return sendTable(res, String(req.query.format), `نتائج-المرحلة-${id}`, [
    ['الطالبة', 'full_name'], ['الرقم', 'student_code'], ['الفصل', (r: any) => `${r.grade}/${r.section}`], ['الحالة', 'status_label'],
    ['المحاولات', 'attempts'], ['أفضل درجة', 'best_score'], ['تاريخ البدء', 'first_started_at'], ['تاريخ الإكمال', 'completed_at'],
  ], rows);
  const hardest = await q(`
    SELECT sc.position, sc.title, sc.kind, round(avg(r.points::numeric / nullif(r.max_points,0)) * 100, 1) AS avg_pct, count(*)::int AS answers
    FROM stage_responses r JOIN scenarios sc ON sc.id=r.scenario_id JOIN stage_attempts a ON a.id=r.attempt_id
    WHERE sc.stage_id=$1 GROUP BY sc.id ORDER BY avg_pct ASC NULLS LAST LIMIT 10`, [id]);
  res.json({ rows, hardest });
}));

async function stageResults(id: number) {
  const targeted = new Set(await targetedStudentIds(id));
  const rows = await q(`
    SELECT u.id, u.full_name, sp.student_code, cl.level::text AS level, cl.grade, cl.section,
      p.status, p.best_score, p.attempts_count AS attempts, p.first_started_at, p.completed_at
    FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
    LEFT JOIN stage_progress p ON p.student_id=u.id AND p.stage_id=$1
    WHERE u.role='student' AND u.is_active ORDER BY cl.grade, cl.section, u.full_name`, [id]);
  const L: Record<string, string> = { completed: 'مكتملة', in_progress: 'قيد التقدم', failed: 'لم تجتز بعد' };
  return rows.filter((r) => targeted.has(r.id) || r.status).map((r) => ({ ...r, status_label: r.status ? L[r.status] : 'لم تبدأ' }));
}

void bad;
