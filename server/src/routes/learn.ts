/** Student side of the training courses (LMS). */
import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, requireAuth, bad, forbidden, notFound, notify, teacherIds, HttpError } from '../lib/core.js';
import { studentCtx } from '../lib/journey.js';
import { courseStatus, visibleToStudent, contentOpen, evaluateCourse, ENROLL_LABEL, COURSE_STATUS_LABEL } from '../lib/courses.js';
import { publicQuestion, grade } from '../lib/grading.js';

export const learn = Router();
learn.use(requireAuth('student'));

const PUBLIC_COURSE = `c.id, c.title, c.short_desc, c.long_desc, c.objectives, c.skills, c.cover_file_id, c.instructor_name,
  c.level_label, c.duration_hours, c.enroll_start, c.enroll_end, c.content_start, c.course_end, c.pass_score,
  c.require_all_lessons, c.require_unit_tests, c.require_final_pass, c.publish_state, c.target_level, c.target_grades`;

learn.get('/courses', ah(async (req, res) => {
  const stu = await studentCtx(req.user!.id);
  const rows = await q(`SELECT ${PUBLIC_COURSE},
      (SELECT count(*) FROM course_modules m JOIN lessons l ON l.module_id=m.id WHERE m.course_id=c.id)::int AS lesson_count,
      e.id AS enrollment_id
    FROM courses c LEFT JOIN course_enrollments e ON e.course_id=c.id AND e.student_id=$1
    WHERE c.publish_state='published' ORDER BY c.created_at DESC`, [stu.id]);
  const list = rows.filter((c) => visibleToStudent(c, stu) || c.enrollment_id).map((c) => {
    const st = courseStatus(c);
    return { ...c, status: st, statusLabel: COURSE_STATUS_LABEL[st], enrolled: !!c.enrollment_id,
      canEnroll: !c.enrollment_id && st === 'published' };
  });
  res.json(list);
}));

async function loadVisibleCourse(id: string, userId: string) {
  const stu = await studentCtx(userId);
  const c = await q1(`SELECT ${PUBLIC_COURSE} FROM courses c WHERE c.id=$1`, [id]);
  if (!c) throw notFound('الدورة غير موجودة');
  const enr = await q1('SELECT * FROM course_enrollments WHERE course_id=$1 AND student_id=$2', [id, userId]);
  if (!enr && !visibleToStudent(c, stu)) throw notFound('الدورة غير موجودة');
  if (enr && c.publish_state === 'draft') throw notFound('الدورة غير موجودة');
  return { c, enr, stu };
}

learn.get('/courses/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { c, enr } = await loadVisibleCourse(id, req.user!.id);
  const modules = await q(
    `SELECT m.id, m.title, m.position,
       coalesce(json_agg(json_build_object('id', l.id, 'title', l.title, 'kind', l.kind, 'duration_min', l.duration_min, 'is_mandatory', l.is_mandatory) ORDER BY l.position) FILTER (WHERE l.id IS NOT NULL), '[]') AS lessons
     FROM course_modules m LEFT JOIN lessons l ON l.module_id=m.id WHERE m.course_id=$1 GROUP BY m.id ORDER BY m.position`, [id]);
  const tests = await q('SELECT id, title, module_id, is_final, pass_score FROM assessments WHERE course_id=$1 AND is_published', [id]);
  const st = courseStatus(c);
  res.json({ course: { ...c, status: st, statusLabel: COURSE_STATUS_LABEL[st] }, modules, tests, enrolled: !!enr,
    canEnroll: !enr && st === 'published', contentAvailable: contentOpen(c) });
}));

learn.post('/courses/:id/enroll', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { c, enr } = await loadVisibleCourse(id, req.user!.id);
  if (enr) throw new HttpError(409, 'أنتِ مسجلة في هذه الدورة مسبقًا');
  const st = courseStatus(c);
  if (st !== 'published') throw new HttpError(403, st === 'scheduled' ? 'لم يبدأ التسجيل بعد' : 'التسجيل في هذه الدورة مغلق');
  await tx(async (t) => {
    await t.query('INSERT INTO course_enrollments(course_id, student_id) VALUES ($1,$2)', [id, req.user!.id]); // UNIQUE blocks duplicates
    await notify([req.user!.id], { kind: 'enrolled', title: `تم تسجيلك في دورة «${c.title}»`, link: `/student/courses/${id}/learn`, dedupe: `enr:${id}` }, t);
    await notify(await teacherIds(t), { kind: 'enrolled', title: `سجّلت ${req.user!.name} في دورة «${c.title}»`, link: `/teacher/courses/${id}`, dedupe: `t-enr:${id}:${req.user!.id}` }, t);
  });
  res.json({ ok: true, message: 'تم تسجيلك في الدورة بنجاح' });
}));

learn.get('/my-courses', ah(async (req, res) => {
  const rows = await q(`SELECT ${PUBLIC_COURSE}, e.enrolled_at, e.last_lesson_id, e.completed_at
     FROM course_enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=$1 AND c.publish_state<>'draft' ORDER BY e.enrolled_at DESC`, [req.user!.id]);
  const out = [];
  for (const c of rows) {
    const ev = await evaluateCourse(null, c.id, req.user!.id);
    const last = await q1(
      `SELECT at.score_pct, a.title FROM assessment_attempts at JOIN assessments a ON a.id=at.assessment_id
       WHERE a.course_id=$1 AND at.student_id=$2 AND at.status='graded' ORDER BY at.submitted_at DESC LIMIT 1`, [c.id, req.user!.id]);
    out.push({ ...c, progress: ev?.progress ?? 0, status: ev?.status, statusLabel: ENROLL_LABEL[ev?.status ?? 'not_started'],
      lessonsDone: ev?.lessons.done ?? 0, lessonsTotal: ev?.lessons.total ?? 0, lastTest: last ?? null });
  }
  res.json(out);
}));

/** Full learning view: structure + progress. Requires enrolment and content window. */
learn.get('/courses/:id/learn', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { c, enr } = await loadVisibleCourse(id, req.user!.id);
  if (!enr) throw forbidden('يجب التسجيل في الدورة أولًا');
  const open = contentOpen(c);
  const modules = await q(
    `SELECT m.id, m.title, m.position,
       coalesce(json_agg(json_build_object('id', l.id, 'title', l.title, 'kind', l.kind, 'duration_min', l.duration_min,
         'is_mandatory', l.is_mandatory, 'done', lp.lesson_id IS NOT NULL) ORDER BY l.position) FILTER (WHERE l.id IS NOT NULL), '[]') AS lessons
     FROM course_modules m LEFT JOIN lessons l ON l.module_id=m.id
     LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.student_id=$2
     WHERE m.course_id=$1 GROUP BY m.id ORDER BY m.position`, [id, req.user!.id]);
  const tests = await q(
    `SELECT a.id, a.title, a.description, a.module_id, a.is_final, a.pass_score, a.max_attempts, a.time_limit_min, a.open_at, a.close_at,
       (SELECT count(*) FROM assessment_questions WHERE assessment_id=a.id)::int AS question_count,
       (SELECT count(*) FROM assessment_attempts WHERE assessment_id=a.id AND student_id=$2 AND status<>'in_progress')::int AS used,
       (SELECT max(score_pct) FROM assessment_attempts WHERE assessment_id=a.id AND student_id=$2 AND status='graded') AS best,
       (SELECT bool_or(passed) FROM assessment_attempts WHERE assessment_id=a.id AND student_id=$2) AS passed,
       (SELECT bool_or(status='pending_review') FROM assessment_attempts WHERE assessment_id=a.id AND student_id=$2) AS pending,
       (SELECT id FROM assessment_attempts WHERE assessment_id=a.id AND student_id=$2 AND status='in_progress') AS open_attempt
     FROM assessments a WHERE a.course_id=$1 AND a.is_published ORDER BY a.is_final, a.created_at`, [id, req.user!.id]);
  const ev = await evaluateCourse(null, id, req.user!.id);
  res.json({ course: c, contentAvailable: open, modules, tests, evaluation: ev && { ...ev, statusLabel: ENROLL_LABEL[ev.status] }, lastLessonId: enr.last_lesson_id });
}));

async function lessonForStudent(lessonId: string, userId: string) {
  const l = await q1('SELECT l.*, m.course_id FROM lessons l JOIN course_modules m ON m.id=l.module_id WHERE l.id=$1', [lessonId]);
  if (!l) throw notFound('الدرس غير موجود');
  const { c, enr } = await loadVisibleCourse(l.course_id, userId);
  if (!enr) throw forbidden('يجب التسجيل في الدورة أولًا');
  if (!contentOpen(c)) throw new HttpError(403, 'المحتوى غير متاح في هذا الوقت');
  return { l, c, enr };
}

learn.get('/lessons/:id', ah(async (req, res) => {
  const { l } = await lessonForStudent(z.string().uuid().parse(req.params.id), req.user!.id);
  const file = l.file_id ? await q1('SELECT id, original_name, mime, size_bytes FROM files WHERE id=$1', [l.file_id]) : null;
  await q('UPDATE course_enrollments SET last_lesson_id=$1, last_activity_at=now() WHERE course_id=$2 AND student_id=$3', [l.id, l.course_id, req.user!.id]);
  const done = await q1('SELECT 1 FROM lesson_progress WHERE lesson_id=$1 AND student_id=$2', [l.id, req.user!.id]);
  res.json({ id: l.id, title: l.title, kind: l.kind, body: l.body, url: l.url, downloadable: l.downloadable, is_mandatory: l.is_mandatory, duration_min: l.duration_min, file, done: !!done });
}));

learn.post('/lessons/:id/complete', ah(async (req, res) => {
  const { l } = await lessonForStudent(z.string().uuid().parse(req.params.id), req.user!.id);
  const ev = await tx(async (t) => {
    await t.query('INSERT INTO lesson_progress(student_id, lesson_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.id, l.id]);
    return evaluateCourse(t, l.course_id, req.user!.id);
  });
  res.json({ ok: true, progress: ev?.progress, status: ev?.status, certificateId: ev?.certificate?.id ?? null });
}));

// ------------------------------------------------------------- assessments
async function assessmentForStudent(id: string, userId: string) {
  const a = await q1('SELECT * FROM assessments WHERE id=$1 AND is_published', [id]);
  if (!a) throw notFound('الاختبار غير موجود');
  const { c, enr } = await loadVisibleCourse(a.course_id, userId);
  if (!enr) throw forbidden('يجب التسجيل في الدورة أولًا');
  return { a, c };
}

learn.post('/assessments/:id/start', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { a, c } = await assessmentForStudent(id, req.user!.id);
  const now = new Date();
  if (!contentOpen(c, now)) throw new HttpError(403, 'الدورة غير متاحة في هذا الوقت');
  if (a.open_at && now < a.open_at) throw new HttpError(403, 'لم يُفتح الاختبار بعد');
  if (a.close_at && now >= a.close_at) throw new HttpError(403, 'أُغلق الاختبار');
  const out = await tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`asmt:${id}:${req.user!.id}`]);
    const { rows: [open] } = await t.query("SELECT * FROM assessment_attempts WHERE assessment_id=$1 AND student_id=$2 AND status='in_progress'", [id, req.user!.id]);
    let att = open;
    if (!att) {
      const { rows: [st] } = await t.query(
        `SELECT count(*)::int AS n, bool_or(passed) AS passed, bool_or(status='pending_review') AS pending FROM assessment_attempts WHERE assessment_id=$1 AND student_id=$2`, [id, req.user!.id]);
      if (st.passed) throw bad('اجتزتِ هذا الاختبار مسبقًا');
      if (st.pending) throw bad('محاولتك السابقة بانتظار التصحيح');
      if (st.n >= a.max_attempts) throw new HttpError(403, 'استنفدتِ عدد المحاولات المسموح بها');
      const { rows: qs } = await t.query('SELECT question_id FROM assessment_questions WHERE assessment_id=$1 ORDER BY position', [id]);
      if (!qs.length) throw bad('لا يحتوي الاختبار على أسئلة بعد');
      let order = qs.map((r: any) => r.question_id);
      if (a.shuffle) order = order.sort(() => Math.random() - 0.5);
      const deadline = a.time_limit_min ? new Date(now.getTime() + a.time_limit_min * 60000) : null;
      const effDeadline = deadline && a.close_at && a.close_at < deadline ? a.close_at : deadline ?? a.close_at ?? null;
      ({ rows: [att] } = await t.query(
        'INSERT INTO assessment_attempts(assessment_id, student_id, attempt_no, question_order, deadline_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [id, req.user!.id, st.n + 1, order, effDeadline]));
    }
    const { rows: questions } = await t.query('SELECT * FROM questions WHERE id = ANY($1)', [att.question_order]);
    const byId = new Map(questions.map((x: any) => [x.id, x]));
    const { rows: saved } = await t.query('SELECT question_id, response FROM assessment_answers WHERE attempt_id=$1', [att.id]);
    return {
      attemptId: att.id, attemptNo: att.attempt_no, deadline: att.deadline_at, title: a.title, description: a.description,
      questions: att.question_order.map((qid: string) => publicQuestion(byId.get(qid))),
      saved: Object.fromEntries(saved.map((s: any) => [s.question_id, s.response])),
    };
  });
  res.json(out);
}));

async function ownAttempt(t: any, attemptId: string, userId: string) {
  const { rows: [att] } = await t.query('SELECT * FROM assessment_attempts WHERE id=$1 FOR UPDATE', [attemptId]);
  if (!att) throw notFound();
  if (att.student_id !== userId) throw forbidden();
  return att;
}
const GRACE_MS = 30_000;

learn.put('/attempts/:id/answer', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { questionId, response } = z.object({ questionId: z.string().uuid(), response: z.any() }).parse(req.body);
  if (JSON.stringify(response ?? null).length > 5000) throw bad('الإجابة طويلة جدًا');
  await tx(async (t) => {
    const att = await ownAttempt(t, id, req.user!.id);
    if (att.status !== 'in_progress') throw bad('تم تسليم الاختبار');
    if (att.deadline_at && Date.now() > new Date(att.deadline_at).getTime() + GRACE_MS) throw new HttpError(403, 'انتهى وقت الاختبار');
    if (!att.question_order.includes(questionId)) throw bad('سؤال غير تابع لهذا الاختبار');
    await t.query(`INSERT INTO assessment_answers(attempt_id, question_id, response) VALUES ($1,$2,$3)
                   ON CONFLICT (attempt_id, question_id) DO UPDATE SET response=EXCLUDED.response`, [id, questionId, JSON.stringify(response ?? null)]);
  });
  res.json({ ok: true });
}));

/** Grades an attempt. Exported for the scheduled job (auto-submit when time runs out). */
export async function submitAttempt(t: any, att: any) {
  const { rows: qs } = await t.query('SELECT * FROM questions WHERE id = ANY($1)', [att.question_order]);
  const { rows: ans } = await t.query('SELECT * FROM assessment_answers WHERE attempt_id=$1', [att.id]);
  const resp = new Map(ans.map((a: any) => [a.question_id, a.response]));
  let score = 0; let max = 0; let review = false;
  for (const qq of qs) {
    max += Number(qq.points);
    const g = grade(qq, resp.get(qq.id));
    if (g.points === null) review = true; else score += g.points;
    await t.query(`INSERT INTO assessment_answers(attempt_id, question_id, response, auto_points, needs_review) VALUES ($1,$2,$3,$4,$5)
                   ON CONFLICT (attempt_id, question_id) DO UPDATE SET auto_points=EXCLUDED.auto_points, needs_review=EXCLUDED.needs_review`,
      [att.id, qq.id, JSON.stringify(resp.get(qq.id) ?? null), g.points, g.points === null]);
  }
  const { rows: [a] } = await t.query('SELECT * FROM assessments WHERE id=$1', [att.assessment_id]);
  const pct = max ? Math.round((score / max) * 10000) / 100 : 0;
  if (review) {
    await t.query("UPDATE assessment_attempts SET status='pending_review', submitted_at=now(), score=$2, max_score=$3 WHERE id=$1", [att.id, score, max]);
    await notify(await teacherIds(t), { kind: 'needs_grading', title: `إجابات تحتاج إلى تصحيح يدوي — ${a.title}`, link: '/teacher/assessments?tab=grading', dedupe: `grade:${att.id}` }, t);
  } else {
    await t.query("UPDATE assessment_attempts SET status='graded', submitted_at=now(), score=$2, max_score=$3, score_pct=$4, passed=$5 WHERE id=$1",
      [att.id, score, max, pct, pct >= a.pass_score]);
  }
  const ev = await evaluateCourse(t, a.course_id, att.student_id);
  return { a, pct, review, ev };
}

learn.post('/attempts/:id/submit', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const out = await tx(async (t) => {
    const att = await ownAttempt(t, id, req.user!.id);
    if (att.status !== 'in_progress') throw bad('تم تسليم الاختبار مسبقًا');
    const { a, pct, review, ev } = await submitAttempt(t, att);
    return { status: review ? 'pending_review' : 'graded', scorePct: a.show_result && !review ? pct : null, passed: a.show_result && !review ? pct >= a.pass_score : null,
      passScore: a.pass_score, courseStatus: ev?.status, certificateId: ev?.certificate?.id ?? null };
  });
  res.json(out);
}));

learn.get('/attempts/:id/result', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const att = await q1('SELECT * FROM assessment_attempts WHERE id=$1', [id]);
  if (!att) throw notFound();
  if (att.student_id !== req.user!.id) throw forbidden();
  if (att.status === 'in_progress') throw bad('لم يتم التسليم بعد');
  const a = await q1('SELECT * FROM assessments WHERE id=$1', [att.assessment_id]);
  const now = new Date();
  const revealAnswers = a.show_answers === 'after_submit' || (a.show_answers === 'after_close' && a.close_at && now >= a.close_at);
  const rows = await q(
    `SELECT qq.id, qq.qtype, qq.text, qq.options, qq.points, qq.explanation, qq.answer, aa.response, aa.auto_points, aa.manual_points, aa.needs_review, aa.feedback
     FROM unnest($2::uuid[]) WITH ORDINALITY o(qid, pos) JOIN questions qq ON qq.id=o.qid
     LEFT JOIN assessment_answers aa ON aa.question_id=qq.id AND aa.attempt_id=$1 ORDER BY o.pos`, [id, att.question_order]);
  res.json({
    title: a.title, status: att.status, showResult: a.show_result, revealAnswers,
    scorePct: a.show_result ? att.score_pct : null, passed: a.show_result ? att.passed : null, passScore: a.pass_score,
    items: rows.map((r) => ({
      id: r.id, qtype: r.qtype, text: r.text, options: r.options, points: r.points, response: r.response, feedback: r.feedback,
      earned: a.show_result ? (r.manual_points ?? r.auto_points) : null, needsReview: r.needs_review && r.manual_points === null,
      answer: revealAnswers ? r.answer : undefined, explanation: revealAnswers ? r.explanation : undefined,
    })),
  });
}));

learn.get('/assessments/:id/attempts', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await assessmentForStudent(id, req.user!.id);
  res.json(await q('SELECT id, attempt_no, status, score_pct, passed, submitted_at FROM assessment_attempts WHERE assessment_id=$1 AND student_id=$2 ORDER BY attempt_no DESC', [id, req.user!.id]));
}));
