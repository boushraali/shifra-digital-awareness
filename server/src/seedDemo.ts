/** DEVELOPMENT ONLY — creates clearly-flagged demo data (users.is_demo = true).
 *  Passwords are random per run and written to storage/demo-credentials.txt (git-ignored). Never runs in production.
 *  Usage: npm run seed:demo            (create)
 *         npm run seed:demo -- --reset (remove all demo data) */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { pool, tx, config, tempPassword } from './lib/core.js';
import { migrate } from './migrate.js';

if (config.isProd) { console.error('Refusing to seed demo data in production.'); process.exit(1); }
await migrate();

async function reset() {
  await tx(async (c) => {
    // students added through the demo teacher account are demo data too
    await c.query(`UPDATE users SET is_demo=true WHERE id IN (SELECT user_id FROM student_profiles WHERE created_by IN (SELECT id FROM users WHERE is_demo))`);
    await c.query(`DELETE FROM certificates WHERE student_id IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM courses WHERE created_by IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`UPDATE stage_schedules SET updated_by=NULL WHERE updated_by IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM stage_exceptions WHERE granted_by IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`UPDATE student_profiles SET created_by=NULL WHERE created_by IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM files WHERE owner_id IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM users WHERE is_demo`);
  });
  console.log('✓ demo data removed');
}

if (process.argv.includes('--reset')) { await reset(); await pool.end(); process.exit(0); }
await reset();

const creds: string[] = ['# بيانات الحسابات التجريبية — للتطوير فقط', ''];
const teacherPwd = tempPassword(12);
const studentPwd = tempPassword(10);

const out = await tx(async (c) => {
  const { rows: [t] } = await c.query(`INSERT INTO users(role, username, password_hash, full_name, is_demo) VALUES ('teacher','teacher@demo.local',$1,'أ. نورة القحطاني (تجريبي)',true) RETURNING id`,
    [await bcrypt.hash(teacherPwd, 10)]);
  await c.query(`INSERT INTO teacher_profiles(user_id, display_name, school_name) VALUES ($1,'أ. نورة القحطاني','مدرسة تجريبية')`, [t.id]);
  creds.push(`المعلمة: teacher@demo.local  /  ${teacherPwd}`, '', `الطالبات (كلمة المرور نفسها للجميع في البيئة التجريبية): ${studentPwd}`);

  const classes: [string, number, string][] = [['intermediate', 2, 'أ'], ['intermediate', 3, 'ب'], ['secondary', 1, 'أ']];
  const names = ['ريم العتيبي', 'سارة الشمري', 'لمى الدوسري', 'هيا المطيري', 'نوف الحربي', 'غادة الزهراني', 'منار القرني', 'جود السبيعي', 'شهد الغامدي', 'رهف العنزي', 'ليان الشهري', 'دانة الرشيدي'];
  const hash = await bcrypt.hash(studentPwd, 10);
  const studentIds: string[] = [];
  for (const [i, n] of names.entries()) {
    const [lv, gr, sec] = classes[i % 3];
    const { rows: [cl] } = await c.query(`INSERT INTO classes(level, grade, section) VALUES ($1,$2,$3) ON CONFLICT (level,grade,section) DO UPDATE SET section=EXCLUDED.section RETURNING id`, [lv, gr, sec]);
    const code = `DEMO${String(i + 1).padStart(3, '0')}`;
    const { rows: [u] } = await c.query(`INSERT INTO users(role, username, password_hash, full_name, is_demo, last_login_at) VALUES ('student',$1,$2,$3,true, now() - ($4 || ' days')::interval) RETURNING id`, [code, hash, n, i % 5]);
    await c.query('INSERT INTO student_profiles(user_id, student_code, class_id, created_by) VALUES ($1,$2,$3,$4)', [u.id, code, cl.id, t.id]);
    studentIds.push(u.id);
    creds.push(`  ${code}  ${n}`);
  }

  // Stage schedule: 1–3 open now, 4 opens in 3 days, 5–7 draft
  const now = Date.now(); const day = 86400000;
  await c.query(`UPDATE stage_schedules SET publish_state='draft', open_at=NULL, close_at=NULL, target_type='all', target_level=NULL, target_grade=NULL, target_class_id=NULL, pass_score=70, max_attempts=3, allow_retry=true, require_previous=false, show_answers='after_attempt', open_notified_at=NULL, closing_notified_at=NULL, updated_by=$1`, [t.id]);
  await c.query(`UPDATE stage_schedules SET publish_state='published', open_at=$1, close_at=$2 WHERE stage_id IN (1,2,3)`, [new Date(now - day), new Date(now + 21 * day)]);
  await c.query(`UPDATE stage_schedules SET publish_state='published', open_at=$1, close_at=$2 WHERE stage_id=4`, [new Date(now + 3 * day), new Date(now + 30 * day)]);

  // Demo course with real structure + all question types
  const { rows: [course] } = await c.query(`INSERT INTO courses(title, short_desc, long_desc, objectives, skills, instructor_name, duration_hours, level_label,
      enroll_start, content_start, course_end, pass_score, publish_state, created_by, require_all_lessons, require_final_pass)
    VALUES ('أساسيات الأمن السيبراني','مدخل عملي لحماية نفسك وحساباتك في العالم الرقمي.',
      'تتعرفين في هذه الدورة على مفهوم الأمن السيبراني وأهم التهديدات الرقمية، وكيف تحمين حساباتك ومعلوماتك بخطوات عملية بسيطة.',
      ARRAY['فهم مفهوم الأمن السيبراني','التعرف على التهديدات الشائعة','حماية الحسابات بكلمات مرور قوية والتحقق الثنائي'],
      ARRAY['التفكير النقدي','حماية البيانات','الاستخدام الآمن للإنترنت'],
      'أ. نورة القحطاني', 4, 'مبتدئ', $1, $1, $2, 70, 'published', $3, true, true) RETURNING id`,
    [new Date(now - day), new Date(now + 60 * day), t.id]);
  const mod = async (title: string, pos: number) => (await c.query('INSERT INTO course_modules(course_id, title, position) VALUES ($1,$2,$3) RETURNING id', [course.id, title, pos])).rows[0].id;
  const les = (m: string, title: string, body: string, pos: number, kind = 'text', url: string | null = null) =>
    c.query('INSERT INTO lessons(module_id, title, kind, body, url, position, duration_min) VALUES ($1,$2,$3,$4,$5,$6,15)', [m, title, kind, body, url, pos]);
  const m1 = await mod('الوحدة الأولى: مقدمة في الأمن السيبراني', 1);
  await les(m1, 'مفهوم الأمن السيبراني', 'الأمن السيبراني هو حماية الأجهزة والشبكات والبيانات من الوصول غير المصرح به أو التلف أو السرقة.\n\nيشمل ذلك: سرية المعلومات، وسلامتها من التعديل، وتوفرها عند الحاجة.', 1);
  await les(m1, 'التهديدات الرقمية', 'من أبرز التهديدات: التصيد الاحتيالي، والبرمجيات الضارة، وانتحال الشخصية، وتسريب البيانات.\n\nكل تهديد يستغل ثغرة تقنية أو بشرية — والثغرة البشرية هي الأكثر شيوعًا.', 2);
  await les(m1, 'حماية المعلومات', 'قللي ما تشاركينه، وراجعي إعدادات الخصوصية، وحدّثي أجهزتك وتطبيقاتك باستمرار.', 3);
  const m2 = await mod('الوحدة الثانية: حماية الحسابات', 2);
  await les(m2, 'كلمات المرور', 'استخدمي عبارة مرور طويلة وفريدة لكل حساب، ولا تشاركيها مع أحد.', 1);
  await les(m2, 'المصادقة متعددة العوامل', 'تضيف خطوة تحقق ثانية (رمز أو تطبيق) تمنع الدخول حتى لو عُرفت كلمة المرور.', 2);
  await les(m2, 'التصيد الإلكتروني', 'تحققي من المرسل والرابط، ولا تدخلي بياناتك في صفحات وصلتك عبر رسائل.', 3);

  const qn = async (module: string | null, qtype: string, text: string, options: any, answer: any, points = 1, explanation = '') =>
    (await c.query('INSERT INTO questions(course_id, module_id, qtype, text, options, answer, points, explanation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [course.id, module, qtype, text, JSON.stringify(options), JSON.stringify(answer), points, explanation])).rows[0].id;
  const q1 = await qn(m1, 'mcq', 'ما الهدف الأساسي من الأمن السيبراني؟', [{ id: 'a', text: 'زيادة سرعة الإنترنت' }, { id: 'b', text: 'حماية الأجهزة والبيانات من الوصول غير المصرح به' }, { id: 'c', text: 'تصميم المواقع' }], { correct: 'b' }, 1, 'الأمن السيبراني يحمي السرية والسلامة والتوفر.');
  const q2 = await qn(m1, 'tf', 'الثغرة البشرية من أكثر الثغرات استغلالًا.', [], { correct: true }, 1);
  const q3 = await qn(m1, 'multi', 'اختاري جميع التهديدات الرقمية:', [{ id: 'a', text: 'التصيد الاحتيالي' }, { id: 'b', text: 'البرمجيات الضارة' }, { id: 'c', text: 'تحديث النظام' }, { id: 'd', text: 'انتحال الشخصية' }], { correct: ['a', 'b', 'd'] }, 2);
  const q4 = await qn(m2, 'match', 'طابقي المفهوم بتعريفه:', { left: [{ id: 'l1', text: 'التحقق الثنائي' }, { id: 'l2', text: 'التصيد' }, { id: 'l3', text: 'عبارة المرور' }], right: [{ id: 'r1', text: 'رسالة مزيفة لسرقة البيانات' }, { id: 'r2', text: 'خطوة تحقق إضافية' }, { id: 'r3', text: 'كلمة مرور طويلة من عدة كلمات' }] }, { pairs: { l1: 'r2', l2: 'r1', l3: 'r3' } }, 3);
  const q5 = await qn(m2, 'order', 'رتّبي خطوات التصرف عند اختراق الحساب:', [{ id: 'o1', text: 'تغيير كلمة المرور' }, { id: 'o2', text: 'إنهاء الجلسات الأخرى' }, { id: 'o3', text: 'تفعيل التحقق الثنائي' }, { id: 'o4', text: 'تنبيه الأصدقاء' }], { order: ['o1', 'o2', 'o3', 'o4'] }, 2);
  const q6 = await qn(m2, 'short', 'اشرحي بجملة واحدة لماذا لا نستخدم كلمة المرور نفسها لكل الحسابات.', [], { accepted: [] }, 2);
  const q7 = await qn(m2, 'mcq', 'وصلتك رسالة تطلب رمز التحقق. ماذا تفعلين؟', [{ id: 'a', text: 'أرسله' }, { id: 'b', text: 'لا أرسله وأتحقق من حسابي' }, { id: 'c', text: 'أنشره' }], { correct: 'b' }, 1);

  const asmt = async (title: string, module: string | null, isFinal: boolean, qids: string[]) => {
    const { rows: [a] } = await c.query(`INSERT INTO assessments(course_id, module_id, is_final, title, pass_score, max_attempts, shuffle) VALUES ($1,$2,$3,$4,70,3,$5) RETURNING id`,
      [course.id, module, isFinal, title, isFinal]);
    for (const [i, qid] of qids.entries()) await c.query('INSERT INTO assessment_questions(assessment_id, question_id, position) VALUES ($1,$2,$3)', [a.id, qid, i + 1]);
  };
  await asmt('اختبار الوحدة الأولى', m1, false, [q1, q2, q3]);
  await asmt('اختبار الوحدة الثانية', m2, false, [q4, q5, q7]);
  await asmt('الاختبار النهائي للدورة', null, true, [q1, q3, q4, q5, q6, q7]);

  // A draft course to show the draft state
  await c.query(`INSERT INTO courses(title, short_desc, instructor_name, duration_hours, publish_state, created_by) VALUES ('مهارات البحث الآمن','كيف تبحثين وتتحققين من المصادر.','أ. نورة القحطاني',2,'draft',$1)`, [t.id]);
  return { teacher: t.id, studentIds };
});

fs.mkdirSync(config.storageDir, { recursive: true });
const file = path.join(config.storageDir, 'demo-credentials.txt');
fs.writeFileSync(file, creds.join('\n') + '\n', { mode: 0o600 });
console.log(`✓ demo data created (${out.studentIds.length} students). Credentials written to ${file}`);
await pool.end();
