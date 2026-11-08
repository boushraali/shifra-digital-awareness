import { q, q1, type Tx, notify, teacherIds } from './core.js';
import { issueCertificate } from './certs.js';

export function courseStatus(c: any, now = new Date()) {
  if (c.publish_state === 'draft') return 'draft';
  if (c.publish_state === 'archived') return 'archived';
  if (c.course_end && now >= new Date(c.course_end)) return 'ended';
  if (c.enroll_start && now < new Date(c.enroll_start)) return 'scheduled';
  if (c.enroll_end && now >= new Date(c.enroll_end)) return 'enroll_closed';
  return 'published';
}
export const COURSE_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', published: 'منشورة', scheduled: 'مجدولة', enroll_closed: 'مغلقة للتسجيل', ended: 'منتهية', archived: 'مؤرشفة',
};

export function eligible(course: any, stu: { level: string; grade: number }) {
  if (course.target_level && course.target_level !== stu.level) return false;
  if (course.target_grades?.length && !course.target_grades.includes(stu.grade)) return false;
  return true;
}
/** Visible to students in the catalogue (published, not archived, targeted). */
export function visibleToStudent(course: any, stu: { level: string; grade: number }) {
  return course.publish_state === 'published' && eligible(course, stu);
}
export const contentOpen = (course: any, now = new Date()) =>
  (!course.content_start || now >= new Date(course.content_start)) && (!course.course_end || now < new Date(course.course_end));

/** Computes progress + completion for one enrolment, and issues the certificate when all rules are met. */
export async function evaluateCourse(c: Tx | null, courseId: string, studentId: string) {
  const run = async (sql: string, p: unknown[]) => (c ? (await c.query(sql, p)).rows : await q(sql, p));
  const [course] = await run('SELECT * FROM courses WHERE id=$1', [courseId]);
  const [enr] = await run('SELECT * FROM course_enrollments WHERE course_id=$1 AND student_id=$2', [courseId, studentId]);
  if (!course || !enr) return null;

  const [les] = await run(
    `SELECT count(*) FILTER (WHERE l.is_mandatory)::int AS mandatory,
            count(lp.lesson_id) FILTER (WHERE l.is_mandatory)::int AS mandatory_done,
            count(*)::int AS total, count(lp.lesson_id)::int AS done
     FROM lessons l JOIN course_modules m ON m.id=l.module_id
     LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.student_id=$2
     WHERE m.course_id=$1`, [courseId, studentId]);
  const tests = await run(
    `SELECT a.id, a.is_final, a.max_attempts,
            bool_or(at.passed) AS passed,
            bool_or(at.status='pending_review') AS pending,
            count(at.id) FILTER (WHERE at.status<>'in_progress')::int AS used,
            max(at.score_pct) AS best
     FROM assessments a LEFT JOIN assessment_attempts at ON at.assessment_id=a.id AND at.student_id=$2
     WHERE a.course_id=$1 AND a.is_published GROUP BY a.id`, [courseId, studentId]);
  const final = tests.find((t: any) => t.is_final);
  const units = tests.filter((t: any) => !t.is_final);

  const lessonsOk = !course.require_all_lessons || les.mandatory_done >= les.mandatory;
  const unitsOk = !course.require_unit_tests || units.every((u: any) => u.passed);
  const finalOk = !course.require_final_pass || !final || !!final.passed;
  const pending = tests.some((t: any) => t.pending);
  const finalFailed = !!final && !final.passed && !final.pending && final.used >= final.max_attempts;

  // progress = mandatory lessons + required tests
  const reqTests = [...(course.require_unit_tests ? units : []), ...(course.require_final_pass && final ? [final] : [])];
  const units_total = (les.mandatory || 0) + reqTests.length;
  const units_done = (les.mandatory_done || 0) + reqTests.filter((t: any) => t.passed).length;
  const progress = units_total ? Math.round((units_done / units_total) * 100) : 0;
  const complete = lessonsOk && unitsOk && finalOk && units_total > 0;

  let status: string;
  if (enr.completed_at) status = 'completed';
  else if (complete) status = 'completed';
  else if (pending) status = 'pending_review';
  else if (finalFailed) status = 'failed';
  else if (course.course_end && new Date() >= new Date(course.course_end)) status = 'ended';
  else if (les.done === 0 && !tests.some((t: any) => t.used > 0)) status = 'not_started';
  else status = 'in_progress';

  let certificate = null;
  if (complete && !enr.completed_at && c) {
    await c.query('UPDATE course_enrollments SET completed_at=now() WHERE id=$1', [enr.id]);
    const { rows: [u] } = await c.query('SELECT full_name FROM users WHERE id=$1', [studentId]);
    certificate = await issueCertificate(c, {
      kind: 'course', studentId, studentName: u.full_name, courseId, title: course.title,
      instructor: course.instructor_name, hours: course.duration_hours, score: final?.best ?? null,
    });
    await notify([studentId], { kind: 'course_completed', title: `اكتملت دورة «${course.title}» بنجاح 🎉`, link: '/student/certificates', dedupe: `coursedone:${courseId}` }, c);
    await notify(await teacherIds(c), { kind: 'course_completed', title: `أكملت ${u.full_name} دورة «${course.title}»`, link: `/teacher/students/${studentId}`, dedupe: `t-coursedone:${courseId}:${studentId}` }, c);
  }
  return { status, progress, lessons: les, tests, lessonsOk, unitsOk, finalOk, finalExists: !!final, certificate };
}

export const ENROLL_LABEL: Record<string, string> = {
  not_enrolled: 'لم تسجل', not_started: 'لم تبدأ', in_progress: 'قيد التقدم', pending_review: 'بانتظار تصحيح',
  completed: 'مكتملة', failed: 'لم تجتز', ended: 'انتهت مدة الدورة',
};

export async function studentCourseStatusList(studentId: string) {
  const rows = await q('SELECT course_id FROM course_enrollments WHERE student_id=$1', [studentId]);
  const out: Record<string, any> = {};
  for (const r of rows) out[r.course_id] = await evaluateCourse(null, r.course_id, studentId);
  return out;
}

export async function courseById(id: string) {
  return q1('SELECT * FROM courses WHERE id=$1', [id]);
}
