import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, requireAuth, notFound, forbidden, levelLabel, gradeLabel } from '../lib/core.js';
import { sendFile } from '../lib/storage.js';
import { studentCtx } from '../lib/journey.js';
import { contentOpen, eligible } from '../lib/courses.js';
import { verifyUrl } from '../lib/certs.js';

export const common = Router();

// ---------------------------------------------------------- notifications
common.get('/notifications', requireAuth(), ah(async (req, res) => {
  res.json(await q('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user!.id]));
}));
common.post('/notifications/read', requireAuth(), ah(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()).max(200).optional() }).parse(req.body ?? {});
  if (ids?.length) await q('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2) AND read_at IS NULL', [req.user!.id, ids]);
  else await q('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]);
  res.json({ ok: true });
}));

// ----------------------------------------------------------- certificates
const CERT_COLS = `c.id, c.serial, c.verify_token, c.kind, c.student_id, c.stage_id, c.course_id, c.title, c.student_name, c.instructor_name,
  c.hours, c.score_pct, c.issued_at, c.status, c.revoked_at, c.revoke_reason`;

common.get('/certificates/mine', requireAuth('student'), ah(async (req, res) => {
  const rows = await q(`SELECT ${CERT_COLS} FROM certificates c WHERE c.student_id=$1 ORDER BY c.issued_at DESC`, [req.user!.id]);
  res.json(rows.map((r) => ({ ...r, verifyUrl: verifyUrl(r.serial, r.verify_token) })));
}));

/** Single certificate for rendering/printing — owner student or any teacher. */
common.get('/certificates/:id', requireAuth(), ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const r = await q1(`SELECT ${CERT_COLS} FROM certificates c WHERE c.id=$1`, [id]);
  if (!r) throw notFound();
  if (req.user!.role === 'student' && r.student_id !== req.user!.id) throw forbidden();
  res.json({ ...r, verifyUrl: verifyUrl(r.serial, r.verify_token) });
}));

/** Public verification (QR target). Requires serial + secret token to prevent enumeration. */
common.get('/verify/:serial', ah(async (req, res) => {
  const serial = z.string().max(40).parse(req.params.serial);
  const t = z.string().max(40).parse(req.query.t ?? '');
  const r = await q1('SELECT serial, kind, title, student_name, instructor_name, hours, issued_at, status, revoked_at, verify_token FROM certificates WHERE serial=$1', [serial]);
  if (!r || r.verify_token !== t) return res.status(404).json({ valid: false, error: 'لم يتم العثور على شهادة بهذه البيانات' });
  const { verify_token: _x, ...pub } = r;
  res.json({ valid: r.status === 'valid', certificate: pub });
}));

// ----------------------------------------------------------------- files
/** Authorised file delivery. Teachers: all files. Students: covers of visible courses, lesson files of enrolled courses. */
common.get('/files/:id', requireAuth(), ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const f = await q1('SELECT * FROM files WHERE id=$1', [id]);
  if (!f) throw notFound();
  let download = req.query.download === '1';
  if (req.user!.role === 'student') {
    const stu = await studentCtx(req.user!.id);
    if (f.purpose === 'cover') {
      const c = await q1("SELECT * FROM courses WHERE cover_file_id=$1 AND publish_state='published' LIMIT 1", [id]);
      if (!c || !eligible(c, stu)) throw forbidden();
    } else if (f.purpose === 'lesson') {
      const l = await q1(
        `SELECT l.downloadable, c.* FROM lessons l JOIN course_modules m ON m.id=l.module_id JOIN courses c ON c.id=m.course_id
         JOIN course_enrollments e ON e.course_id=c.id AND e.student_id=$2
         WHERE l.file_id=$1 AND c.publish_state<>'draft' LIMIT 1`, [id, req.user!.id]);
      if (!l || !contentOpen(l)) throw forbidden();
      if (download && !l.downloadable) throw forbidden('تحميل هذا الملف غير مسموح');
    } else throw forbidden();
  }
  const inlineOk = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|application\/pdf)$/.test(f.mime);
  if (!inlineOk) download = true;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`;
  // disk: streamed with HTTP Range support; object storage: redirect to a short-lived signed URL
  if (!(await sendFile(res, f.storage_key, { range: req.get('range') ?? undefined, mime: f.mime, disposition }))) {
    res.removeHeader('Content-Security-Policy');
    throw notFound('الملف غير موجود في التخزين');
  }
}));

// ------------------------------------------------------ student dashboard
common.get('/student/dashboard', requireAuth('student'), ah(async (req, res) => {
  const id = req.user!.id;
  const me = await q1(`SELECT u.full_name, sp.student_code, cl.level::text AS level, cl.grade, cl.section
    FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE u.id=$1`, [id]);
  const journey = await q1(`SELECT count(*) FILTER (WHERE status='completed')::int AS completed, count(*)::int AS started FROM stage_progress WHERE student_id=$1`, [id]);
  const courses = await q1(`SELECT count(*)::int AS enrolled, count(completed_at)::int AS completed FROM course_enrollments WHERE student_id=$1`, [id]);
  const certs = await q1(`SELECT count(*)::int AS n FROM certificates WHERE student_id=$1 AND status='valid'`, [id]);
  const pts = await q1(`SELECT coalesce(sum(points),0)::int AS points FROM achievements WHERE student_id=$1`, [id]);
  const last = await q1(`SELECT title, kind, created_at FROM achievements WHERE student_id=$1 AND kind IN ('badge','key') ORDER BY created_at DESC LIMIT 1`, [id]);
  const notes = await q('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 6', [id]);
  res.json({ me: { ...me, levelLabel: levelLabel(me.level), gradeLabel: gradeLabel(me.grade) }, journey, courses, certificates: certs.n, points: pts.points, lastAchievement: last ?? null, notifications: notes });
}));

common.get('/student/achievements', requireAuth('student'), ah(async (req, res) => {
  const rows = await q('SELECT kind, ref, title, points, created_at FROM achievements WHERE student_id=$1 ORDER BY created_at', [req.user!.id]);
  const stages = await q(`SELECT s.id, s.title, s.color, s.icon, s.badge_name, s.key_name, p.status, p.best_score
    FROM stages s LEFT JOIN stage_progress p ON p.stage_id=s.id AND p.student_id=$1 ORDER BY s.id`, [req.user!.id]);
  const courses = await q1(`SELECT count(*)::int AS enrolled, count(completed_at)::int AS completed FROM course_enrollments WHERE student_id=$1`, [req.user!.id]);
  res.json({ items: rows, stages, courses, totalPoints: rows.reduce((s, r) => s + r.points, 0) });
}));
