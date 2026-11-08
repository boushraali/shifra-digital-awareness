import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Download, Eye, ShieldCheck, Ban, RotateCcw, Search, Printer, FileSpreadsheet, KeyRound, History, Lock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api, download, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad, Spinner, ErrorBox, Card, Button, Badge, Modal, Field, Input, Select, Textarea, PageHeader, Table, Empty, useToast, Tabs, StatCard } from '../../lib/ui';
import { fmtDate, fmtDateTime, gradeLabel, levelLabel, pct } from '../../lib/format';
import { NotificationList } from '../../components/Notifications';
import { CHART, tick, tooltipStyle } from './Dashboard';

// ============================================================ certificates
export function CertificatesAdmin() {
  const toast = useToast();
  const [f, setF] = useState({ kind: '', status: '', search: '' });
  const { data, loading, error, reload } = useLoad(() => api.get(`/teacher/certificates${qs(f)}`), [f.kind, f.status]);
  const [revoke, setRevoke] = useState<any>(null);
  const [reason, setReason] = useState('');
  async function doRevoke() {
    try { await api.post(`/teacher/certificates/${revoke.id}/revoke`, { reason }); toast('ok', 'تم إلغاء الشهادة وتوثيق السبب'); setRevoke(null); setReason(''); reload(); } catch (e: any) { toast('err', e.message); }
  }
  async function reinstate(c: any) { if (!confirm('إعادة تفعيل الشهادة؟')) return; await api.post(`/teacher/certificates/${c.id}/reinstate`); reload(); }
  return (
    <div>
      <PageHeader title="إدارة الشهادات" subtitle="شهادات المراحل، وشهادة إتمام الرحلة، وشهادات الدورات" actions={<Button variant="secondary" icon={<Download size={16} />} onClick={() => download(`/teacher/certificates${qs({ ...f, format: 'xlsx' })}`)}>تصدير</Button>} />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); reload(); }}><Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="ps-9" placeholder="اسم الطالبة، رقم الشهادة، المرحلة أو الدورة…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} onBlur={reload} /></form>
        <Select className="w-auto" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">كل الأنواع</option><option value="stage">شهادات المراحل</option><option value="journey">إتمام رحلة الوعي الرقمي</option><option value="course">شهادات الدورات</option></Select>
        <Select className="w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option><option value="valid">سارية</option><option value="revoked">ملغاة</option></Select>
      </Card>
      <Card>
        {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !data.length ? <Empty icon={<Award size={40} />} title="لا توجد شهادات" /> : (
          <Table><thead><tr><th>الطالبة</th><th>نوع الشهادة</th><th>المرحلة / الدورة</th><th>تاريخ الإصدار</th><th>رقم الشهادة</th><th>الحالة</th><th></th></tr></thead>
            <tbody>{data.map((c: any) => (
              <tr key={c.id}>
                <td><Link to={`/teacher/students/${c.student_id}`} className="font-medium hover:text-nova-600">{c.student_name}</Link></td>
                <td><Badge color={c.kind === 'course' ? 'blue' : c.kind === 'journey' ? 'amber' : 'violet'}>{c.kindLabel}</Badge></td>
                <td>{c.title}</td><td className="text-xs">{fmtDate(c.issued_at)}</td><td className="font-mono text-xs" dir="ltr">{c.serial}</td>
                <td><Badge color={c.status === 'valid' ? 'green' : 'red'}>{c.status === 'valid' ? 'سارية' : 'ملغاة'}</Badge>{c.revoke_reason && <div className="mt-1 max-w-[12rem] truncate text-xs text-slate-400" title={c.revoke_reason}>{c.revoke_reason}</div>}</td>
                <td className="whitespace-nowrap">
                  <Link to={`/teacher/certificates/${c.id}`} className="inline-flex p-1.5 text-slate-400 hover:text-nova-600" title="عرض / تحميل"><Eye size={16} /></Link>
                  <a href={c.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex p-1.5 text-slate-400 hover:text-emerald-600" title="تحقق"><ShieldCheck size={16} /></a>
                  {c.status === 'valid' ? <button onClick={() => setRevoke(c)} className="p-1.5 text-slate-400 hover:text-rose-600" title="إلغاء"><Ban size={16} /></button>
                    : <button onClick={() => reinstate(c)} className="p-1.5 text-slate-400 hover:text-emerald-600" title="إعادة تفعيل"><RotateCcw size={16} /></button>}
                </td>
              </tr>
            ))}</tbody></Table>
        )}
      </Card>
      <Modal open={!!revoke} onClose={() => setRevoke(null)} title="إلغاء شهادة" footer={<><Button variant="secondary" onClick={() => setRevoke(null)}>تراجع</Button><Button variant="danger" onClick={doRevoke}>إلغاء الشهادة</Button></>}>
        <p className="mb-3 text-sm text-slate-600">سيبقى سجل الشهادة محفوظًا، وستظهر صفحة التحقق بأنها «ملغاة». يُسجَّل الإجراء في السجل الإداري.</p>
        <Field label="السبب الإداري"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

// ================================================================= reports
export function Reports() {
  const [tab, setTab] = useState<'journey' | 'courses'>('journey');
  const [f, setF] = useState({ level: '', grade: '', section: '', stage_id: '', course_id: '', from: '', to: '', status: '' });
  const { data: courses } = useLoad(() => api.get('/teacher/courses'));
  const params = qs(f);
  const { data, loading, error } = useLoad(() => api.get(`/teacher/reports/${tab}${params}`), [tab, params]);
  const up = (p: any) => setF({ ...f, ...p });
  return (
    <div>
      <PageHeader title="التقارير والإحصائيات" subtitle="تقارير مستخرجة من البيانات الفعلية مع إمكانية التصفية والتصدير" actions={<>
        <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => download(`/teacher/reports/${tab}${qs({ ...f, format: 'xlsx' })}`)}>Excel</Button>
        <Button variant="secondary" onClick={() => download(`/teacher/reports/${tab}${qs({ ...f, format: 'csv' })}`)}>CSV</Button>
        <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>PDF / طباعة</Button>
      </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'journey', label: 'تقارير رحلة الوعي الرقمي' }, { id: 'courses', label: 'تقارير الدورات' }]} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7 print:hidden">
        <Select value={f.level} onChange={(e) => up({ level: e.target.value })}><option value="">المرحلة الدراسية</option><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select>
        <Select value={f.grade} onChange={(e) => up({ grade: e.target.value })}><option value="">الصف</option>{[1, 2, 3].map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select>
        <Input placeholder="الفصل" value={f.section} onChange={(e) => up({ section: e.target.value })} />
        {tab === 'journey' ? <Select value={f.stage_id} onChange={(e) => up({ stage_id: e.target.value })}><option value="">كل مراحل الرحلة</option>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>المرحلة {n}</option>)}</Select>
          : <Select value={f.course_id} onChange={(e) => up({ course_id: e.target.value })}><option value="">كل الدورات</option>{(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>}
        <Input type="date" value={f.from} onChange={(e) => up({ from: e.target.value })} title="من تاريخ" />
        <Input type="date" value={f.to} onChange={(e) => up({ to: e.target.value })} title="إلى تاريخ" />
        {tab === 'journey' && <Select value={f.status} onChange={(e) => up({ status: e.target.value })}><option value="">حالة الإنجاز</option><option value="completed">أكملت</option><option value="in_progress">قيد التقدم</option><option value="not_started">لم تبدأ</option></Select>}
      </Card>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : tab === 'journey' ? <JourneyReport d={data} /> : <CoursesReport rows={data} />}
    </div>
  );
}

function JourneyReport({ d }: { d: any }) {
  const pop = d.stages[0]?.population ?? 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="الطالبات ضمن التصفية" value={pop} icon={<Award />} />
        <StatCard label="أكملن" value={d.summary.completed} icon={<Award />} tone="green" />
        <StatCard label="لم يبدأن" value={d.summary.not_started} icon={<Award />} tone="rose" />
        <StatCard label="الشهادات الصادرة" value={d.stages.reduce((s: number, x: any) => s + x.certificates, 0)} icon={<Award />} tone="amber" />
      </div>
      <Card className="p-5">
        <h3 className="mb-3 font-bold">نسبة إكمال كل مرحلة ومتوسط الدرجات</h3>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer><BarChart data={d.stages.map((s: any) => ({ name: `${s.id}`, title: s.title, 'نسبة الإكمال %': pop ? Math.round((s.completed / pop) * 100) : 0, 'متوسط الدرجة %': s.avg_score ?? 0 }))}>
            <CartesianGrid vertical={false} stroke={CHART.grid} /><XAxis dataKey="name" tick={tick} /><YAxis domain={[0, 100]} tick={tick} width={30} />
            <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.title} /><Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic', fontSize: 12 }} />
            <Bar dataKey="نسبة الإكمال %" fill={CHART.a} radius={[6, 6, 0, 0]} /><Bar dataKey="متوسط الدرجة %" fill={CHART.b} radius={[6, 6, 0, 0]} />
          </BarChart></ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><div className="border-b border-slate-100 px-5 py-3 font-bold">ملخص المراحل</div>
          <Table><thead><tr><th>المرحلة</th><th>بدأن</th><th>أكملن</th><th>المحاولات</th><th>متوسط</th><th>شهادات</th></tr></thead>
            <tbody>{d.stages.map((s: any) => <tr key={s.id}><td>{s.id}. {s.title}</td><td>{s.started}</td><td>{s.completed}</td><td>{s.attempts}</td><td>{pct(s.avg_score)}</td><td>{s.certificates}</td></tr>)}</tbody></Table></Card>
        <Card><div className="border-b border-slate-100 px-5 py-3 font-bold">أكثر السيناريوهات صعوبة</div>
          {!d.hardest.length ? <Empty title="لا توجد بيانات كافية بعد" /> : <Table><thead><tr><th>المرحلة</th><th>النشاط</th><th>متوسط النجاح</th><th>الإجابات</th></tr></thead>
            <tbody>{d.hardest.map((h: any, i: number) => <tr key={i}><td className="text-xs">{h.stage}</td><td>{h.title}</td><td><Badge color={h.avg_pct < 50 ? 'red' : h.avg_pct < 75 ? 'amber' : 'green'}>{pct(h.avg_pct)}</Badge></td><td>{h.answers}</td></tr>)}</tbody></Table>}</Card>
      </div>
      <Card><div className="border-b border-slate-100 px-5 py-3 font-bold">تفاصيل الطالبات</div>
        <Table><thead><tr><th>الطالبة</th><th>المرحلة الدراسية</th><th>الصف/الفصل</th><th>المكتمل</th><th>بدأت</th><th>متوسط أفضل درجة</th><th>الحالة</th></tr></thead>
          <tbody>{d.students.map((s: any) => <tr key={s.id}><td>{s.full_name}</td><td>{levelLabel(s.level)}</td><td>{gradeLabel(s.grade)}/{s.section}</td><td>{s.completed}</td><td>{s.started}</td><td>{pct(s.avg_best)}</td><td><Badge color={s.journey_status === 'completed' ? 'green' : s.journey_status === 'not_started' ? 'gray' : 'blue'}>{s.statusLabel}</Badge></td></tr>)}</tbody></Table></Card>
    </div>
  );
}

function CoursesReport({ rows }: { rows: any[] }) {
  if (!rows.length) return <Card><Empty title="لا توجد دورات منشورة" /></Card>;
  const top = [...rows].sort((a, b) => b.enrolled - a.enrolled)[0];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="إجمالي التسجيلات" value={rows.reduce((s, r) => s + r.enrolled, 0)} icon={<Award />} />
        <StatCard label="النشطات (14 يومًا)" value={rows.reduce((s, r) => s + r.active, 0)} icon={<Award />} tone="green" />
        <StatCard label="الشهادات الصادرة" value={rows.reduce((s, r) => s + r.certificates, 0)} icon={<Award />} tone="amber" />
        <StatCard label="الدورة الأكثر تسجيلًا" value={<span className="text-base">{top?.title}</span>} icon={<Award />} tone="sky" />
      </div>
      <Card className="p-5"><div className="h-72" dir="ltr">
        <ResponsiveContainer><BarChart data={rows.map((r) => ({ name: r.title, 'المسجلات': r.enrolled, 'المكتملات': r.completed, 'المجتازات': r.passed }))}>
          <CartesianGrid vertical={false} stroke={CHART.grid} /><XAxis dataKey="name" tick={tick} /><YAxis allowDecimals={false} tick={tick} width={30} /><Tooltip {...tooltipStyle} /><Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic', fontSize: 12 }} />
          <Bar dataKey="المسجلات" fill={CHART.b} radius={[6, 6, 0, 0]} /><Bar dataKey="المكتملات" fill={CHART.a} radius={[6, 6, 0, 0]} /><Bar dataKey="المجتازات" fill={CHART.c} radius={[6, 6, 0, 0]} />
        </BarChart></ResponsiveContainer></div></Card>
      <Card><Table><thead><tr><th>الدورة</th><th>المسجلات</th><th>النشطات</th><th>المكتملات</th><th>نسبة الإكمال</th><th>متوسط الدرجات</th><th>المجتازات</th><th>الشهادات</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="font-medium">{r.title}</td><td>{r.enrolled}</td><td>{r.active}</td><td>{r.completed}</td><td>{pct(r.completion_rate)}</td><td>{pct(r.avg_score)}</td><td>{r.passed}</td><td>{r.certificates}</td></tr>)}</tbody></Table></Card>
    </div>
  );
}

// ================================================================ settings
const ACTIONS: Record<string, string> = {
  'stage.update': 'تعديل إعدادات مرحلة', 'stage.publish': 'نشر مرحلة', 'stage.close_early': 'إغلاق مرحلة مبكرًا', 'stage.reopen': 'إعادة فتح مرحلة', 'stage.extend': 'تمديد إغلاق مرحلة',
  'stage.exception': 'منح استثناء لطالبة', 'stage.exception_remove': 'إزالة استثناء', 'student.create': 'إضافة طالبة', 'student.bulk_create': 'إضافة مجموعة طالبات', 'student.update': 'تعديل بيانات طالبة',
  'student.disable': 'تعطيل حساب', 'student.enable': 'تفعيل حساب', 'student.reset_password': 'إعادة تعيين كلمة مرور', 'course.create': 'إنشاء دورة', 'course.update': 'تعديل دورة',
  'course.published': 'نشر دورة', 'course.draft': 'إرجاع دورة لمسودة', 'course.archived': 'أرشفة دورة', 'course.delete': 'حذف دورة', 'certificate.revoke': 'إلغاء شهادة', 'certificate.reinstate': 'إعادة تفعيل شهادة',
  'assessment.create': 'إنشاء اختبار', 'assessment.update': 'تعديل اختبار', 'assessment.delete': 'حذف اختبار', 'assessment.manual_grade': 'تصحيح يدوي', 'file.upload': 'رفع ملف', 'lesson.delete': 'حذف درس',
  'module.delete': 'حذف وحدة', 'password.change': 'تغيير كلمة المرور', 'question.update_answered': 'تعديل سؤال سبقت الإجابة عنه',
};

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ full_name: user?.name ?? '', school_name: user?.schoolName ?? '' });
  const { data: audit, loading } = useLoad(() => api.get('/teacher/audit?limit=200'));
  async function save() { try { await api.put('/teacher/profile', p); await refresh(); toast('ok', 'تم الحفظ'); } catch (e: any) { toast('err', e.message); } }
  return (
    <div className="space-y-5">
      <PageHeader title="الإعدادات" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-bold">الملف الشخصي</h2>
          <Field label="الاسم"><Input value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Field>
          <Field label="المدرسة"><Input value={p.school_name} onChange={(e) => setP({ ...p, school_name: e.target.value })} /></Field>
          <Field label="البريد (اسم المستخدم)"><Input value={user?.username} disabled dir="ltr" /></Field>
          <div className="flex gap-2"><Button onClick={save}>حفظ</Button><Link to="/change-password"><Button variant="secondary" icon={<KeyRound size={16} />}>تغيير كلمة المرور</Button></Link></div>
        </Card>
        <Card className="space-y-2 p-5 text-sm text-slate-600">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Lock size={18} />الخصوصية وحماية البيانات</h2>
          <p>تجمع المنصة الحد الأدنى من بيانات الطالبات: الاسم، والرقم التعريفي الداخلي، والمرحلة والصف والفصل، ونتائج التعلم. لا يُطلب رقم الهوية أو الجوال أو تاريخ الميلاد.</p>
          <p>كلمات المرور مشفرة (bcrypt) ولا يمكن لأحد الاطلاع عليها. الملفات محمية بصلاحيات وصول، وكل إجراء إداري مهم يُسجَّل أدناه.</p>
          <p>المنطقة الزمنية المعتمدة: <b>Asia/Riyadh</b>. تُخزَّن الأوقات بتوقيت UTC موحد في قاعدة البيانات.</p>
          <p className="text-xs text-slate-400">راجعي متطلبات نظام حماية البيانات الشخصية في المملكة العربية السعودية وسياسات مدرستك قبل التشغيل الفعلي.</p>
        </Card>
      </div>
      <Card>
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 font-bold"><History size={18} />السجل الإداري</div>
        {loading ? <Spinner /> : !audit?.length ? <Empty title="لا توجد إجراءات مسجلة" /> : (
          <Table><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>العنصر</th><th>التفاصيل</th></tr></thead>
            <tbody>{audit.map((a: any) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</td><td className="text-xs">{a.actor ?? '—'}</td><td>{ACTIONS[a.action] ?? a.action}</td><td className="text-xs">{a.entity} {a.entity_id && <span className="font-mono text-slate-400">{String(a.entity_id).slice(0, 8)}</span>}</td>
              <td className="max-w-xs truncate font-mono text-[11px] text-slate-400" dir="ltr" title={JSON.stringify(a.details)}>{JSON.stringify(a.details)}</td></tr>)}</tbody></Table>
        )}
      </Card>
    </div>
  );
}

export function TeacherNotifications() {
  return <div className="mx-auto max-w-2xl"><PageHeader title="الإشعارات" /><Card className="p-4"><NotificationList /></Card></div>;
}
