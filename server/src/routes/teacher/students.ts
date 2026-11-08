import { Router } from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ah, q, q1, tx, bad, notFound, audit, tempPassword, type Tx, levelLabel, gradeLabel } from '../../lib/core.js';
import { upload, validateUpload } from '../../lib/uploads.js';
import { stageAccess, studentCtx } from '../../lib/journey.js';
import { evaluateCourse, ENROLL_LABEL } from '../../lib/courses.js';
import { sendTable } from './exporting.js';

export const students = Router();

const LEVELS: Record<string, 'intermediate' | 'secondary'> = {
  intermediate: 'intermediate', secondary: 'secondary', 'متوسط': 'intermediate', 'المتوسطة': 'intermediate', 'متوسطة': 'intermediate',
  'ثانوي': 'secondary', 'الثانوية': 'secondary', 'ثانوية': 'secondary',
};
const GRADES: Record<string, number> = { '1': 1, '2': 2, '3': 3, 'الأول': 1, 'الاول': 1, 'أول': 1, 'الثاني': 2, 'ثاني': 2, 'الثالث': 3, 'ثالث': 3 };

const studentInput = z.object({
  full_name: z.string().trim().min(3, 'الاسم قصير جدًا').max(120),
  level: z.string().transform((v, ctx) => { const l = LEVELS[v.trim()]; if (!l) ctx.addIssue({ code: 'custom', message: 'المرحلة الدراسية غير صحيحة' }); return l!; }),
  grade: z.union([z.string(), z.number()]).transform((v, ctx) => { const g = GRADES[String(v).trim()]; if (!g) ctx.addIssue({ code: 'custom', message: 'الصف غير صحيح' }); return g!; }),
  section: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1, 'الفصل مطلوب').max(20)),
  student_code: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^[A-Za-z0-9-]{3,30}$/, 'الرقم التعريفي: حروف إنجليزية وأرقام فقط')).optional().or(z.literal('').transform(() => undefined)),
});

async function classId(c: Tx, level: string, grade: number, section: string) {
  const { rows: [r] } = await c.query(
    `INSERT INTO classes(level, grade, section) VALUES ($1,$2,$3) ON CONFLICT (level, grade, section) DO UPDATE SET section=EXCLUDED.section RETURNING id`,
    [level, grade, section]);
  return r.id as number;
}
async function newCode(c: Tx) {
  for (;;) {
    const code = `S${new Date().getFullYear() % 100}${crypto.randomInt(10000, 99999)}`;
    const { rows } = await c.query('SELECT 1 FROM users WHERE lower(username)=lower($1)', [code]);
    if (!rows.length) return code;
  }
}
/** Creates one student. Returns the one-time temporary password (shown once to the teacher, never stored in clear). */
async function createStudent(c: Tx, s: z.infer<typeof studentInput>, teacherId: string) {
  const code = s.student_code ?? (await newCode(c));
  const pwd = tempPassword();
  const hash = await bcrypt.hash(pwd, 10);
  const cid = await classId(c, s.level, s.grade, s.section);
  const { rows: [u] } = await c.query(
    `INSERT INTO users(role, username, password_hash, full_name, must_change_password) VALUES ('student',$1,$2,$3,true) RETURNING id`,
    [code, hash, s.full_name]);
  await c.query('INSERT INTO student_profiles(user_id, student_code, class_id, created_by) VALUES ($1,$2,$3,$4)', [u.id, code, cid, teacherId]);
  return { id: u.id, full_name: s.full_name, student_code: code, temp_password: pwd, level: s.level, grade: s.grade, section: s.section };
}

const LIST_SQL = `
  SELECT u.id, u.full_name, sp.student_code, u.is_active, u.created_at, u.last_login_at, u.is_demo,
         cl.id AS class_id, cl.level::text AS level, cl.grade, cl.section,
         (SELECT count(*) FROM stage_progress p WHERE p.student_id=u.id AND p.status='completed')::int AS stages_completed,
         (SELECT count(*) FROM stage_progress p WHERE p.student_id=u.id)::int AS stages_started,
         (SELECT count(*) FROM course_enrollments e WHERE e.student_id=u.id)::int AS courses_enrolled,
         (SELECT count(*) FROM course_enrollments e WHERE e.student_id=u.id AND e.completed_at IS NOT NULL)::int AS courses_completed,
         (SELECT count(*) FROM certificates c WHERE c.student_id=u.id AND c.status='valid')::int AS certificates
  FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
  WHERE u.role='student'`;

function listFilters(qs: any) {
  const f = z.object({
    search: z.string().max(100).optional(), level: z.enum(['intermediate', 'secondary']).optional(),
    grade: z.coerce.number().int().min(1).max(3).optional(), section: z.string().max(20).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  }).parse(qs);
  const where: string[] = []; const p: unknown[] = [];
  if (f.search) { p.push(`%${f.search}%`); where.push(`(u.full_name ILIKE $${p.length} OR sp.student_code ILIKE $${p.length})`); }
  if (f.level) { p.push(f.level); where.push(`cl.level=$${p.length}`); }
  if (f.grade) { p.push(f.grade); where.push(`cl.grade=$${p.length}`); }
  if (f.section) { p.push(f.section); where.push(`cl.section=$${p.length}`); }
  if (f.status) where.push(f.status === 'active' ? 'u.is_active' : 'NOT u.is_active');
  return { sql: LIST_SQL + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY cl.level, cl.grade, cl.section, u.full_name', p };
}

students.get('/', ah(async (req, res) => {
  const { sql, p } = listFilters(req.query);
  res.json(await q(sql, p));
}));

students.get('/classes', ah(async (_req, res) => {
  res.json(await q(`SELECT cl.*, cl.level::text AS level, (SELECT count(*) FROM student_profiles sp WHERE sp.class_id=cl.id)::int AS students FROM classes cl ORDER BY cl.level, cl.grade, cl.section`));
}));

students.get('/export', ah(async (req, res) => {
  const { sql, p } = listFilters(req.query);
  const rows = await q(sql, p);
  await sendTable(res, String(req.query.format ?? 'csv'), 'تقرير-الطالبات', [
    ['الاسم', 'full_name'], ['الرقم التعريفي', 'student_code'], ['المرحلة', (r: any) => levelLabel(r.level)], ['الصف', (r: any) => gradeLabel(r.grade)],
    ['الفصل', 'section'], ['الحالة', (r: any) => (r.is_active ? 'مفعل' : 'معطل')], ['المراحل المكتملة', 'stages_completed'],
    ['الدورات المسجلة', 'courses_enrolled'], ['الدورات المكتملة', 'courses_completed'], ['الشهادات', 'certificates'],
  ], rows);
}));

students.post('/', ah(async (req, res) => {
  const s = studentInput.parse(req.body);
  const out = await tx(async (c) => {
    const r = await createStudent(c, s, req.user!.id);
    await audit(req.user!.id, 'student.create', 'user', r.id, { code: r.student_code }, req.ip, c);
    return r;
  });
  res.status(201).json(out);
}));

/** Bulk create: all-or-nothing per request, with per-row validation errors returned. */
async function bulkCreate(rows: unknown[], teacherId: string, ip?: string) {
  const errors: { row: number; message: string }[] = [];
  const parsed: z.infer<typeof studentInput>[] = [];
  rows.forEach((r, i) => {
    const p = studentInput.safeParse(r);
    if (p.success) parsed.push(p.data); else errors.push({ row: i + 1, message: p.error.issues.map((x) => x.message).join('، ') });
  });
  const codes = parsed.map((p) => p.student_code).filter(Boolean) as string[];
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupes.length) errors.push({ row: 0, message: `أرقام تعريفية مكررة في الملف: ${[...new Set(dupes)].join(', ')}` });
  if (codes.length) {
    const exist = await q('SELECT username FROM users WHERE lower(username) = ANY($1)', [codes.map((c) => c.toLowerCase())]);
    if (exist.length) errors.push({ row: 0, message: `أرقام تعريفية مستخدمة مسبقًا: ${exist.map((e) => e.username).join(', ')}` });
  }
  if (errors.length) return { created: [], errors };
  const created = await tx(async (c) => {
    const out = [];
    for (const p of parsed) out.push(await createStudent(c, p, teacherId));
    await audit(teacherId, 'student.bulk_create', 'user', null, { count: out.length }, ip, c);
    return out;
  });
  return { created, errors: [] };
}

students.post('/bulk', ah(async (req, res) => {
  const { rows } = z.object({ rows: z.array(z.any()).min(1).max(500) }).parse(req.body);
  const r = await bulkCreate(rows, req.user!.id, req.ip);
  res.status(r.errors.length ? 422 : 201).json(r);
}));

/** CSV/XLSX import. Expected headers (Arabic or English): الاسم/full_name، المرحلة/level، الصف/grade، الفصل/section، الرقم التعريفي/student_code (اختياري) */
students.post('/import', upload.single('file'), ah(async (req, res) => {
  const { name } = validateUpload(req.file, 'import');
  const full = req.file!.path; // temp file, deleted below
  const wb = new ExcelJS.Workbook();
  try {
    if (name.toLowerCase().endsWith('.csv')) {
      // strip UTF-8 BOM that Excel adds
      const txt = fs.readFileSync(full, 'utf8').replace(/^﻿/, '');
      fs.writeFileSync(full, txt, 'utf8');
      await wb.csv.readFile(full);
    } else await wb.xlsx.readFile(full);
  } catch { throw bad('تعذّرت قراءة الملف. تأكدي من أنه CSV أو Excel صالح'); }
  finally { fs.rmSync(full, { force: true }); }
  const ws = wb.worksheets[0];
  if (!ws) throw bad('الملف فارغ');
  const MAP: Record<string, string> = {
    'الاسم': 'full_name', 'اسم الطالبة': 'full_name', name: 'full_name', full_name: 'full_name',
    'المرحلة': 'level', 'المرحلة الدراسية': 'level', level: 'level',
    'الصف': 'grade', grade: 'grade', 'الفصل': 'section', section: 'section', class: 'section',
    'الرقم التعريفي': 'student_code', 'الرقم': 'student_code', student_code: 'student_code', code: 'student_code',
  };
  const header: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { header[col] = MAP[String(cell.value ?? '').trim()] ?? MAP[String(cell.value ?? '').trim().toLowerCase()] ?? ''; });
  if (!header.includes('full_name') || !header.includes('level') || !header.includes('grade') || !header.includes('section'))
    throw bad('يجب أن يحتوي الصف الأول على الأعمدة: الاسم، المرحلة، الصف، الفصل');
  const rows: any[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o: any = {};
    row.eachCell((cell, col) => { if (header[col]) o[header[col]] = cell.text?.trim?.() ?? String(cell.value ?? ''); });
    if (Object.values(o).some((v) => String(v).trim())) rows.push(o);
  });
  if (!rows.length) throw bad('لا توجد بيانات في الملف');
  if (rows.length > 1000) throw bad('الحد الأقصى 1000 طالبة في الملف الواحد');
  const r = await bulkCreate(rows, req.user!.id, req.ip);
  res.status(r.errors.length ? 422 : 201).json(r);
}));

students.patch('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    full_name: z.string().trim().min(3).max(120).optional(), is_active: z.boolean().optional(),
    level: z.enum(['intermediate', 'secondary']).optional(), grade: z.number().int().min(1).max(3).optional(), section: z.string().trim().min(1).max(20).optional(),
  }).parse(req.body);
  await tx(async (c) => {
    const { rows: [u] } = await c.query(`SELECT u.*, cl.level::text AS level, cl.grade, cl.section FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id WHERE u.id=$1 AND u.role='student'`, [id]);
    if (!u) throw notFound('الطالبة غير موجودة');
    if (body.full_name) await c.query('UPDATE users SET full_name=$1 WHERE id=$2', [body.full_name, id]);
    if (body.is_active !== undefined) await c.query('UPDATE users SET is_active=$1, token_version=token_version+1 WHERE id=$2', [body.is_active, id]);
    if (body.level || body.grade || body.section) {
      const cid = await classId(c, body.level ?? u.level, body.grade ?? u.grade, body.section ?? u.section);
      await c.query('UPDATE student_profiles SET class_id=$1 WHERE user_id=$2', [cid, id]);
    }
    await audit(req.user!.id, body.is_active === false ? 'student.disable' : body.is_active ? 'student.enable' : 'student.update', 'user', id, body, req.ip, c);
  });
  res.json({ ok: true });
}));

students.post('/:id/reset-password', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const pwd = tempPassword();
  const r = await q("UPDATE users SET password_hash=$1, must_change_password=true, token_version=token_version+1 WHERE id=$2 AND role='student' RETURNING username", [await bcrypt.hash(pwd, 10), id]);
  if (!r.length) throw notFound();
  await audit(req.user!.id, 'student.reset_password', 'user', id, {}, req.ip);
  res.json({ username: r[0].username, temp_password: pwd });
}));

/** Full learning profile of one student. */
students.get('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const s = await q1(LIST_SQL + ' AND u.id=$1', [id]);
  if (!s) throw notFound('الطالبة غير موجودة');
  const stu = await studentCtx(id);
  const stagesRows = await q('SELECT id, title, color FROM stages ORDER BY id');
  const stages = [];
  for (const st of stagesRows) {
    const a = await stageAccess(stu, st.id);
    const att = await q('SELECT attempt_no, status, score_pct, started_at, finished_at FROM stage_attempts WHERE stage_id=$1 AND student_id=$2 ORDER BY attempt_no', [st.id, id]);
    const ex = await q1('SELECT * FROM stage_exceptions WHERE stage_id=$1 AND student_id=$2', [st.id, id]);
    stages.push({ ...st, state: a.state, attempts: att, attemptsLeft: a.attemptsLeft, progress: a.progress, exception: ex ?? null });
  }
  const courses = [];
  for (const c of await q('SELECT c.id, c.title, e.enrolled_at, e.completed_at FROM course_enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=$1', [id])) {
    const ev = await evaluateCourse(null, c.id, id);
    const tests = await q(`SELECT a.title, at.attempt_no, at.score_pct, at.passed, at.status, at.submitted_at
      FROM assessment_attempts at JOIN assessments a ON a.id=at.assessment_id WHERE a.course_id=$1 AND at.student_id=$2 ORDER BY at.submitted_at`, [c.id, id]);
    courses.push({ ...c, progress: ev?.progress, status: ev?.status, statusLabel: ENROLL_LABEL[ev?.status ?? 'not_started'], tests });
  }
  const certificates = await q('SELECT id, serial, kind, title, issued_at, status FROM certificates WHERE student_id=$1 ORDER BY issued_at', [id]);
  const points = await q1('SELECT coalesce(sum(points),0)::int AS p FROM achievements WHERE student_id=$1', [id]);
  res.json({ student: s, stages, courses, certificates, points: points.p });
}));
