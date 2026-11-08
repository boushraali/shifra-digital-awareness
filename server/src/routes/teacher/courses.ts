import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, bad, notFound, audit } from '../../lib/core.js';
import { upload, registerFile } from '../../lib/uploads.js';
import { courseStatus, COURSE_STATUS_LABEL, evaluateCourse, ENROLL_LABEL } from '../../lib/courses.js';
import { sendTable } from './exporting.js';

export const courses = Router();

const dt = z.string().datetime({ offset: true }).nullable().optional();
const courseSchema = z.object({
  title: z.string().trim().min(3, 'عنوان الدورة قصير').max(200),
  short_desc: z.string().max(400).default(''),
  long_desc: z.string().max(10000).default(''),
  objectives: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  cover_file_id: z.string().uuid().nullable().optional(),
  instructor_name: z.string().trim().min(2).max(120),
  target_level: z.enum(['intermediate', 'secondary']).nullable().optional(),
  target_grades: z.array(z.number().int().min(1).max(3)).max(3).default([]),
  level_label: z.string().max(40).default('مبتدئ'),
  duration_hours: z.number().min(0.5).max(500),
  enroll_start: dt, enroll_end: dt, content_start: dt, course_end: dt,
  pass_score: z.number().int().min(0).max(100).default(70),
  max_attempts: z.number().int().min(1).max(20).default(3),
  require_all_lessons: z.boolean().default(true),
  require_unit_tests: z.boolean().default(false),
  require_final_pass: z.boolean().default(true),
  publish_state: z.enum(['draft', 'published', 'archived']).default('draft'),
}).superRefine((v, ctx) => {
  const t = (s?: string | null) => (s ? new Date(s).getTime() : null);
  if (t(v.enroll_start) && t(v.enroll_end) && t(v.enroll_end)! <= t(v.enroll_start)!) ctx.addIssue({ code: 'custom', path: ['enroll_end'], message: 'تاريخ إغلاق التسجيل يجب أن يكون بعد بدايته' });
  if (t(v.content_start) && t(v.course_end) && t(v.course_end)! <= t(v.content_start)!) ctx.addIssue({ code: 'custom', path: ['course_end'], message: 'تاريخ انتهاء الدورة يجب أن يكون بعد إتاحة المحتوى' });
});
const COLS = ['title', 'short_desc', 'long_desc', 'objectives', 'skills', 'cover_file_id', 'instructor_name', 'target_level', 'target_grades', 'level_label',
  'duration_hours', 'enroll_start', 'enroll_end', 'content_start', 'course_end', 'pass_score', 'max_attempts', 'require_all_lessons', 'require_unit_tests',
  'require_final_pass', 'publish_state'] as const;

courses.get('/', ah(async (_req, res) => {
  const rows = await q(`SELECT c.*,
      (SELECT count(*) FROM course_enrollments e WHERE e.course_id=c.id)::int AS enrolled,
      (SELECT count(*) FROM course_enrollments e WHERE e.course_id=c.id AND e.completed_at IS NOT NULL)::int AS completed,
      (SELECT count(*) FROM certificates x WHERE x.course_id=c.id AND x.status='valid')::int AS certificates,
      (SELECT count(*) FROM course_modules m WHERE m.course_id=c.id)::int AS modules,
      (SELECT count(*) FROM course_modules m JOIN lessons l ON l.module_id=m.id WHERE m.course_id=c.id)::int AS lessons
    FROM courses c ORDER BY c.created_at DESC`);
  res.json(rows.map((c) => { const s = courseStatus(c); return { ...c, status: s, statusLabel: COURSE_STATUS_LABEL[s] }; }));
}));

courses.post('/', ah(async (req, res) => {
  const b = courseSchema.parse(req.body);
  const vals = COLS.map((k) => (b as any)[k] ?? null);
  const r = await q1(`INSERT INTO courses(${COLS.join(',')}, created_by) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(',')}, $${COLS.length + 1}) RETURNING *`,
    [...vals.map((v, i) => (COLS[i] === 'target_grades' || COLS[i] === 'objectives' || COLS[i] === 'skills' ? v ?? [] : v)), req.user!.id]);
  await audit(req.user!.id, 'course.create', 'course', r.id, { title: r.title, publish_state: r.publish_state }, req.ip);
  res.status(201).json(r);
}));

courses.put('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const b = courseSchema.parse(req.body);
  const before = await q1('SELECT publish_state FROM courses WHERE id=$1', [id]);
  if (!before) throw notFound();
  const r = await q1(`UPDATE courses SET ${COLS.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, ...COLS.map((k) => (b as any)[k] ?? (k === 'target_grades' || k === 'objectives' || k === 'skills' ? [] : null))]);
  await audit(req.user!.id, before.publish_state !== r.publish_state ? `course.${r.publish_state}` : 'course.update', 'course', id, { title: r.title }, req.ip);
  res.json(r);
}));

courses.delete('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const n = await q1('SELECT count(*)::int AS n FROM course_enrollments WHERE course_id=$1', [id]);
  if (n.n > 0) throw bad('لا يمكن حذف دورة بها تسجيلات — يمكنك أرشفتها بدلًا من ذلك');
  await q('DELETE FROM courses WHERE id=$1', [id]);
  await audit(req.user!.id, 'course.delete', 'course', id, {}, req.ip);
  res.json({ ok: true });
}));

/** Everything about a course (used by the content builder and the «preview as student» view). */
courses.get('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const c = await q1('SELECT * FROM courses WHERE id=$1', [id]);
  if (!c) throw notFound();
  const modules = await q(`SELECT m.*, coalesce(json_agg(json_build_object('id', l.id, 'title', l.title, 'kind', l.kind, 'body', l.body, 'url', l.url,
      'file_id', l.file_id, 'file_name', f.original_name, 'file_mime', f.mime, 'downloadable', l.downloadable, 'is_mandatory', l.is_mandatory,
      'duration_min', l.duration_min, 'position', l.position) ORDER BY l.position) FILTER (WHERE l.id IS NOT NULL), '[]') AS lessons
    FROM course_modules m LEFT JOIN lessons l ON l.module_id=m.id LEFT JOIN files f ON f.id=l.file_id
    WHERE m.course_id=$1 GROUP BY m.id ORDER BY m.position`, [id]);
  const tests = await q(`SELECT a.*, (SELECT count(*) FROM assessment_questions WHERE assessment_id=a.id)::int AS question_count FROM assessments a WHERE course_id=$1 ORDER BY is_final, created_at`, [id]);
  const s = courseStatus(c);
  res.json({ course: { ...c, status: s, statusLabel: COURSE_STATUS_LABEL[s] }, modules, tests });
}));

courses.get('/:id/enrollments', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const rows = await q(`SELECT e.*, u.full_name, sp.student_code, cl.grade, cl.section FROM course_enrollments e JOIN users u ON u.id=e.student_id
    JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE e.course_id=$1 ORDER BY e.enrolled_at DESC`, [id]);
  for (const r of rows) {
    const ev = await evaluateCourse(null, id, r.student_id);
    Object.assign(r, { progress: ev?.progress, status: ev?.status, statusLabel: ENROLL_LABEL[ev?.status ?? 'not_started'] });
  }
  if (req.query.format) return sendTable(res, String(req.query.format), 'تسجيلات-الدورة', [
    ['الطالبة', 'full_name'], ['الرقم', 'student_code'], ['الفصل', (r: any) => `${r.grade}/${r.section}`], ['تاريخ التسجيل', 'enrolled_at'],
    ['نسبة الإنجاز %', 'progress'], ['الحالة', 'statusLabel'], ['تاريخ الإكمال', 'completed_at']], rows);
  res.json(rows);
}));

// ---------------------------------------------------------------- modules
courses.post('/:id/modules', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { title } = z.object({ title: z.string().trim().min(2).max(200) }).parse(req.body);
  const r = await q1(`INSERT INTO course_modules(course_id, title, position) VALUES ($1,$2,(SELECT coalesce(max(position),0)+1 FROM course_modules WHERE course_id=$1)) RETURNING *`, [id, title]);
  res.status(201).json(r);
}));
courses.patch('/modules/:mid', ah(async (req, res) => {
  const mid = z.string().uuid().parse(req.params.mid);
  const { title } = z.object({ title: z.string().trim().min(2).max(200) }).parse(req.body);
  res.json(await q1('UPDATE course_modules SET title=$1 WHERE id=$2 RETURNING *', [title, mid]));
}));
courses.delete('/modules/:mid', ah(async (req, res) => {
  const mid = z.string().uuid().parse(req.params.mid);
  await q('DELETE FROM course_modules WHERE id=$1', [mid]);
  await audit(req.user!.id, 'module.delete', 'module', mid, {}, req.ip);
  res.json({ ok: true });
}));
/** Reorder modules, or lessons inside a module: body = { ids: [...] } in the new order. */
courses.post('/:id/modules/reorder', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
  await tx(async (c) => { for (const [i, mid] of ids.entries()) await c.query('UPDATE course_modules SET position=$1 WHERE id=$2 AND course_id=$3', [i + 1, mid, id]); });
  res.json({ ok: true });
}));
courses.post('/modules/:mid/lessons/reorder', ah(async (req, res) => {
  const mid = z.string().uuid().parse(req.params.mid);
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
  await tx(async (c) => { for (const [i, lid] of ids.entries()) await c.query('UPDATE lessons SET position=$1 WHERE id=$2 AND module_id=$3', [i + 1, lid, mid]); });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- lessons
const lessonSchema = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(['text', 'video', 'file', 'link', 'image', 'activity']),
  body: z.string().max(50000).default(''),
  url: z.string().url().max(1000).refine((u) => /^https:\/\//.test(u), 'يجب أن يبدأ الرابط بـ https://').nullable().optional(),
  file_id: z.string().uuid().nullable().optional(),
  downloadable: z.boolean().default(true),
  is_mandatory: z.boolean().default(true),
  duration_min: z.number().int().min(1).max(600).default(10),
}).superRefine((v, ctx) => {
  if (v.kind === 'link' && !v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'أدخلي الرابط' });
  if (['file', 'image'].includes(v.kind) && !v.file_id) ctx.addIssue({ code: 'custom', path: ['file_id'], message: 'ارفعي الملف' });
  if (v.kind === 'video' && !v.file_id && !v.url) ctx.addIssue({ code: 'custom', path: ['file_id'], message: 'ارفعي ملف الفيديو أو أضيفي رابطه' });
  if (['text', 'activity'].includes(v.kind) && !v.body.trim()) ctx.addIssue({ code: 'custom', path: ['body'], message: 'اكتبي محتوى الدرس' });
});
courses.post('/modules/:mid/lessons', ah(async (req, res) => {
  const mid = z.string().uuid().parse(req.params.mid);
  const b = lessonSchema.parse(req.body);
  const r = await q1(`INSERT INTO lessons(module_id, title, kind, body, url, file_id, downloadable, is_mandatory, duration_min, position)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,(SELECT coalesce(max(position),0)+1 FROM lessons WHERE module_id=$1)) RETURNING *`,
    [mid, b.title, b.kind, b.body, b.url ?? null, b.file_id ?? null, b.downloadable, b.is_mandatory, b.duration_min]);
  res.status(201).json(r);
}));
courses.put('/lessons/:lid', ah(async (req, res) => {
  const lid = z.string().uuid().parse(req.params.lid);
  const b = lessonSchema.parse(req.body);
  const r = await q1(`UPDATE lessons SET title=$2, kind=$3, body=$4, url=$5, file_id=$6, downloadable=$7, is_mandatory=$8, duration_min=$9 WHERE id=$1 RETURNING *`,
    [lid, b.title, b.kind, b.body, b.url ?? null, b.file_id ?? null, b.downloadable, b.is_mandatory, b.duration_min]);
  if (!r) throw notFound();
  res.json(r);
}));
courses.delete('/lessons/:lid', ah(async (req, res) => {
  const lid = z.string().uuid().parse(req.params.lid);
  await q('DELETE FROM lessons WHERE id=$1', [lid]);
  await audit(req.user!.id, 'lesson.delete', 'lesson', lid, {}, req.ip);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- uploads
courses.post('/upload/:purpose', upload.single('file'), ah(async (req, res) => {
  const purpose = z.enum(['lesson', 'cover']).parse(req.params.purpose);
  const f = await registerFile(req.file, purpose, req.user!.id);
  await audit(req.user!.id, 'file.upload', 'file', f.id, { name: f.original_name, size: f.size_bytes }, req.ip);
  res.status(201).json(f);
}));
