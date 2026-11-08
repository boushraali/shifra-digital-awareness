/** End-to-end API tests against a running server + seeded demo DB.
 *  Run: npm run seed:demo && npm start  (in another shell)  then  npm test */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const BASE = process.env.API ?? 'http://localhost:4000';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const creds = fs.readFileSync(path.join(process.env.STORAGE_DIR ?? './storage', 'demo-credentials.txt'), 'utf8');
const TPWD = /teacher@demo\.local\s+\/\s+(\S+)/.exec(creds)![1];
const SPWD = /للجميع[^:]*:\s*(\S+)/.exec(creds)![1];

let passed = 0; let failed = 0;
function ok(cond: unknown, name: string) {
  if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name); }
}

class Client {
  cookie = '';
  async req(method: string, url: string, body?: unknown, opts: { csrf?: boolean; raw?: boolean; form?: FormData } = {}) {
    const headers: Record<string, string> = { cookie: this.cookie };
    if (opts.csrf !== false) headers['X-Requested-With'] = 'shifra';
    let payload: any;
    if (opts.form) payload = opts.form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + url, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    if (opts.raw) return { status: r.status, text: await r.text(), headers: r.headers };
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j as any };
  }
  get(u: string) { return this.req('GET', u); }
  post(u: string, b?: unknown) { return this.req('POST', u, b ?? {}); }
  put(u: string, b: unknown) { return this.req('PUT', u, b); }
}

async function bestChoice(scenarioId: number) {
  const { rows } = await db.query('SELECT id, followup FROM scenario_choices WHERE scenario_id=$1 ORDER BY points DESC LIMIT 1', [scenarioId]);
  return rows[0].id as number;
}

const T = new Client(); const S = new Client(); const S2 = new Client(); const anon = new Client();

console.log('\n— Authentication & roles');
ok((await T.post('/api/auth/login', { role: 'teacher', username: 'teacher@demo.local', password: 'wrong' })).status === 401, 'wrong password rejected');
ok((await T.post('/api/auth/login', { role: 'student', username: 'teacher@demo.local', password: TPWD })).status === 401, 'teacher cannot log in through student role');
ok((await T.post('/api/auth/login', { role: 'teacher', username: 'teacher@demo.local', password: TPWD })).status === 200, 'teacher login');
ok((await S.post('/api/auth/login', { role: 'student', username: 'DEMO001', password: SPWD })).status === 200, 'student login');
ok((await S2.post('/api/auth/login', { role: 'student', username: 'DEMO002', password: SPWD })).status === 200, 'second student login');
ok((await S.get('/api/teacher/students')).status === 403, 'student blocked from teacher API');
ok((await anon.get('/api/journey')).status === 401, 'anonymous blocked from journey');
ok((await S.req('POST', '/api/journey/1/start', {}, { csrf: false })).status === 403, 'state-changing request without CSRF header rejected');
const { rows: [pw] } = await db.query("SELECT password_hash FROM users WHERE username='DEMO001'");
ok(pw.password_hash.startsWith('$2'), 'passwords stored as bcrypt hashes');

console.log('\n— Journey scheduling (server-enforced)');
const j = (await S.get('/api/journey')).body;
const st = (id: number) => j.stages.find((s: any) => s.id === id);
ok(st(1).state === 'open' && st(1).stateLabel === 'متاحة الآن', 'stage 1 open');
ok(st(4).state === 'upcoming' && st(4).stateLabel === 'قريبًا' && st(4).openAt, 'stage 4 shows «قريبًا» with open date');
ok(st(5).state === 'locked', 'draft stage 5 locked');
ok((await S.post('/api/journey/4/start')).status === 403, 'cannot start upcoming stage via direct URL');
ok((await S.get('/api/journey/5')).status === 403, 'cannot load draft stage content via direct URL');

console.log('\n— Playing stage 1');
const load = (await S.get('/api/journey/1')).body;
ok(load.steps.length === 10, 'stage has 10 steps');
const leaked = JSON.stringify(load);
ok(!leaked.includes('answer_key') && !leaked.includes('"points":10') && !leaked.includes('"flag"') && !leaked.includes('"bin"'), 'no answer keys / points sent to the browser');
const start = (await S.post('/api/journey/1/start')).body;
ok(!!start.attemptId, 'attempt started');
const A = start.attemptId;
ok((await S.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[2].id, choiceId: load.steps[2].choices[0].id })).status === 400, 'steps must be played in order');
ok((await S2.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[0].id, choiceId: load.steps[0].choices[0].id })).status === 403, "another student cannot answer someone else's attempt");
// first scenario: pick a choice with a follow-up branch, then recover
const { rows: [branch] } = await db.query('SELECT id FROM scenario_choices WHERE scenario_id=$1 AND followup IS NOT NULL ORDER BY points LIMIT 1', [load.steps[0].id]);
const r1 = (await S.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[0].id, choiceId: branch.id })).body;
ok(r1.followup && r1.followup.options.length >= 2 && r1.outcome, 'branching decision returns consequence + follow-up');
ok((await S.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[1].id, choiceId: load.steps[1].choices[0].id })).status === 400, 'must resolve follow-up before next step');
const fu = (await S.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[0].id, followup: 0 })).body;
ok(fu.kind === 'followup' && fu.points > 0, 'follow-up branch scored');
ok((await S.post(`/api/journey/attempts/${A}/finish`)).status === 400, 'cannot finish before completing mandatory steps');
for (const step of load.steps.slice(1)) {
  let body: any = { scenarioId: step.id };
  if (step.kind === 'minigame') {
    const { rows: [k] } = await db.query('SELECT answer_key FROM scenarios WHERE id=$1', [step.id]);
    if (step.content.game === 'spot') body.payload = { selected: k.answer_key.flags };
    else if (step.content.game === 'classify') body.payload = { map: k.answer_key.map };
    else body.payload = { order: k.answer_key.order };
  } else body.choiceId = await bestChoice(step.id);
  const r = await S.post(`/api/journey/attempts/${A}/answer`, body);
  if (r.status !== 200) console.log(r.body);
  if (step.kind === 'quiz') ok(r.body.recorded && r.body.points === undefined, `quiz answer recorded without revealing correctness (${step.position})`);
}
ok((await S.post(`/api/journey/attempts/${A}/answer`, { scenarioId: load.steps[1].id, choiceId: load.steps[1].choices[0].id })).status === 400, 'cannot re-answer a step');
const fin = (await S.post(`/api/journey/attempts/${A}/finish`)).body;
ok(fin.passed && fin.scorePct >= 70 && fin.certificateId, `stage passed (${fin.scorePct}%) and certificate issued`);
const review = await S.get(`/api/journey/attempts/${A}/review`);
ok(review.status === 200 && review.body.items.length === 10, 'review available after attempt (teacher setting)');
ok((await S.post('/api/journey/1/start')).status === 403, 'completed stage cannot be restarted');
const certs = (await S.get('/api/certificates/mine')).body;
ok(certs.length === 1 && certs[0].kind === 'stage' && certs[0].verifyUrl.includes('/verify/'), 'certificate saved in student account with verify URL');
const { rows: [dup] } = await db.query("SELECT count(*)::int n FROM certificates WHERE student_id=(SELECT id FROM users WHERE username='DEMO001') AND stage_id=1");
ok(dup.n === 1, 'no duplicate certificate');
const vurl = new URL(certs[0].verifyUrl);
const ver = await anon.get(`/api/verify/${certs[0].serial}${vurl.search}`);
ok(ver.body.valid === true && ver.body.certificate.student_name, 'public verification works');
ok((await anon.get(`/api/verify/${certs[0].serial}?t=guess`)).status === 404, 'verification requires secret token');
ok((await S2.get(`/api/certificates/${certs[0].id}`)).status === 403, "student cannot view another student's certificate");
const ach = (await S.get('/api/student/achievements')).body;
ok(ach.items.some((x: any) => x.kind === 'badge') && ach.items.some((x: any) => x.kind === 'key') && ach.totalPoints > 0, 'points, badge and key awarded');

console.log('\n— Teacher stage management');
const stDetail = (await T.get('/api/teacher/stages/2')).body;
const settings = { publish_state: 'closed', open_at: stDetail.open_at, close_at: stDetail.close_at, target_type: 'all', pass_score: 70, max_attempts: 1, allow_retry: false, require_previous: false, show_answers: 'after_close' };
ok((await T.put('/api/teacher/stages/2', settings)).status === 200, 'teacher closes stage 2 early');
ok((await S.post('/api/journey/2/start')).status === 403, 'student immediately blocked from closed stage');
ok((await T.put('/api/teacher/stages/2', { ...settings, publish_state: 'published' })).status === 200, 'teacher reopens stage 2');
// fail stage 2 on purpose with the worst choices → no certificate
const s2 = (await S2.post('/api/journey/2/start')).body;
const l2 = (await S2.get('/api/journey/2')).body;
for (const step of l2.steps) {
  const body: any = { scenarioId: step.id };
  if (step.kind === 'minigame') body.payload = {};
  else { const { rows: [w] } = await db.query('SELECT id, followup FROM scenario_choices WHERE scenario_id=$1 ORDER BY points ASC LIMIT 1', [step.id]); body.choiceId = w.id; }
  const r = (await S2.post(`/api/journey/attempts/${s2.attemptId}/answer`, body)).body;
  if (r.followup) await S2.post(`/api/journey/attempts/${s2.attemptId}/answer`, { scenarioId: step.id, followup: r.followup.options.length - 1 });
}
const f2 = (await S2.post(`/api/journey/attempts/${s2.attemptId}/finish`)).body;
ok(!f2.passed && !f2.certificateId, `failing score (${f2.scorePct}%) → no certificate`);
ok(f2.reviewAvailable === false && (await S2.get(`/api/journey/attempts/${s2.attemptId}/review`)).status === 403, 'answers hidden until close (after_close setting)');
ok((await S2.post('/api/journey/2/start')).status === 403, 'max attempts (1, no retry) enforced');
const s2id = (await db.query("SELECT id FROM users WHERE username='DEMO002'")).rows[0].id;
ok((await T.put(`/api/teacher/stages/2/exceptions/${s2id}`, { extra_attempts: 1, reason: 'ظرف صحي' })).status === 200, 'teacher grants extra attempt');
ok((await S2.post('/api/journey/2/start')).status === 200, 'student can retry after exception');
const { rows: logs } = await db.query("SELECT action FROM audit_logs WHERE entity='stage' ORDER BY id");
ok(logs.some((l) => l.action === 'stage.close_early') && logs.some((l) => l.action === 'stage.reopen') && logs.some((l) => l.action === 'stage.exception'), 'stage changes recorded in audit log');
// targeting: restrict stage 3 to secondary only → DEMO001 (intermediate) loses it
const st3 = (await T.get('/api/teacher/stages/3')).body;
await T.put('/api/teacher/stages/3', { ...settings, publish_state: 'published', open_at: st3.open_at, close_at: st3.close_at, target_type: 'level', target_level: 'secondary', max_attempts: 3, allow_retry: true });
ok((await S.get('/api/journey')).body.stages.find((s: any) => s.id === 3).state === 'locked', 'level targeting hides stage from non-targeted student');
// past close date → ended
await T.put('/api/teacher/stages/3', { ...settings, publish_state: 'published', open_at: new Date(Date.now() - 5 * 864e5).toISOString(), close_at: new Date(Date.now() - 864e5).toISOString(), target_type: 'all', max_attempts: 3, allow_retry: true });
ok((await S.get('/api/journey')).body.stages.find((s: any) => s.id === 3).stateLabel === 'انتهت المدة', 'after close date → «انتهت المدة»');
ok((await T.put('/api/teacher/stages/3', { ...settings, open_at: '2026-12-02T10:00:00+03:00', close_at: '2026-12-01T10:00:00+03:00' })).status === 400, 'close before open rejected');

console.log('\n— Students management');
const add = await T.post('/api/teacher/students', { full_name: 'طالبة اختبار', level: 'المتوسطة', grade: 'الأول', section: 'ج' });
ok(add.status === 201 && add.body.temp_password && add.body.student_code, 'add single student (one-time temp password)');
const RUN = Date.now().toString(36).toUpperCase();
const csv = '\uFEFF' + `الاسم,المرحلة,الصف,الفصل,الرقم التعريفي\nأمل ${RUN},الثانوية,2,أ,IMP${RUN}A\nوعد علي,المتوسطة,3,ب,IMP${RUN}B\n`;
const fd = new FormData(); fd.append('file', new Blob([csv], { type: 'text/csv' }), 'students.csv');
const imp = await T.req('POST', '/api/teacher/students/import', undefined, { form: fd });
ok(imp.status === 201 && imp.body.created.length === 2, 'CSV import created 2 students');
const fd2 = new FormData(); fd2.append('file', new Blob([csv], { type: 'text/csv' }), 'students.csv');
const imp2 = await T.req('POST', '/api/teacher/students/import', undefined, { form: fd2 });
ok(imp2.status === 422 && imp2.body.errors.length, 're-import rejected (duplicate IDs) with clear errors');
const list = (await T.get('/api/teacher/students?search=' + encodeURIComponent(`أمل ${RUN}`))).body;
ok(list.length === 1 && list[0].level === 'secondary', 'search students');
ok((await T.get('/api/teacher/students?grade=3&level=intermediate')).body.every((s: any) => s.grade === 3), 'filter by grade');
const cls = await T.get('/api/teacher/students/classes');
ok(cls.status === 200 && cls.body.length >= 3, 'classes list');
const amal = list[0];
await T.req('PATCH', `/api/teacher/students/${amal.id}`, { is_active: false });
const blocked = new Client();
ok((await blocked.post('/api/auth/login', { role: 'student', username: `IMP${RUN}A`, password: imp.body.created[0].temp_password })).status === 403, 'disabled account cannot log in');
const exp = await T.req('GET', '/api/teacher/students/export?format=csv', undefined, { raw: true });
ok(exp.status === 200 && exp.headers.get('content-type')!.includes('text/csv') && exp.text.includes(`أمل ${RUN}`), 'export students CSV (Arabic)');
const prof = (await T.get(`/api/teacher/students/${(await db.query("SELECT id FROM users WHERE username='DEMO001'")).rows[0].id}`)).body;
ok(prof.stages.length === 7 && prof.stages[0].state === 'completed' && prof.certificates.length === 1, 'student learning profile');

console.log('\n— Courses (LMS)');
const created = await T.post('/api/teacher/courses', { title: 'دورة اختبارية', instructor_name: 'أ. نورة', duration_hours: 2, publish_state: 'draft' });
ok(created.status === 201, 'teacher creates draft course');
ok(!(await S.get('/api/learn/courses')).body.some((c: any) => c.id === created.body.id), 'draft course invisible to students');
ok((await S.get(`/api/learn/courses/${created.body.id}`)).status === 404, 'draft course not reachable via direct URL');
const mod = (await T.post(`/api/teacher/courses/${created.body.id}/modules`, { title: 'الوحدة ١' })).body;
// upload: wrong magic bytes rejected, valid PDF accepted
const bad = new FormData(); bad.append('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
ok((await T.req('POST', '/api/teacher/courses/upload/lesson', undefined, { form: bad })).status === 400, 'upload with fake content rejected');
const exe = new FormData(); exe.append('file', new Blob(['MZ'], { type: 'application/octet-stream' }), 'virus.exe');
ok((await T.req('POST', '/api/teacher/courses/upload/lesson', undefined, { form: exe })).status === 400, 'disallowed file type rejected');
const good = new FormData(); good.append('file', new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' }), 'ملف الدرس.pdf');
const up = await T.req('POST', '/api/teacher/courses/upload/lesson', undefined, { form: good });
ok(up.status === 201 && up.body.original_name === 'ملف الدرس.pdf', 'PDF upload accepted (Arabic file name kept)');
const lesson = await T.post(`/api/teacher/courses/modules/${mod.id}/lessons`, { title: 'درس ملف', kind: 'file', file_id: up.body.id });
ok(lesson.status === 201, 'lesson with file created');
ok((await S.get(`/api/files/${up.body.id}`)).status === 403, 'student cannot download files of a course she is not enrolled in');
const dlf = await T.req('GET', `/api/files/${up.body.id}`, undefined, { raw: true });
ok(dlf.status === 200 && dlf.text.startsWith('%PDF-1.4'), 'stored file served back intact');
const rg = await fetch(BASE + `/api/files/${up.body.id}`, { headers: { cookie: T.cookie, range: 'bytes=0-3' } });
ok(rg.status === 206 && (await rg.text()) === '%PDF', 'HTTP range requests (video seeking)');

const cat = (await S.get('/api/learn/courses')).body;
const demoCourse = cat.find((c: any) => c.title === 'أساسيات الأمن السيبراني');
ok(demoCourse && demoCourse.canEnroll, 'published course visible & open for enrolment');
ok((await S.post(`/api/learn/courses/${demoCourse.id}/learn`)).status !== 200 && (await S.get(`/api/learn/courses/${demoCourse.id}/learn`)).status === 403, 'content locked before enrolment');
ok((await S.post(`/api/learn/courses/${demoCourse.id}/enroll`)).status === 200, 'student enrols');
ok((await S.post(`/api/learn/courses/${demoCourse.id}/enroll`)).status === 409, 'duplicate enrolment prevented');
const lv = (await S.get(`/api/learn/courses/${demoCourse.id}/learn`)).body;
ok(lv.modules.length === 2 && lv.evaluation.status === 'not_started', 'learning view with status «لم تبدأ»');
const allLessons = lv.modules.flatMap((m: any) => m.lessons);
for (const l of allLessons) { await S.get(`/api/learn/lessons/${l.id}`); await S.post(`/api/learn/lessons/${l.id}/complete`); }
const lv2 = (await S.get(`/api/learn/courses/${demoCourse.id}/learn`)).body;
ok(lv2.evaluation.status === 'in_progress' && lv2.evaluation.progress > 0 && lv2.lastLessonId, `progress tracked (${lv2.evaluation.progress}%) + resume point`);
const final = lv2.tests.find((t: any) => t.is_final);
const at = (await S.post(`/api/learn/assessments/${final.id}/start`)).body;
ok(at.questions.length === 6 && !JSON.stringify(at).includes('"answer"') && !JSON.stringify(at).includes('correct'), 'test served without answer keys');
for (const qq of at.questions) {
  const { rows: [k] } = await db.query('SELECT answer FROM questions WHERE id=$1', [qq.id]);
  const resp = qq.qtype === 'mcq' || qq.qtype === 'tf' ? k.answer.correct : qq.qtype === 'multi' ? k.answer.correct : qq.qtype === 'match' ? k.answer.pairs : qq.qtype === 'order' ? k.answer.order : 'لأن تسريب كلمة واحدة يكشف جميع الحسابات';
  ok((await S.put(`/api/learn/attempts/${at.attemptId}/answer`, { questionId: qq.id, response: resp })).status === 200, `autosave answer (${qq.qtype})`);
}
ok((await S2.put(`/api/learn/attempts/${at.attemptId}/answer`, { questionId: at.questions[0].id, response: 'x' })).status === 403, "cannot write to another student's test attempt");
const sub = (await S.post(`/api/learn/attempts/${at.attemptId}/submit`)).body;
ok(sub.status === 'pending_review' && sub.courseStatus === 'pending_review', 'short answer → «بانتظار تصحيح»');
const grading = (await T.get('/api/teacher/assessments/grading')).body;
ok(grading.length === 1, 'teacher sees answer to grade manually');
const notifT = (await T.get('/api/notifications')).body;
ok(notifT.some((n: any) => n.kind === 'needs_grading') && notifT.some((n: any) => n.kind === 'enrolled'), 'teacher notified (enrolment + needs grading)');
ok((await T.post(`/api/teacher/assessments/grading/${grading[0].attempt_id}`, { question_id: grading[0].question_id, points: 99 })).status === 400, 'manual points cannot exceed max');
const g = (await T.post(`/api/teacher/assessments/grading/${grading[0].attempt_id}`, { question_id: grading[0].question_id, points: 2, feedback: 'ممتاز' })).body;
ok(g.finalized, 'manual grading finalises attempt');
const lv3 = (await S.get(`/api/learn/courses/${demoCourse.id}/learn`)).body;
ok(lv3.evaluation.status === 'completed' && lv3.evaluation.progress === 100, 'course completed automatically when rules met');
const certs2 = (await S.get('/api/certificates/mine')).body;
const cc = certs2.find((c: any) => c.kind === 'course');
ok(cc && cc.hours === 4 && cc.instructor_name, 'course certificate issued (hours + instructor)');
const res = (await S.get(`/api/learn/attempts/${at.attemptId}/result`)).body;
ok(res.scorePct === 100 && res.items.find((i: any) => i.qtype === 'short').feedback === 'ممتاز', 'result with teacher feedback');
const notifS = (await S.get('/api/notifications')).body;
ok(['enrolled', 'graded', 'course_completed', 'certificate', 'stage_completed'].every((k) => notifS.some((n: any) => n.kind === k)), 'student notifications stored');
await S.post('/api/notifications/read');
ok((await S.get('/api/auth/me')).body.user.unread === 0, 'mark notifications read');

console.log('\n— Certificates admin, reports, exports');
const allCerts = (await T.get('/api/teacher/certificates')).body;
ok(allCerts.length >= 2, 'teacher certificate list');
ok((await T.post(`/api/teacher/certificates/${cc.id}/revoke`, { reason: 'خطأ إداري في البيانات' })).status === 200, 'revoke certificate');
const vurl2 = new URL(cc.verifyUrl);
const ver2 = (await anon.get(`/api/verify/${cc.serial}${vurl2.search}`)).body;
ok(ver2.valid === false && ver2.certificate.status === 'revoked', 'revoked certificate shows as «ملغاة» (record kept)');
await T.post(`/api/teacher/certificates/${cc.id}/reinstate`);
const dash = (await T.get('/api/teacher/dashboard')).body;
ok(dash.kpi.students >= 15 && dash.kpi.certificates >= 2 && dash.kpi.enrollments >= 1 && dash.perStage.length === 7, 'dashboard KPIs from live data');
const jr = (await T.get('/api/teacher/reports/journey?level=intermediate')).body;
ok(jr.stages.length === 7 && jr.students.every((s: any) => s.level === 'intermediate'), 'journey report with filters');
ok((await T.get('/api/teacher/reports/courses')).body.some((c: any) => c.completed >= 1), 'courses report');
const xl = await T.req('GET', '/api/teacher/assessments/results?format=xlsx', undefined, { raw: true });
ok(xl.status === 200 && xl.headers.get('content-type')!.includes('spreadsheetml'), 'export test results to Excel');
const audit = (await T.get('/api/teacher/audit')).body;
ok(audit.some((a: any) => a.action === 'certificate.revoke'), 'certificate revocation audited');

console.log('\n— Timed tests auto-submit (scheduler)');
const { runJobs } = await import('../src/lib/jobs.js');
const unit = lv3.tests.find((t: any) => !t.is_final);
await db.query('UPDATE assessments SET time_limit_min=1 WHERE id=$1', [unit.id]);
const s2c = new Client(); await s2c.post('/api/auth/login', { role: 'student', username: 'DEMO002', password: SPWD });
await s2c.post(`/api/learn/courses/${demoCourse.id}/enroll`);
const ta = (await s2c.post(`/api/learn/assessments/${unit.id}/start`)).body;
await db.query("UPDATE assessment_attempts SET deadline_at = now() - interval '5 minutes' WHERE id=$1", [ta.attemptId]);
ok((await s2c.put(`/api/learn/attempts/${ta.attemptId}/answer`, { questionId: ta.questions[0].id, response: 'a' })).status === 403, 'answers after deadline rejected');
await runJobs();
const { rows: [tt] } = await db.query('SELECT status FROM assessment_attempts WHERE id=$1', [ta.attemptId]);
ok(tt.status === 'graded', 'timed-out attempt auto-submitted by scheduler');

console.log(`\n${passed} passed, ${failed} failed\n`);
await db.end();
process.exit(failed ? 1 : 0);
