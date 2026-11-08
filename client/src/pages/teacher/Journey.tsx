import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, Download, Eye, Users, Search, Trash2, ChevronDown, Info, CalendarClock } from 'lucide-react';
import { api, download, qs } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, Card, Button, Badge, Modal, Field, Input, Select, PageHeader, Table, Empty, useToast, Toggle, DateTimeField, STATUS_COLOR, Tabs, cx } from '../../lib/ui';
import { fmtDateTime, levelLabel, gradeLabel, pct } from '../../lib/format';
import { WorldIcon } from '../../components/Art';

// ======================================================= journey overview
export function JourneyOverview() {
  const { data, loading, error } = useLoad(() => api.get('/teacher/stages'));
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { if (open) { setDetail(null); api.get(`/teacher/stages/${open}`).then(setDetail); } }, [open]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  return (
    <div>
      <PageHeader title="رحلة الوعي الرقمي" subtitle="مدينة نوفا الرقمية — سبعة عوالم تفاعلية. استعرضي محتوى كل عالم ونتائجه." actions={<Link to="/teacher/stages"><Button icon={<CalendarClock size={16} />}>إدارة المواعيد والإتاحة</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((s: any) => (
          <Card key={s.id} className="overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${s.color}, #1e1b4b)` }}><WorldIcon name={s.icon} size={26} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{s.id}. {s.title}</h3><Badge color={STATUS_COLOR[s.status]}>{s.statusLabel}</Badge></div>
                <div className="text-sm text-slate-500">{s.topic}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2"><b className="block text-base text-slate-900">{s.started}</b>بدأن</div>
                  <div className="rounded-lg bg-slate-50 p-2"><b className="block text-base text-slate-900">{s.completed}</b>أكملن</div>
                  <div className="rounded-lg bg-slate-50 p-2"><b className="block text-base text-slate-900">{pct(s.avg_score)}</b>متوسط الدرجة</div>
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(open === s.id ? null : s.id)} className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2.5 text-sm font-semibold text-nova-600 hover:bg-slate-50">
              <Eye size={15} />{open === s.id ? 'إخفاء المحتوى' : 'استعراض المحتوى والأنشطة'}<ChevronDown size={15} className={cx('transition', open === s.id && 'rotate-180')} />
            </button>
            {open === s.id && (
              <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                {!detail ? <Spinner /> : (
                  <ol className="space-y-2 text-sm">
                    {detail.steps.map((st: any) => (
                      <li key={st.id} className="rounded-xl bg-white p-3 shadow-card">
                        <div className="flex items-center gap-2"><Badge color={st.kind === 'scenario' ? 'blue' : st.kind === 'minigame' ? 'amber' : 'violet'}>{st.kind === 'scenario' ? 'سيناريو' : st.kind === 'minigame' ? 'لعبة مصغرة' : 'تقييم'}</Badge><b>{st.position}. {st.title}</b></div>
                        {st.kind !== 'minigame' && (
                          <ul className="mt-2 space-y-1 text-xs text-slate-600">
                            {st.content.question && <li className="font-medium text-slate-800">{st.content.question}</li>}
                            {st.choices.map((c: any, i: number) => <li key={i} className="flex gap-2"><span className={cx('w-8 shrink-0 font-bold', c.points >= 10 ? 'text-emerald-600' : c.points > 0 ? 'text-amber-600' : 'text-rose-500')}>{c.points}</span>{c.label}{c.followup && <Badge color="gray">+ قرار متفرّع</Badge>}</li>)}
                          </ul>
                        )}
                        {st.kind === 'minigame' && <div className="mt-1 text-xs text-slate-500">{st.content.instructions}</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ======================================================= stage management
type Settings = {
  publish_state: string; open_at: string | null; close_at: string | null; target_type: string; target_level: string | null; target_grade: number | null;
  target_class_id: number | null; target_students: string[]; pass_score: number; max_attempts: number; allow_retry: boolean; require_previous: boolean; show_answers: string;
};
const PUBLISH = [['draft', 'مسودة'], ['published', 'منشورة (حسب المواعيد)'], ['closed', 'مغلقة يدويًا']];

export function StagesManagement() {
  const { data, loading, error, reload } = useLoad(() => api.get('/teacher/stages'));
  const [edit, setEdit] = useState<number | null>(null);
  const [results, setResults] = useState<number | null>(null);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  return (
    <div>
      <PageHeader title="إدارة مراحل رحلة الوعي الرقمي" subtitle="حددي مواعيد فتح وإغلاق كل مرحلة والفئة المستهدفة وشروط الاجتياز. التغييرات تنعكس فورًا على حسابات الطالبات (بتوقيت الرياض)." />
      <Card>
        <Table>
          <thead><tr><th>#</th><th>المرحلة</th><th>الفتح</th><th>الإغلاق</th><th>الحالة</th><th>الفئة</th><th>بدأنها</th><th>أكملنها</th><th></th></tr></thead>
          <tbody>
            {data.map((s: any) => (
              <tr key={s.id}>
                <td className="font-bold">{s.id}</td>
                <td><div className="font-semibold text-slate-900">{s.title}</div><div className="max-w-xs truncate text-xs text-slate-500">{s.summary}</div></td>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(s.open_at)}</td>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(s.close_at)}</td>
                <td><Badge color={STATUS_COLOR[s.status]}>{s.statusLabel}</Badge>{s.exceptions > 0 && <Badge color="violet" className="ms-1">{s.exceptions} استثناء</Badge>}</td>
                <td className="whitespace-nowrap text-xs">{targetLabel(s)}</td>
                <td>{s.started}</td><td>{s.completed}</td>
                <td className="whitespace-nowrap">
                  <Button size="sm" icon={<Settings2 size={14} />} onClick={() => setEdit(s.id)}>إدارة المرحلة</Button>
                  <Button size="sm" variant="ghost" onClick={() => setResults(s.id)}>النتائج</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs text-sky-800"><Info size={16} className="shrink-0" />قبل موعد الفتح تظهر المرحلة للطالبة بحالة «قريبًا»، وخلال الفترة «متاحة الآن»، وبعد الإغلاق «انتهت فترة المرحلة» ويُمنع بدء محاولات جديدة. يتحقق الخادم من المواعيد في كل طلب.</div>
      {edit && <StageSettingsModal id={edit} onClose={() => setEdit(null)} onSaved={reload} />}
      {results && <StageResultsModal id={results} onClose={() => setResults(null)} />}
    </div>
  );
}

function targetLabel(s: any) {
  switch (s.target_type) {
    case 'all': return 'جميع الطالبات';
    case 'level': return `المرحلة ${levelLabel(s.target_level)}`;
    case 'grade': return `الصف ${gradeLabel(s.target_grade)} ${levelLabel(s.target_level)}`;
    case 'class': return `فصل ${gradeLabel(s.t_grade)} ${levelLabel(s.t_level)} — ${s.t_section}`;
    default: return 'طالبات محددات';
  }
}

function StageSettingsModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get(`/teacher/stages/${id}`), [id]);
  const { data: classes } = useLoad(() => api.get('/teacher/students/classes'));
  const { data: students } = useLoad(() => api.get('/teacher/students?status=active'));
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<'settings' | 'exceptions'>('settings');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [ex, setEx] = useState({ student: '', grant_access: false, extra_attempts: 0, close_at_override: null as string | null, reason: '' });
  useEffect(() => {
    if (data) setS({ publish_state: data.publish_state, open_at: data.open_at, close_at: data.close_at, target_type: data.target_type, target_level: data.target_level, target_grade: data.target_grade,
      target_class_id: data.target_class_id, target_students: data.targets.map((t: any) => t.id), pass_score: data.pass_score, max_attempts: data.max_attempts, allow_retry: data.allow_retry,
      require_previous: data.require_previous, show_answers: data.show_answers });
  }, [data]);
  if (!data || !s) return <Modal open onClose={onClose} title="إدارة المرحلة"><Spinner /></Modal>;
  const up = (p: Partial<Settings>) => setS({ ...s, ...p });
  async function save() {
    setBusy(true);
    try { await api.put(`/teacher/stages/${id}`, s); toast('ok', 'تم حفظ ونشر إعدادات المرحلة'); onSaved(); onClose(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  async function saveEx() {
    if (!ex.student) return toast('err', 'اختاري الطالبة');
    try { await api.put(`/teacher/stages/${id}/exceptions/${ex.student}`, { grant_access: ex.grant_access, extra_attempts: ex.extra_attempts, close_at_override: ex.close_at_override, reason: ex.reason }); toast('ok', 'تم حفظ الاستثناء'); setEx({ student: '', grant_access: false, extra_attempts: 0, close_at_override: null, reason: '' }); reload(); }
    catch (e: any) { toast('err', e.message); }
  }
  async function removeEx(sid: string) { await api.del(`/teacher/stages/${id}/exceptions/${sid}`); reload(); }
  const quick = (action: 'close' | 'open_now' | 'extend') => {
    if (action === 'close') up({ publish_state: 'closed' });
    if (action === 'open_now') up({ publish_state: 'published', open_at: new Date().toISOString() });
    if (action === 'extend') up({ close_at: new Date((s.close_at ? new Date(s.close_at).getTime() : Date.now()) + 7 * 864e5).toISOString() });
  };
  const filtered = (students ?? []).filter((x: any) => !pick || x.full_name.includes(pick) || x.student_code.toLowerCase().includes(pick.toLowerCase()));
  return (
    <Modal open onClose={onClose} wide title={`إدارة المرحلة ${id}: ${data.title}`} footer={tab === 'settings' && <><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ ونشر الإعدادات</Button></>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'settings', label: 'الإعدادات' }, { id: 'exceptions', label: 'الاستثناءات الفردية', count: data.exceptions.length }]} />
      {tab === 'settings' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => quick('open_now')}>فتح الآن</Button>
            <Button size="sm" variant="secondary" onClick={() => quick('extend')}>تمديد الإغلاق 7 أيام</Button>
            <Button size="sm" variant="secondary" onClick={() => quick('close')}>إغلاق مبكر</Button>
          </div>
          <section className="grid gap-4 sm:grid-cols-2">
            <DateTimeField label="1. تاريخ ووقت الفتح" value={s.open_at} onChange={(v) => up({ open_at: v })} hint="بتوقيت الرياض — اتركيه فارغًا للفتح فور النشر" />
            <DateTimeField label="2. تاريخ ووقت الإغلاق" value={s.close_at} onChange={(v) => up({ close_at: v })} hint="آخر موعد للدخول وإكمال المرحلة" />
          </section>
          <Field label="3. حالة النشر">
            <div className="grid grid-cols-3 gap-2">{PUBLISH.map(([v, l]) => <button key={v} type="button" onClick={() => up({ publish_state: v })} className={cx('rounded-xl border px-3 py-2 text-sm font-medium', s.publish_state === v ? 'border-nova-500 bg-nova-50 text-nova-700' : 'border-slate-200 text-slate-600')}>{l}</button>)}</div>
          </Field>
          <section className="space-y-3">
            <div className="text-sm font-medium text-slate-700">4. الفئة المستهدفة</div>
            <div className="flex flex-wrap gap-2">{[['all', 'جميع الطالبات'], ['level', 'مرحلة دراسية'], ['grade', 'صف معين'], ['class', 'فصل معين'], ['students', 'طالبات محددات']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => up({ target_type: v })} className={cx('rounded-full border px-3 py-1.5 text-sm', s.target_type === v ? 'border-nova-500 bg-nova-50 text-nova-700' : 'border-slate-200 text-slate-600')}>{l}</button>
            ))}</div>
            {(s.target_type === 'level' || s.target_type === 'grade') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={s.target_level ?? ''} onChange={(e) => up({ target_level: e.target.value || null })}><option value="">اختاري المرحلة</option><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select>
                {s.target_type === 'grade' && <Select value={s.target_grade ?? ''} onChange={(e) => up({ target_grade: Number(e.target.value) || null })}><option value="">اختاري الصف</option>{[1, 2, 3].map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select>}
              </div>
            )}
            {s.target_type === 'class' && <Select value={s.target_class_id ?? ''} onChange={(e) => up({ target_class_id: Number(e.target.value) || null })}><option value="">اختاري الفصل</option>{(classes ?? []).map((c: any) => <option key={c.id} value={c.id}>{gradeLabel(c.grade)} {levelLabel(c.level)} — {c.section} ({c.students})</option>)}</Select>}
            {s.target_type === 'students' && (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="relative mb-2"><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="ps-9" placeholder="بحث…" value={pick} onChange={(e) => setPick(e.target.value)} /></div>
                <div className="max-h-48 space-y-1 overflow-y-auto">{filtered.map((st: any) => (
                  <label key={st.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50"><input type="checkbox" checked={s.target_students.includes(st.id)} onChange={(e) => up({ target_students: e.target.checked ? [...s.target_students, st.id] : s.target_students.filter((x) => x !== st.id) })} />{st.full_name}<span className="text-xs text-slate-400">{gradeLabel(st.grade)}/{st.section}</span></label>
                ))}</div>
                <div className="mt-2 text-xs text-slate-500">تم اختيار {s.target_students.length}</div>
              </div>
            )}
          </section>
          <section>
            <div className="mb-2 text-sm font-medium text-slate-700">5. شروط الاجتياز</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="درجة النجاح (%)"><Input type="number" min={0} max={100} value={s.pass_score} onChange={(e) => up({ pass_score: Number(e.target.value) })} /></Field>
              <Field label="عدد المحاولات المسموح بها"><Input type="number" min={1} max={20} value={s.max_attempts} onChange={(e) => up({ max_attempts: Number(e.target.value) })} /></Field>
              <Toggle label="إمكانية إعادة المرحلة" checked={s.allow_retry} onChange={(v) => up({ allow_retry: v })} />
              <Toggle label="اشتراط إكمال المرحلة السابقة" checked={s.require_previous} onChange={(v) => up({ require_previous: v })} />
              <Field label="إظهار الإجابات الصحيحة" className="sm:col-span-2">
                <Select value={s.show_answers} onChange={(e) => up({ show_answers: e.target.value })}><option value="after_attempt">بعد انتهاء المحاولة</option><option value="after_close">بعد إغلاق المرحلة</option><option value="never">عدم الإظهار</option></Select>
              </Field>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold text-slate-800">إضافة استثناء لطالبة</div>
            <Select value={ex.student} onChange={(e) => setEx({ ...ex, student: e.target.value })}><option value="">اختاري الطالبة</option>{(students ?? []).map((st: any) => <option key={st.id} value={st.id}>{st.full_name} — {st.student_code}</option>)}</Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle label="إتاحة المرحلة لها (حتى لو لم تكن ضمن الفئة أو مغلقة)" checked={ex.grant_access} onChange={(v) => setEx({ ...ex, grant_access: v })} />
              <Field label="محاولات إضافية"><Input type="number" min={0} max={10} value={ex.extra_attempts} onChange={(e) => setEx({ ...ex, extra_attempts: Number(e.target.value) })} /></Field>
              <DateTimeField label="موعد إغلاق خاص بها (تمديد)" value={ex.close_at_override} onChange={(v) => setEx({ ...ex, close_at_override: v })} />
              <Field label="السبب"><Input value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} placeholder="مثال: غياب بعذر" /></Field>
            </div>
            <Button onClick={saveEx}>حفظ الاستثناء</Button>
          </Card>
          {!data.exceptions.length ? <Empty icon={<Users size={32} />} title="لا توجد استثناءات" /> : (
            <Table><thead><tr><th>الطالبة</th><th>وصول خاص</th><th>محاولات إضافية</th><th>إغلاق خاص</th><th>السبب</th><th></th></tr></thead>
              <tbody>{data.exceptions.map((e: any) => <tr key={e.student_id}><td>{e.full_name}</td><td>{e.grant_access ? 'نعم' : '—'}</td><td>{e.extra_attempts || '—'}</td><td className="text-xs">{fmtDateTime(e.close_at_override)}</td><td className="text-xs">{e.reason}</td><td><button onClick={() => removeEx(e.student_id)} className="text-rose-500"><Trash2 size={16} /></button></td></tr>)}</tbody></Table>
          )}
          <p className="text-xs text-slate-400">تُسجَّل جميع الاستثناءات وتغييرات المواعيد في السجل الإداري.</p>
        </div>
      )}
    </Modal>
  );
}

function StageResultsModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading } = useLoad(() => api.get(`/teacher/stages/${id}/results`), [id]);
  return (
    <Modal open onClose={onClose} wide title={`نتائج المرحلة ${id}`} footer={<><Button variant="secondary" icon={<Download size={16} />} onClick={() => download(`/teacher/stages/${id}/results?format=xlsx`)}>Excel</Button><Button variant="secondary" onClick={() => download(`/teacher/stages/${id}/results?format=csv`)}>CSV</Button></>}>
      {loading || !data ? <Spinner /> : (
        <div className="space-y-4">
          {!!data.hardest.length && <div><div className="mb-2 text-sm font-semibold">الأنشطة الأصعب (أقل متوسط)</div><div className="flex flex-wrap gap-2">{data.hardest.slice(0, 5).map((h: any) => <Badge key={h.position} color={h.avg_pct < 50 ? 'red' : 'amber'}>{h.position}. {h.title} — {pct(h.avg_pct)}</Badge>)}</div></div>}
          {!data.rows.length ? <Empty title="لا توجد نتائج بعد" /> : (
            <Table><thead><tr><th>الطالبة</th><th>الفصل</th><th>الحالة</th><th>المحاولات</th><th>أفضل درجة</th><th>البدء</th><th>الإكمال</th></tr></thead>
              <tbody>{data.rows.map((r: any) => <tr key={r.id}><td><Link className="hover:text-nova-600" to={`/teacher/students/${r.id}`}>{r.full_name}</Link></td><td className="text-xs">{gradeLabel(r.grade)}/{r.section}</td><td><Badge color={STATUS_COLOR[r.status ?? 'not_started']}>{r.status_label}</Badge></td><td>{r.attempts ?? 0}</td><td>{pct(r.best_score)}</td><td className="text-xs">{fmtDateTime(r.first_started_at)}</td><td className="text-xs">{fmtDateTime(r.completed_at)}</td></tr>)}</tbody></Table>
          )}
        </div>
      )}
    </Modal>
  );
}

// ======================================================= progress matrix
export function ProgressMatrix() {
  const [f, setF] = useState({ level: '', grade: '', section: '' });
  const { data, loading, error } = useLoad(() => api.get(`/teacher/stages/progress/matrix${qs(f)}`), [f.level, f.grade, f.section]);
  const cell = (x: any) => !x ? <span className="text-slate-300">—</span> : (
    <span className={cx('inline-flex min-w-[3.2rem] justify-center rounded-lg px-1.5 py-1 text-xs font-semibold', x.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : x.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700')} title={`${x.attempts} محاولات`}>
      {x.status === 'completed' ? `✓ ${Math.round(x.best)}%` : x.status === 'failed' ? `${Math.round(x.best ?? 0)}%` : '…'}
    </span>
  );
  return (
    <div>
      <PageHeader title="متابعة تقدم الطالبات" subtitle="حالة كل طالبة في كل مرحلة من مراحل رحلة الوعي الرقمي" actions={<Button variant="secondary" icon={<Download size={16} />} onClick={() => download(`/teacher/stages/progress/matrix${qs({ ...f, format: 'xlsx' })}`)}>تصدير Excel</Button>} />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <Select className="w-auto" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">كل المراحل</option><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select>
        <Select className="w-auto" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">كل الصفوف</option>{[1, 2, 3].map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select>
        <Input className="w-32" placeholder="الفصل" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        <div className="ms-auto flex items-center gap-3 text-xs"><span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">مكتملة</span><span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">قيد التقدم</span><span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">لم تجتز</span></div>
      </Card>
      <Card>
        {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !data.length ? <Empty title="لا توجد طالبات" /> : (
          <Table>
            <thead><tr><th>الطالبة</th><th>الفصل</th>{[1, 2, 3, 4, 5, 6, 7].map((n) => <th key={n} className="!text-center">م{n}</th>)}<th>المكتمل</th></tr></thead>
            <tbody>{data.map((r: any) => {
              const done = Object.values(r.stages).filter((x: any) => x.status === 'completed').length;
              return <tr key={r.id}><td><Link to={`/teacher/students/${r.id}`} className="font-medium hover:text-nova-600">{r.full_name}</Link></td><td className="whitespace-nowrap text-xs">{gradeLabel(r.grade)} {levelLabel(r.level)}/{r.section}</td>{[1, 2, 3, 4, 5, 6, 7].map((n) => <td key={n} className="text-center">{cell(r.stages[n])}</td>)}<td className="font-bold">{done}/7</td></tr>;
            })}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
