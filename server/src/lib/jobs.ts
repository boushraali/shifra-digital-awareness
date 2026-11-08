/** Scheduled jobs (run every minute inside the API process). Stage/course availability itself is computed live
 *  from the stored dates on every request, so opening/closing is automatic even if a job run is missed;
 *  these jobs handle notifications and closing stale attempts. */
import { q, tx, notify, teacherIds } from './core.js';
import { submitAttempt } from '../routes/learn.js';

export async function targetedStudentIds(stageId: number): Promise<string[]> {
  const rows = await q(`
    SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
    JOIN stage_schedules s ON s.stage_id=$1
    WHERE u.role='student' AND u.is_active AND (
      s.target_type='all'
      OR (s.target_type='level' AND cl.level=s.target_level)
      OR (s.target_type='grade' AND cl.level=s.target_level AND cl.grade=s.target_grade)
      OR (s.target_type='class' AND cl.id=s.target_class_id)
      OR (s.target_type='students' AND EXISTS (SELECT 1 FROM stage_target_students t WHERE t.stage_id=s.stage_id AND t.student_id=u.id))
      OR EXISTS (SELECT 1 FROM stage_exceptions e WHERE e.stage_id=s.stage_id AND e.student_id=u.id AND e.grant_access))`, [stageId]);
  return rows.map((r) => r.id);
}

export async function runJobs(now = new Date()) {
  // 1) stage opened → notify targeted students
  for (const s of await q(`SELECT sc.stage_id, st.title, sc.close_at FROM stage_schedules sc JOIN stages st ON st.id=sc.stage_id
      WHERE sc.publish_state='published' AND (sc.open_at IS NULL OR sc.open_at <= $1) AND (sc.close_at IS NULL OR sc.close_at > $1) AND sc.open_notified_at IS NULL`, [now])) {
    const ids = await targetedStudentIds(s.stage_id);
    await tx(async (c) => {
      await notify(ids, { kind: 'stage_opened', title: `تم فتح مرحلة جديدة: «${s.title}» 🚪`, body: 'انطلقي الآن في المغامرة!', link: `/student/journey`, dedupe: `open:${s.stage_id}:${now.toISOString().slice(0, 13)}` }, c);
      await c.query('UPDATE stage_schedules SET open_notified_at=$2 WHERE stage_id=$1', [s.stage_id, now]);
    });
  }
  // 2) stage closes within 24h → remind students who have not completed + tell teachers how many are left
  for (const s of await q(`SELECT sc.stage_id, st.title, sc.close_at FROM stage_schedules sc JOIN stages st ON st.id=sc.stage_id
      WHERE sc.publish_state='published' AND sc.close_at > $1 AND sc.close_at <= $1 + interval '24 hours' AND sc.closing_notified_at IS NULL
        AND (sc.open_at IS NULL OR sc.open_at <= $1)`, [now])) {
    const ids = await targetedStudentIds(s.stage_id);
    const done = new Set((await q("SELECT student_id FROM stage_progress WHERE stage_id=$1 AND status='completed'", [s.stage_id])).map((r) => r.student_id));
    const pending = ids.filter((i) => !done.has(i));
    await tx(async (c) => {
      await notify(pending, { kind: 'stage_closing', title: `اقترب موعد إغلاق مرحلة «${s.title}» ⏳`, body: 'تبقّى أقل من 24 ساعة', link: '/student/journey', dedupe: `closing:${s.stage_id}:${new Date(s.close_at).toISOString()}` }, c);
      await notify(await teacherIds(c), { kind: 'stage_closing', title: `اقتراب إغلاق مرحلة «${s.title}»`, body: `${pending.length} طالبة لم يكملن المرحلة بعد`, link: `/teacher/stages`, dedupe: `t-closing:${s.stage_id}:${new Date(s.close_at).toISOString()}` }, c);
      await c.query('UPDATE stage_schedules SET closing_notified_at=$2 WHERE stage_id=$1', [s.stage_id, now]);
    });
  }
  // 3) close attempts that outlived the stage window
  await q(`UPDATE stage_attempts a SET status='expired', finished_at=$1
           FROM stage_schedules s WHERE s.stage_id=a.stage_id AND a.status='in_progress'
             AND ((s.close_at IS NOT NULL AND s.close_at <= $1
                   AND NOT EXISTS (SELECT 1 FROM stage_exceptions e WHERE e.stage_id=a.stage_id AND e.student_id=a.student_id AND e.close_at_override > $1))
                  OR s.publish_state='closed' AND NOT EXISTS (SELECT 1 FROM stage_exceptions e WHERE e.stage_id=a.stage_id AND e.student_id=a.student_id AND e.grant_access))`, [now]);
  // 4) course published & registration open → notify eligible students
  for (const c of await q(`SELECT * FROM courses WHERE publish_state='published' AND NOT published_notified AND (enroll_start IS NULL OR enroll_start <= $1)
      AND (enroll_end IS NULL OR enroll_end > $1)`, [now])) {
    const ids = (await q(`SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN classes cl ON cl.id=sp.class_id
      WHERE u.role='student' AND u.is_active AND ($1::school_level IS NULL OR cl.level=$1) AND (cardinality($2::smallint[])=0 OR cl.grade = ANY($2))`,
      [c.target_level, c.target_grades])).map((r) => r.id);
    await tx(async (t) => {
      await notify(ids, { kind: 'course_published', title: `تم نشر دورة جديدة: «${c.title}» 📚`, link: `/student/courses/${c.id}`, dedupe: `course:${c.id}` }, t);
      await t.query('UPDATE courses SET published_notified=true WHERE id=$1', [c.id]);
    });
  }
  // 5) course ends within 3 days → remind enrolled students who have not completed
  for (const c of await q(`SELECT id, title, course_end FROM courses WHERE publish_state='published' AND course_end > $1 AND course_end <= $1 + interval '3 days'`, [now])) {
    const ids = (await q('SELECT student_id FROM course_enrollments WHERE course_id=$1 AND completed_at IS NULL', [c.id])).map((r) => r.student_id);
    await notify(ids, { kind: 'course_ending', title: `اقترب موعد انتهاء دورة «${c.title}»`, body: 'أكملي دروسك واختباراتك قبل انتهاء المدة', link: `/student/courses/${c.id}/learn`, dedupe: `courseend:${c.id}` });
  }
  // 6) auto-submit timed-out test attempts
  for (const a of await q(`SELECT * FROM assessment_attempts WHERE status='in_progress' AND deadline_at IS NOT NULL AND deadline_at + interval '30 seconds' < $1`, [now])) {
    await tx(async (t) => {
      const { rows: [locked] } = await t.query("SELECT * FROM assessment_attempts WHERE id=$1 AND status='in_progress' FOR UPDATE", [a.id]);
      if (locked) await submitAttempt(t, locked);
    });
  }
}

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runJobs(); } catch (e) { console.error('[jobs]', e); } finally { running = false; }
  };
  setTimeout(tick, 2000);
  return setInterval(tick, 60_000);
}
