import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, bad, notFound, audit, notify, levelLabel } from '../../lib/core.js';
import { sendTable } from './exporting.js';
import { verifyUrl } from '../../lib/certs.js';

export const reports = Router();

/** Dashboard KPIs — all computed from live data. */
reports.get('/dashboard', ah(async (_req, res) => {
  const k = await q1(`SELECT
     (SELECT count(*) FROM users WHERE role='student')::int AS students,
     (SELECT count(*) FROM users WHERE role='student' AND is_active AND last_login_at > now() - interval '14 days')::int AS active,
     (SELECT count(DISTINCT student_id) FROM stage_progress)::int AS journey_started,
     (SELECT count(*) FROM (SELECT student_id FROM stage_progress WHERE status='completed' GROUP BY student_id HAVING count(*)=7) x)::int AS journey_completed,
     (SELECT count(*) FROM courses WHERE publish_state='published')::int AS courses_published,
     (SELECT count(*) FROM course_enrollments)::int AS enrollments,
     (SELECT count(*) FROM certificates WHERE status='valid')::int AS certificates,
     (SELECT round(avg(pct),1) FROM (
        SELECT (count(*) FILTER (WHERE p.status='completed'))::numeric / 7 * 100 AS pct
        FROM users u LEFT JOIN stage_progress p ON p.student_id=u.id WHERE u.role='student' GROUP BY u.id) z) AS avg_journey_pct,
     (SELECT count(*) FROM assessment_attempts WHERE status='pending_review')::int AS pending_grading`);
  const perStage = await q(`SELECT s.id, s.title, s.color,
      count(p.*) FILTER (WHERE p.status='completed')::int AS completed,
      count(p.*) FILTER (WHERE p.status<>'completed')::int AS in_progress
    FROM stages s LEFT JOIN stage_progress p ON p.stage_id=s.id GROUP BY s.id ORDER BY s.id`);
  const perCourse = await q(`SELECT c.title, count(e.*)::int AS enrolled, count(e.completed_at)::int AS completed
    FROM courses c LEFT JOIN course_enrollments e ON e.course_id=c.id WHERE c.publish_state<>'draft' GROUP BY c.id ORDER BY enrolled DESC LIMIT 8`);
  const activity = await q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM stage_attempts a WHERE a.finished_at::date = d::date)::int AS stage_attempts,
      (SELECT count(*) FROM lesson_progress l WHERE l.completed_at::date = d::date)::int AS lessons
    FROM generate_series((now() AT TIME ZONE 'Asia/Riyadh')::date - 13, (now() AT TIME ZONE 'Asia/Riyadh')::date, interval '1 day') d ORDER BY d`);
  const recent = await q(`SELECT c.kind, c.title, c.student_name, c.issued_at FROM certificates c ORDER BY issued_at DESC LIMIT 6`);
  res.json({ kpi: k, perStage, perCourse, activity, recent });
}));

function filters(qs: any) {
  const f = z.object({
    level: z.enum(['intermediate', 'secondary']).optional(), grade: z.coerce.number().int().min(1).max(3).optional(),
    section: z.string().max(20).optional(), course_id: z.string().uuid().optional(), stage_id: z.coerce.number().int().min(1).max(7).optional(),
    from: z.string().date().optional(), to: z.string().date().optional(), status: z.enum(['completed', 'in_progress', 'not_started', 'failed']).optional(),
  }).parse(qs);
  const p: unknown[] = []; const w: string[] = ["u.role='student'"];
  if (f.level) { p.push(f.level); w.push(`cl.level=$${p.length}`); }
  if (f.grade) { p.push(f.grade); w.push(`cl.grade=$${p.length}`); }
  if (f.section) { p.push(f.section); w.push(`cl.section=$${p.length}`); }
  return { f, p, w: w.join(' AND ') };
}
/** Date range on an activity column, in Riyadh local dates. */
function range(col: string, f: any, p: unknown[]) {
  const parts: string[] = [];
  if (f.from) { p.push(f.from); parts.push(`(${col} AT TIME ZONE 'Asia/Riyadh')::date >= $${p.length}::date`); }
  if (f.to) { p.push(f.to); parts.push(`(${col} AT TIME ZONE 'Asia/Riyadh')::date <= $${p.length}::date`); }
  return parts.length ? ' AND ' + parts.join(' AND ') : '';
}

reports.get('/reports/journey', ah(async (req, res) => {
  const { f, p, w } = filters(req.query);
  const pr = [...p];
  const rd = range('a.finished_at', f, pr);
  const stages = await q(`
    WITH st AS (SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE ${w})
    SELECT s.id, s.title,
      (SELECT count(*) FROM stage_progress x WHERE x.stage_id=s.id AND x.student_id IN (SELECT id FROM st))::int AS started,
      (SELECT count(*) FROM stage_progress x WHERE x.stage_id=s.id AND x.status='completed' AND x.student_id IN (SELECT id FROM st))::int AS completed,
      (SELECT round(avg(a.score_pct),1) FROM stage_attempts a WHERE a.stage_id=s.id AND a.status IN ('passed','failed') AND a.student_id IN (SELECT id FROM st) ${rd}) AS avg_score,
      (SELECT count(*) FROM stage_attempts a WHERE a.stage_id=s.id AND a.student_id IN (SELECT id FROM st) ${rd})::int AS attempts,
      (SELECT count(*) FROM certificates c WHERE c.stage_id=s.id AND c.kind='stage' AND c.status='valid' AND c.student_id IN (SELECT id FROM st))::int AS certificates,
      (SELECT count(*) FROM st)::int AS population
    FROM stages s ${f.stage_id ? `WHERE s.id=${Number(f.stage_id)}` : ''} ORDER BY s.id`, pr);
  const hardest = await q(`
    WITH st AS (SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE ${w})
    SELECT s.title AS stage, sc.title, sc.kind, round(avg(r.points::numeric / nullif(r.max_points,0))*100,1) AS avg_pct, count(*)::int AS answers
    FROM stage_responses r JOIN scenarios sc ON sc.id=r.scenario_id JOIN stages s ON s.id=sc.stage_id JOIN stage_attempts a ON a.id=r.attempt_id
    WHERE a.student_id IN (SELECT id FROM st) ${f.stage_id ? `AND s.id=${Number(f.stage_id)}` : ''} ${rd}
    GROUP BY s.id, sc.id HAVING count(*) > 0 ORDER BY avg_pct ASC LIMIT 8`, pr);
  const studentsRows = await q(`
    SELECT u.id, u.full_name, sp.student_code, cl.level::text AS level, cl.grade, cl.section,
      count(p.*) FILTER (WHERE p.status='completed')::int AS completed, count(p.*)::int AS started, round(avg(p.best_score),1) AS avg_best
    FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
    LEFT JOIN stage_progress p ON p.student_id=u.id ${f.stage_id ? `AND p.stage_id=${Number(f.stage_id)}` : ''}
    WHERE ${w} GROUP BY u.id, sp.student_code, cl.id ORDER BY cl.grade, cl.section, u.full_name`, p);
  const total = f.stage_id ? 1 : 7;
  let rows = studentsRows.map((r) => ({ ...r, journey_status: r.completed >= total ? 'completed' : r.started === 0 ? 'not_started' : 'in_progress' }));
  if (f.status) rows = rows.filter((r) => r.journey_status === f.status);
  const L: Record<string, string> = { completed: 'أكملت', not_started: 'لم تبدأ', in_progress: 'قيد التقدم' };
  if (req.query.format) return sendTable(res, String(req.query.format), 'تقرير-رحلة-الوعي', [
    ['الطالبة', 'full_name'], ['الرقم', 'student_code'], ['المرحلة الدراسية', (r: any) => levelLabel(r.level)], ['الصف/الفصل', (r: any) => `${r.grade}/${r.section}`],
    ['المراحل المكتملة', 'completed'], ['المراحل التي بدأتها', 'started'], ['متوسط أفضل درجة', 'avg_best'], ['الحالة', (r: any) => L[r.journey_status]]], rows);
  res.json({ stages, hardest, students: rows.map((r) => ({ ...r, statusLabel: L[r.journey_status] })),
    summary: { not_started: rows.filter((r) => r.journey_status === 'not_started').length, completed: rows.filter((r) => r.journey_status === 'completed').length } });
}));

reports.get('/reports/courses', ah(async (req, res) => {
  const { f, p, w } = filters(req.query);
  const pr = [...p];
  const rd = range('e.enrolled_at', f, pr);
  const rows = await q(`
    WITH st AS (SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE ${w})
    SELECT c.id, c.title, c.publish_state,
      count(e.*)::int AS enrolled,
      count(e.*) FILTER (WHERE e.last_activity_at > now() - interval '14 days')::int AS active,
      count(e.completed_at)::int AS completed,
      CASE WHEN count(e.*)>0 THEN round(count(e.completed_at)::numeric / count(e.*) * 100, 1) ELSE 0 END AS completion_rate,
      (SELECT round(avg(t.score_pct),1) FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE a.course_id=c.id AND t.status='graded' AND t.student_id IN (SELECT id FROM st)) AS avg_score,
      (SELECT count(DISTINCT t.student_id) FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE a.course_id=c.id AND a.is_final AND t.passed AND t.student_id IN (SELECT id FROM st))::int AS passed,
      (SELECT count(*) FROM certificates x WHERE x.course_id=c.id AND x.status='valid' AND x.student_id IN (SELECT id FROM st))::int AS certificates
    FROM courses c LEFT JOIN course_enrollments e ON e.course_id=c.id AND e.student_id IN (SELECT id FROM st) ${rd}
    WHERE c.publish_state<>'draft' ${f.course_id ? `AND c.id='${f.course_id}'` : ''}
    GROUP BY c.id ORDER BY enrolled DESC`, pr);
  if (req.query.format) return sendTable(res, String(req.query.format), 'تقرير-الدورات', [
    ['الدورة', 'title'], ['المسجلات', 'enrolled'], ['النشطات', 'active'], ['المكتملات', 'completed'], ['نسبة الإكمال %', 'completion_rate'],
    ['متوسط الدرجات %', 'avg_score'], ['المجتازات', 'passed'], ['الشهادات', 'certificates']], rows);
  res.json(rows);
}));

// ----------------------------------------------------------- certificates
reports.get('/certificates', ah(async (req, res) => {
  const f = z.object({ kind: z.enum(['stage', 'journey', 'course']).optional(), status: z.enum(['valid', 'revoked']).optional(), search: z.string().max(100).optional(), format: z.enum(['csv', 'xlsx']).optional() }).parse(req.query);
  const p: unknown[] = []; const w: string[] = [];
  if (f.kind) { p.push(f.kind); w.push(`c.kind=$${p.length}`); }
  if (f.status) { p.push(f.status); w.push(`c.status=$${p.length}`); }
  if (f.search) { p.push(`%${f.search}%`); w.push(`(c.student_name ILIKE $${p.length} OR c.serial ILIKE $${p.length} OR c.title ILIKE $${p.length})`); }
  const rows = await q(`SELECT c.id, c.serial, c.verify_token, c.kind, c.title, c.student_name, c.student_id, c.issued_at, c.status, c.revoked_at, c.revoke_reason
    FROM certificates c ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.issued_at DESC`, p);
  const K: Record<string, string> = { stage: 'شهادة مرحلة', journey: 'سفيرة الوعي الرقمي', course: 'شهادة دورة' };
  if (f.format) return sendTable(res, f.format, 'الشهادات', [['الطالبة', 'student_name'], ['النوع', (r: any) => K[r.kind]], ['المرحلة/الدورة', 'title'],
    ['تاريخ الإصدار', 'issued_at'], ['رقم الشهادة', 'serial'], ['الحالة', (r: any) => (r.status === 'valid' ? 'سارية' : 'ملغاة')]], rows);
  res.json(rows.map(({ verify_token, ...r }) => ({ ...r, kindLabel: K[r.kind], verifyUrl: verifyUrl(r.serial, verify_token) })));
}));

reports.post('/certificates/:id/revoke', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(5, 'اكتبي سبب الإلغاء').max(500) }).parse(req.body);
  await tx(async (c) => {
    const { rows: [r] } = await c.query("UPDATE certificates SET status='revoked', revoked_at=now(), revoked_by=$2, revoke_reason=$3 WHERE id=$1 AND status='valid' RETURNING *", [id, req.user!.id, reason]);
    if (!r) throw bad('الشهادة غير موجودة أو ملغاة مسبقًا');
    await audit(req.user!.id, 'certificate.revoke', 'certificate', id, { serial: r.serial, reason }, req.ip, c);
    await notify([r.student_id], { kind: 'certificate_revoked', title: `تم إلغاء شهادة «${r.title}»`, body: reason, link: '/student/certificates' }, c);
  });
  res.json({ ok: true });
}));
reports.post('/certificates/:id/reinstate', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const r = await q1("UPDATE certificates SET status='valid', revoked_at=NULL, revoked_by=NULL, revoke_reason=NULL WHERE id=$1 AND status='revoked' RETURNING serial", [id]);
  if (!r) throw notFound();
  await audit(req.user!.id, 'certificate.reinstate', 'certificate', id, { serial: r.serial }, req.ip);
  res.json({ ok: true });
}));

// ------------------------------------------------------------- audit log
reports.get('/audit', ah(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  res.json(await q(`SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at, u.full_name AS actor
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT $1`, [limit]));
}));

reports.put('/profile', ah(async (req, res) => {
  const b = z.object({ full_name: z.string().trim().min(3).max(120), school_name: z.string().max(200).default('') }).parse(req.body);
  await q('UPDATE users SET full_name=$1 WHERE id=$2', [b.full_name, req.user!.id]);
  await q(`INSERT INTO teacher_profiles(user_id, display_name, school_name) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, school_name=EXCLUDED.school_name`,
    [req.user!.id, b.full_name, b.school_name]);
  res.json({ ok: true });
}));
