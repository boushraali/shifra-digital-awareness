import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserPlus, Users, Upload, Download, Search, KeyRound, Power, FileSpreadsheet, Award, ArrowRight, Copy } from 'lucide-react';
import { api, download, qs } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, Card, Button, Badge, Modal, Field, Input, Select, Textarea, PageHeader, Table, Empty, useToast, Progress, STATUS_COLOR } from '../../lib/ui';
import { fmtDate, fmtDateTime, levelLabel, gradeLabel, pct } from '../../lib/format';

type Created = { full_name: string; student_code: string; temp_password: string };

function credentialsCsv(rows: Created[]) {
  const csv = '﻿' + ['الاسم,اسم المستخدم (الرقم التعريفي),كلمة المرور المؤقتة', ...rows.map((r) => `"${r.full_name}","${r.student_code}","${r.temp_password}"`)].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'بيانات-دخول-الطالبات.csv'; a.click();
}

export function CredentialsModal({ rows, onClose }: { rows: Created[] | null; onClose: () => void }) {
  return (
    <Modal open={!!rows} onClose={onClose} title="بيانات الدخول المؤقتة" wide footer={<><Button variant="secondary" onClick={() => rows && credentialsCsv(rows)} icon={<Download size={16} />}>تنزيل CSV</Button><Button onClick={onClose}>تم</Button></>}>
      <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">تظهر كلمات المرور المؤقتة <b>مرة واحدة فقط</b> ولا تُحفظ نصًا في النظام. سلّميها للطالبات؛ ستُطلب منهن كلمة مرور جديدة عند أول دخول.</div>
      <Table><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>كلمة المرور المؤقتة</th></tr></thead>
        <tbody>{rows?.map((r) => <tr key={r.student_code}><td>{r.full_name}</td><td dir="ltr" className="text-start font-mono">{r.student_code}</td><td dir="ltr" className="text-start font-mono">{r.temp_password}</td></tr>)}</tbody></Table>
    </Modal>
  );
}

const EMPTY = { full_name: '', level: 'intermediate', grade: '1', section: '', student_code: '' };

export function Students() {
  const toast = useToast();
  const [f, setF] = useState({ search: '', level: '', grade: '', section: '', status: '' });
  const { data, loading, error, reload } = useLoad(() => api.get(`/teacher/students${qs(f)}`), [f.level, f.grade, f.section, f.status]);
  const { data: classes } = useLoad(() => api.get('/teacher/students/classes'));
  const [add, setAdd] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [imp, setImp] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [bulkText, setBulkText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<Created[] | null>(null);

  async function saveOne() {
    setBusy(true);
    try { const r = await api.post('/teacher/students', { ...form, grade: Number(form.grade) }); setAdd(false); setForm(EMPTY); setCreds([r]); reload(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  async function submitBulk() {
    const rows = bulkText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [full_name, level, grade, section, student_code] = l.split(/[,\t،]/).map((x) => x?.trim()); return { full_name, level, grade, section, student_code }; });
    setBusy(true); setErrors([]);
    const r = await fetch('/api/teacher/students/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'shifra' }, body: JSON.stringify({ rows }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) { setBulk(false); setBulkText(''); setCreds(j.created); reload(); } else setErrors(j.errors ?? [{ row: 0, message: j.error }]);
  }
  async function submitImport() {
    if (!file) return;
    setBusy(true); setErrors([]);
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/teacher/students/import', { method: 'POST', headers: { 'X-Requested-With': 'shifra' }, body: fd });
    const j = await r.json(); setBusy(false);
    if (r.ok) { setImp(false); setFile(null); setCreds(j.created); reload(); } else setErrors(j.errors ?? [{ row: 0, message: j.error }]);
  }
  async function toggle(s: any) {
    try { await api.patch(`/teacher/students/${s.id}`, { is_active: !s.is_active }); toast('ok', s.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب'); reload(); } catch (e: any) { toast('err', e.message); }
  }
  async function reset(s: any) {
    if (!confirm(`إعادة تعيين كلمة مرور ${s.full_name}؟`)) return;
    try { const r = await api.post(`/teacher/students/${s.id}/reset-password`); setCreds([{ full_name: s.full_name, student_code: r.username, temp_password: r.temp_password }]); } catch (e: any) { toast('err', e.message); }
  }
  const sections = [...new Set((classes ?? []).map((c: any) => c.section))] as string[];
  return (
    <div>
      <PageHeader title="إدارة الطالبات" subtitle={data ? `${data.length} طالبة` : undefined} actions={<>
        <Button icon={<UserPlus size={16} />} onClick={() => setAdd(true)}>إضافة طالبة</Button>
        <Button variant="secondary" icon={<Users size={16} />} onClick={() => { setErrors([]); setBulk(true); }}>إضافة مجموعة</Button>
        <Button variant="secondary" icon={<Upload size={16} />} onClick={() => { setErrors([]); setImp(true); }}>استيراد Excel / CSV</Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download(`/teacher/students/export${qs({ ...f, format: 'xlsx' })}`)}>تصدير تقرير</Button>
      </>} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <form className="relative lg:col-span-2" onSubmit={(e) => { e.preventDefault(); reload(); }}>
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="ps-9" placeholder="ابحثي بالاسم أو الرقم التعريفي…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} onBlur={reload} />
        </form>
        <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">كل المراحل</option><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select>
        <Select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">كل الصفوف</option>{[1, 2, 3].map((g) => <option key={g} value={g}>الصف {gradeLabel(g)}</option>)}</Select>
        <div className="flex gap-2">
          <Select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">كل الفصول</option>{sections.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">الكل</option><option value="active">مفعل</option><option value="inactive">معطل</option></Select>
        </div>
      </Card>
      <Card>
        {loading ? <Spinner /> : error ? <div className="p-4"><ErrorBox error={error} /></div> : !data.length ? <Empty icon={<Users size={40} />} title="لا توجد طالبات" text="أضيفي الطالبات يدويًا أو استوردي قائمة من ملف Excel/CSV." /> : (
          <Table>
            <thead><tr><th>الطالبة</th><th>الرقم التعريفي</th><th>المرحلة / الصف / الفصل</th><th>الحالة</th><th>التسجيل</th><th>رحلة الوعي</th><th>الدورات</th><th>الشهادات</th><th></th></tr></thead>
            <tbody>
              {data.map((s: any) => (
                <tr key={s.id}>
                  <td><Link to={`/teacher/students/${s.id}`} className="font-semibold text-slate-900 hover:text-nova-600">{s.full_name}</Link>{s.is_demo && <Badge className="ms-2" color="amber">تجريبي</Badge>}</td>
                  <td className="font-mono text-xs" dir="ltr">{s.student_code}</td>
                  <td className="whitespace-nowrap text-slate-600">{levelLabel(s.level)} · {gradeLabel(s.grade)} · {s.section}</td>
                  <td><Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'مفعل' : 'معطل'}</Badge></td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                  <td className="min-w-[8rem]"><div className="flex items-center gap-2"><Progress value={(s.stages_completed / 7) * 100} /><span className="text-xs text-slate-500">{s.stages_completed}/7</span></div></td>
                  <td className="whitespace-nowrap text-xs">{s.courses_completed} / {s.courses_enrolled}</td>
                  <td>{s.certificates}</td>
                  <td className="whitespace-nowrap">
                    <button title="إعادة تعيين كلمة المرور" onClick={() => reset(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-nova-600"><KeyRound size={16} /></button>
                    <button title={s.is_active ? 'تعطيل' : 'تفعيل'} onClick={() => toggle(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Power size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={add} onClose={() => setAdd(false)} title="إضافة طالبة" footer={<><Button variant="secondary" onClick={() => setAdd(false)}>إلغاء</Button><Button loading={busy} onClick={saveOne}>إضافة</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الطالبة" className="sm:col-span-2"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="المرحلة الدراسية"><Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select></Field>
          <Field label="الصف"><Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>{[1, 2, 3].map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select></Field>
          <Field label="الفصل"><Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="أ" /></Field>
          <Field label="الرقم التعريفي الداخلي" hint="اختياري — يُولَّد تلقائيًا إن تُرك فارغًا"><Input dir="ltr" value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-xs text-slate-400">تقليلًا لجمع البيانات الشخصية، لا تطلب المنصة رقم الهوية أو الجوال أو تاريخ الميلاد.</p>
      </Modal>

      <Modal open={bulk} onClose={() => setBulk(false)} title="إضافة مجموعة طالبات" wide footer={<><Button variant="secondary" onClick={() => setBulk(false)}>إلغاء</Button><Button loading={busy} onClick={submitBulk}>إضافة الكل</Button></>}>
        <p className="mb-2 text-sm text-slate-600">سطر لكل طالبة بالترتيب: <b>الاسم، المرحلة، الصف، الفصل، الرقم التعريفي (اختياري)</b></p>
        <Textarea rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'ريم أحمد، المتوسطة، 2، أ\nسارة خالد، الثانوية، 1، ب'} />
        <RowErrors errors={errors} />
      </Modal>

      <Modal open={imp} onClose={() => setImp(false)} title="استيراد قائمة طالبات" footer={<><Button variant="secondary" onClick={() => setImp(false)}>إلغاء</Button><Button loading={busy} disabled={!file} onClick={submitImport} icon={<Upload size={16} />}>استيراد</Button></>}>
        <div className="space-y-3 text-sm text-slate-600">
          <p>ارفعي ملف <b>Excel (.xlsx)</b> أو <b>CSV</b>. يجب أن يحتوي الصف الأول على العناوين:</p>
          <div className="flex flex-wrap gap-1.5">{['الاسم', 'المرحلة', 'الصف', 'الفصل', 'الرقم التعريفي (اختياري)'].map((h) => <Badge key={h} color="violet">{h}</Badge>)}</div>
          <button className="flex items-center gap-1 font-semibold text-nova-600" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿الاسم,المرحلة,الصف,الفصل,الرقم التعريفي\nريم أحمد,المتوسطة,2,أ,\n'], { type: 'text/csv' })); a.download = 'نموذج-استيراد-الطالبات.csv'; a.click(); }}><FileSpreadsheet size={16} />تنزيل نموذج</button>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-6 hover:border-nova-400">
            <Upload className="text-slate-400" /><span>{file ? file.name : 'اختاري الملف'}</span>
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <p className="text-xs text-slate-400">يتم التحقق من جميع الصفوف قبل الإضافة؛ إذا وُجد خطأ لا تُضاف أي طالبة حتى يُصحَّح الملف.</p>
          <RowErrors errors={errors} />
        </div>
      </Modal>
      <CredentialsModal rows={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

const RowErrors = ({ errors }: { errors: { row: number; message: string }[] }) => !errors.length ? null : (
  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
    {errors.map((e, i) => <li key={i}>{e.row ? `الصف ${e.row}: ` : ''}{e.message}</li>)}
  </ul>
);

const STAGE_STATE: Record<string, [string, string]> = {
  completed: ['مكتملة', 'green'], open: ['متاحة', 'blue'], upcoming: ['قريبًا', 'gray'], locked: ['مغلقة', 'gray'], ended: ['انتهت المدة', 'amber'], expired_incomplete: ['غير مكتملة — انتهى الوقت', 'red'],
};

export function StudentFile() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/teacher/students/${id}`), [id]);
  const [creds, setCreds] = useState<Created[] | null>(null);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const s = data.student;
  async function extra(stageId: number) {
    try { await api.put(`/teacher/stages/${stageId}/exceptions/${id}`, { extra_attempts: 1 + (data.stages.find((x: any) => x.id === stageId)?.exception?.extra_attempts ?? 0), grant_access: data.stages.find((x: any) => x.id === stageId)?.exception?.grant_access ?? false, reason: 'محاولة إضافية من ملف الطالبة' }); toast('ok', 'تم منح محاولة إضافية'); reload(); }
    catch (e: any) { toast('err', e.message); }
  }
  return (
    <div className="space-y-5">
      <Link to="/teacher/students" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowRight size={16} />إدارة الطالبات</Link>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-nova-600 text-xl font-bold text-white">{s.full_name[0]}</div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{s.full_name}</h1>
          <div className="text-sm text-slate-500"><span dir="ltr">{s.student_code}</span> · {levelLabel(s.level)} · الصف {gradeLabel(s.grade)} · فصل {s.section} · آخر دخول {fmtDateTime(s.last_login_at)}</div>
        </div>
        <Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'مفعل' : 'معطل'}</Badge>
        <div className="text-center"><div className="text-2xl font-bold text-nova-600">{data.points}</div><div className="text-xs text-slate-500">نقطة</div></div>
        <Button variant="secondary" size="sm" icon={<Copy size={14} />} onClick={async () => { const r = await api.post(`/teacher/students/${id}/reset-password`); setCreds([{ full_name: s.full_name, student_code: r.username, temp_password: r.temp_password }]); }}>إعادة تعيين كلمة المرور</Button>
      </Card>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">تقدم رحلة الوعي الرقمي</div>
        <Table>
          <thead><tr><th>المرحلة</th><th>الحالة</th><th>تاريخ البدء</th><th>تاريخ الإكمال</th><th>المحاولات</th><th>الدرجة النهائية</th><th>استثناء</th><th></th></tr></thead>
          <tbody>
            {data.stages.map((st: any) => {
              const [label, color] = STAGE_STATE[st.state];
              return (
                <tr key={st.id}>
                  <td className="font-medium"><span className="me-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />{st.id}. {st.title}</td>
                  <td><Badge color={st.progress?.status === 'failed' && st.state === 'open' ? 'amber' : color}>{st.progress?.status === 'failed' && st.state === 'open' ? 'لم تجتز بعد' : label}</Badge></td>
                  <td className="text-xs text-slate-500">{fmtDateTime(st.progress?.first_started_at)}</td>
                  <td className="text-xs text-slate-500">{fmtDateTime(st.progress?.completed_at)}</td>
                  <td>{st.attempts.length} <span className="text-xs text-slate-400">(متبقٍ {st.attemptsLeft})</span></td>
                  <td className="font-semibold">{pct(st.progress?.best_score)}</td>
                  <td className="text-xs">{st.exception ? <Badge color="violet">{st.exception.grant_access ? 'وصول خاص' : ''}{st.exception.extra_attempts ? ` +${st.exception.extra_attempts} محاولة` : ''}</Badge> : '—'}</td>
                  <td>{st.state !== 'completed' && <Button size="sm" variant="ghost" onClick={() => extra(st.id)}>+ محاولة</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">تقدم الدورات التدريبية</div>
        {!data.courses.length ? <Empty title="لم تسجل في أي دورة" /> : (
          <div className="divide-y divide-slate-100">
            {data.courses.map((c: any) => (
              <div key={c.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3"><b className="text-slate-900">{c.title}</b><Badge color={STATUS_COLOR[c.status]}>{c.statusLabel}</Badge>
                  <span className="text-xs text-slate-500">سُجّلت {fmtDate(c.enrolled_at)}{c.completed_at && ` · أكملت ${fmtDate(c.completed_at)}`}</span>
                  <div className="ms-auto flex w-48 items-center gap-2"><Progress value={c.progress} /><span className="text-xs">{c.progress}%</span></div></div>
                {!!c.tests.length && <div className="mt-3 flex flex-wrap gap-2">{c.tests.map((t: any, i: number) => <Badge key={i} color={t.status === 'pending_review' ? 'violet' : t.passed ? 'green' : 'red'}>{t.title} · م{t.attempt_no}: {t.status === 'pending_review' ? 'بانتظار التصحيح' : pct(t.score_pct)}</Badge>)}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">الشهادات</div>
        {!data.certificates.length ? <Empty title="لا توجد شهادات" /> : (
          <ul className="divide-y divide-slate-100">{data.certificates.map((c: any) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm"><Award size={18} className="text-amber-500" /><span className="flex-1">{c.title}</span><span className="font-mono text-xs" dir="ltr">{c.serial}</span><Badge color={c.status === 'valid' ? 'green' : 'red'}>{c.status === 'valid' ? 'سارية' : 'ملغاة'}</Badge><Link to={`/teacher/certificates/${c.id}`} className="text-nova-600">عرض</Link></li>
          ))}</ul>
        )}
      </Card>
      <CredentialsModal rows={creds} onClose={() => setCreds(null)} />
    </div>
  );
}
