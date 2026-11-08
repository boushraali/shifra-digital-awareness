import { Router } from 'express';
import { z } from 'zod';
import { ah, q, q1, tx, bad, notFound, audit, notify } from '../../lib/core.js';
import { questionSchema } from '../../lib/grading.js';
import { evaluateCourse } from '../../lib/courses.js';
import { sendTable } from './exporting.js';

export const assessments = Router();

// ------------------------------------------------------------- questions
assessments.get('/questions', ah(async (req, res) => {
  const f = z.object({ course_id: z.string().uuid().optional(), module_id: z.string().uuid().optional() }).parse(req.query);
  const p: unknown[] = []; const w: string[] = [];
  if (f.course_id) { p.push(f.course_id); w.push(`q.course_id=$${p.length}`); }
  if (f.module_id) { p.push(f.module_id); w.push(`q.module_id=$${p.length}`); }
  res.json(await q(`SELECT q.*, c.title AS course_title, m.title AS module_title FROM questions q JOIN courses c ON c.id=q.course_id
    LEFT JOIN course_modules m ON m.id=q.module_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY q.created_at DESC`, p));
}));
assessments.post('/questions', ah(async (req, res) => {
  const b = questionSchema.and(z.object({ course_id: z.string().uuid() })).parse(req.body);
  const r = await q1(`INSERT INTO questions(course_id, module_id, qtype, text, options, answer, points, explanation, difficulty)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.course_id, b.module_id ?? null, b.qtype, b.text, JSON.stringify(b.options ?? []), JSON.stringify(b.answer ?? {}), b.points, b.explanation, b.difficulty]);
  res.status(201).json(r);
}));
assessments.put('/questions/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const b = questionSchema.parse(req.body);
  const used = await q1(`SELECT count(*)::int AS n FROM assessment_answers WHERE question_id=$1`, [id]);
  const r = await q1(`UPDATE questions SET module_id=$2, qtype=$3, text=$4, options=$5, answer=$6, points=$7, explanation=$8, difficulty=$9 WHERE id=$1 RETURNING *`,
    [id, b.module_id ?? null, b.qtype, b.text, JSON.stringify(b.options ?? []), JSON.stringify(b.answer ?? {}), b.points, b.explanation, b.difficulty]);
  if (!r) throw notFound();
  if (used.n) await audit(req.user!.id, 'question.update_answered', 'question', id, { answers: used.n }, req.ip);
  res.json(r);
}));
assessments.delete('/questions/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const used = await q1('SELECT count(*)::int AS n FROM assessment_answers WHERE question_id=$1', [id]);
  if (used.n) throw bad('لا يمكن حذف سؤال أجابت عنه طالبات. أزيليه من الاختبار بدلًا من ذلك.');
  await q('DELETE FROM questions WHERE id=$1', [id]);
  res.json({ ok: true });
}));

// ----------------------------------------------------------- assessments
const dt = z.string().datetime({ offset: true }).nullable().optional();
const asmtSchema = z.object({
  course_id: z.string().uuid(),
  module_id: z.string().uuid().nullable().optional(),
  is_final: z.boolean().default(false),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).default(''),
  pass_score: z.number().int().min(0).max(100),
  max_attempts: z.number().int().min(1).max(20),
  time_limit_min: z.number().int().min(1).max(600).nullable().optional(),
  shuffle: z.boolean().default(false),
  show_result: z.boolean().default(true),
  show_answers: z.enum(['after_submit', 'after_close', 'never']).default('after_submit'),
  open_at: dt, close_at: dt,
  is_published: z.boolean().default(true),
  question_ids: z.array(z.string().uuid()).max(200).default([]),
});

assessments.get('/', ah(async (req, res) => {
  const f = z.object({ course_id: z.string().uuid().optional() }).parse(req.query);
  res.json(await q(`SELECT a.*, c.title AS course_title, m.title AS module_title,
      (SELECT count(*) FROM assessment_questions x WHERE x.assessment_id=a.id)::int AS question_count,
      (SELECT count(*) FROM assessment_attempts t WHERE t.assessment_id=a.id AND t.status<>'in_progress')::int AS submissions,
      (SELECT count(*) FROM assessment_attempts t WHERE t.assessment_id=a.id AND t.status='pending_review')::int AS pending
    FROM assessments a JOIN courses c ON c.id=a.course_id LEFT JOIN course_modules m ON m.id=a.module_id
    ${f.course_id ? 'WHERE a.course_id=$1' : ''} ORDER BY c.title, a.is_final, a.created_at`, f.course_id ? [f.course_id] : []));
}));
assessments.get('/item/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const a = await q1('SELECT * FROM assessments WHERE id=$1', [id]);
  if (!a) throw notFound();
  const qs = await q('SELECT question_id FROM assessment_questions WHERE assessment_id=$1 ORDER BY position', [id]);
  res.json({ ...a, question_ids: qs.map((x) => x.question_id) });
}));

async function saveAssessment(id: string | null, b: z.infer<typeof asmtSchema>) {
  return tx(async (c) => {
    if (b.question_ids.length) {
      const { rows } = await c.query('SELECT count(*)::int AS n FROM questions WHERE id = ANY($1) AND course_id=$2', [b.question_ids, b.course_id]);
      if (rows[0].n !== b.question_ids.length) throw bad('بعض الأسئلة لا تنتمي إلى هذه الدورة');
    }
    const vals = [b.course_id, b.is_final ? null : b.module_id ?? null, b.is_final, b.title, b.description, b.pass_score, b.max_attempts, b.time_limit_min ?? null,
      b.shuffle, b.show_result, b.show_answers, b.open_at ?? null, b.close_at ?? null, b.is_published];
    let row;
    if (id) {
      ({ rows: [row] } = await c.query(`UPDATE assessments SET course_id=$2, module_id=$3, is_final=$4, title=$5, description=$6, pass_score=$7, max_attempts=$8,
        time_limit_min=$9, shuffle=$10, show_result=$11, show_answers=$12, open_at=$13, close_at=$14, is_published=$15 WHERE id=$1 RETURNING *`, [id, ...vals]));
      if (!row) throw notFound();
    } else {
      ({ rows: [row] } = await c.query(`INSERT INTO assessments(course_id, module_id, is_final, title, description, pass_score, max_attempts, time_limit_min,
        shuffle, show_result, show_answers, open_at, close_at, is_published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, vals));
    }
    await c.query('DELETE FROM assessment_questions WHERE assessment_id=$1', [row.id]);
    for (const [i, qid] of b.question_ids.entries())
      await c.query('INSERT INTO assessment_questions(assessment_id, question_id, position) VALUES ($1,$2,$3)', [row.id, qid, i + 1]);
    return row;
  });
}
assessments.post('/', ah(async (req, res) => {
  const b = asmtSchema.parse(req.body);
  const r = await saveAssessment(null, b);
  await audit(req.user!.id, 'assessment.create', 'assessment', r.id, { title: r.title }, req.ip);
  res.status(201).json(r);
}));
assessments.put('/item/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const r = await saveAssessment(id, asmtSchema.parse(req.body));
  await audit(req.user!.id, 'assessment.update', 'assessment', id, { title: r.title }, req.ip);
  res.json(r);
}));
assessments.delete('/item/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const n = await q1("SELECT count(*)::int AS n FROM assessment_attempts WHERE assessment_id=$1", [id]);
  if (n.n) throw bad('لا يمكن حذف اختبار له محاولات. يمكنك إلغاء نشره.');
  await q('DELETE FROM assessments WHERE id=$1', [id]);
  await audit(req.user!.id, 'assessment.delete', 'assessment', id, {}, req.ip);
  res.json({ ok: true });
}));

// -------------------------------------------------------------- results
assessments.get('/results', ah(async (req, res) => {
  const f = z.object({ course_id: z.string().uuid().optional(), assessment_id: z.string().uuid().optional(), format: z.enum(['csv', 'xlsx']).optional() }).parse(req.query);
  const p: unknown[] = []; const w = ["t.status <> 'in_progress'"];
  if (f.course_id) { p.push(f.course_id); w.push(`a.course_id=$${p.length}`); }
  if (f.assessment_id) { p.push(f.assessment_id); w.push(`a.id=$${p.length}`); }
  const rows = await q(`SELECT t.id, u.full_name, sp.student_code, c.title AS course_title, a.title AS assessment_title, t.score, t.max_score, t.score_pct,
      t.attempt_no, t.submitted_at, t.status, t.passed, a.pass_score
    FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id JOIN courses c ON c.id=a.course_id
    JOIN users u ON u.id=t.student_id JOIN student_profiles sp ON sp.user_id=u.id
    WHERE ${w.join(' AND ')} ORDER BY t.submitted_at DESC`, p);
  const S = (r: any) => (r.status === 'pending_review' ? 'بانتظار التصحيح' : r.passed ? 'ناجحة' : 'لم تجتز');
  if (f.format) return sendTable(res, f.format, 'نتائج-الاختبارات', [
    ['الطالبة', 'full_name'], ['الرقم', 'student_code'], ['الدورة', 'course_title'], ['الاختبار', 'assessment_title'],
    ['الدرجة', (r: any) => `${r.score ?? '-'} / ${r.max_score ?? '-'}`], ['النسبة %', 'score_pct'], ['المحاولة', 'attempt_no'],
    ['تاريخ التقديم', 'submitted_at'], ['حالة الاجتياز', S]], rows);
  res.json(rows.map((r) => ({ ...r, statusLabel: S(r) })));
}));

/** Answers waiting for manual grading. */
assessments.get('/grading', ah(async (_req, res) => {
  res.json(await q(`SELECT aa.attempt_id, aa.question_id, aa.response, qq.text, qq.points, qq.answer, u.full_name, a.title AS assessment_title, c.title AS course_title, t.submitted_at
    FROM assessment_answers aa JOIN assessment_attempts t ON t.id=aa.attempt_id JOIN questions qq ON qq.id=aa.question_id
    JOIN assessments a ON a.id=t.assessment_id JOIN courses c ON c.id=a.course_id JOIN users u ON u.id=t.student_id
    WHERE aa.needs_review AND aa.manual_points IS NULL AND t.status='pending_review' ORDER BY t.submitted_at`));
}));

assessments.post('/grading/:attemptId', ah(async (req, res) => {
  const attemptId = z.string().uuid().parse(req.params.attemptId);
  const b = z.object({ question_id: z.string().uuid(), points: z.number().min(0), feedback: z.string().max(1000).default('') }).parse(req.body);
  const out = await tx(async (c) => {
    const { rows: [ans] } = await c.query(`SELECT aa.*, qq.points AS max FROM assessment_answers aa JOIN questions qq ON qq.id=aa.question_id
      WHERE aa.attempt_id=$1 AND aa.question_id=$2 FOR UPDATE`, [attemptId, b.question_id]);
    if (!ans) throw notFound();
    if (b.points > Number(ans.max)) throw bad(`الحد الأقصى لدرجة هذا السؤال ${ans.max}`);
    await c.query('UPDATE assessment_answers SET manual_points=$3, feedback=$4, graded_by=$5, graded_at=now() WHERE attempt_id=$1 AND question_id=$2',
      [attemptId, b.question_id, b.points, b.feedback, req.user!.id]);
    const { rows: [left] } = await c.query('SELECT count(*)::int AS n FROM assessment_answers WHERE attempt_id=$1 AND needs_review AND manual_points IS NULL', [attemptId]);
    let finalized = false;
    if (left.n === 0) {
      const { rows: [t] } = await c.query(`SELECT t.*, a.pass_score, a.course_id, a.title FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=$1 FOR UPDATE`, [attemptId]);
      const { rows: [s] } = await c.query('SELECT coalesce(sum(coalesce(manual_points, auto_points, 0)),0) AS score FROM assessment_answers WHERE attempt_id=$1', [attemptId]);
      const pct = t.max_score ? Math.round((Number(s.score) / Number(t.max_score)) * 10000) / 100 : 0;
      await c.query("UPDATE assessment_attempts SET status='graded', score=$2, score_pct=$3, passed=$4 WHERE id=$1", [attemptId, s.score, pct, pct >= t.pass_score]);
      await notify([t.student_id], { kind: 'graded', title: `تم تصحيح اختبار «${t.title}»`, body: `نتيجتك ${pct}%`, link: `/student/courses/${t.course_id}/learn`, dedupe: `graded:${attemptId}` }, c);
      await evaluateCourse(c, t.course_id, t.student_id);
      finalized = true;
    }
    await audit(req.user!.id, 'assessment.manual_grade', 'attempt', attemptId, { question: b.question_id, points: b.points }, req.ip, c);
    return { finalized };
  });
  res.json(out);
}));
