import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Download, CheckCircle2, ArrowUp, ArrowDown, ListChecks } from 'lucide-react';
import { api, download, qs } from '../../lib/api';
import { useLoad, Spinner, Card, Button, Badge, Modal, Field, Input, Select, Textarea, PageHeader, Table, Empty, useToast, Toggle, DateTimeField, Tabs, cx } from '../../lib/ui';
import { fmtDateTime, pct } from '../../lib/format';

const QTYPES = [['mcq', 'اختيار من متعدد'], ['tf', 'صح أو خطأ'], ['multi', 'اختيار أكثر من إجابة'], ['match', 'مطابقة العناصر'], ['order', 'ترتيب الخطوات'], ['short', 'إجابة قصيرة (تصحيح يدوي عند الحاجة)']] as const;
const QLABEL = Object.fromEntries(QTYPES);
const DIFF: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
const rid = () => Math.random().toString(36).slice(2, 8);

export function Assessments() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'bank') as 'bank' | 'tests' | 'results' | 'grading';
  const course = sp.get('course') ?? '';
  const { data: courses } = useLoad(() => api.get('/teacher/courses'));
  const { data: grading, reload: reloadGrading } = useLoad(() => api.get('/teacher/assessments/grading'));
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  return (
    <div>
      <PageHeader title="بنك الأسئلة والاختبارات" subtitle="أضيفي الأسئلة بأنواعها، وكوّني الاختبارات، وتابعي النتائج والتصحيح." actions={
        <Select className="w-64" value={course} onChange={(e) => set('course', e.target.value)}><option value="">كل الدورات</option>{(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>} />
      <Tabs value={tab} onChange={(v) => set('tab', v)} tabs={[{ id: 'bank', label: 'بنك الأسئلة' }, { id: 'tests', label: 'الاختبارات' }, { id: 'results', label: 'النتائج' }, { id: 'grading', label: 'التصحيح اليدوي', count: grading?.length }]} />
      {tab === 'bank' && <Bank course={course} courses={courses ?? []} />}
      {tab === 'tests' && <Tests course={course} courses={courses ?? []} />}
      {tab === 'results' && <Results course={course} />}
      {tab === 'grading' && <Grading items={grading} reload={reloadGrading} />}
    </div>
  );
}

function Bank({ course, courses }: { course: string; courses: any[] }) {
  const { data, loading, reload } = useLoad(() => api.get(`/teacher/assessments/questions${qs({ course_id: course })}`), [course]);
  const [edit, setEdit] = useState<any>(null);
  const toast = useToast();
  async function del(q: any) { if (!confirm('حذف السؤال؟')) return; try { await api.del(`/teacher/assessments/questions/${q.id}`); reload(); } catch (e: any) { toast('err', e.message); } }
  return (
    <Card>
      <div className="flex justify-between p-4"><span className="text-sm text-slate-500">{data?.length ?? 0} سؤال</span><Button icon={<Plus size={16} />} disabled={!courses.length} onClick={() => setEdit({ course_id: course || courses[0]?.id })}>إضافة سؤال</Button></div>
      {loading ? <Spinner /> : !data?.length ? <Empty icon={<ListChecks size={36} />} title="لا توجد أسئلة" text="ابدئي بإضافة أسئلة للدورة." /> : (
        <Table><thead><tr><th>السؤال</th><th>النوع</th><th>الدورة / الوحدة</th><th>الدرجة</th><th>الصعوبة</th><th></th></tr></thead>
          <tbody>{data.map((q: any) => <tr key={q.id}><td className="max-w-md">{q.text}</td><td><Badge color="violet">{QLABEL[q.qtype]}</Badge></td><td className="text-xs">{q.course_title}{q.module_title && <div className="text-slate-400">{q.module_title}</div>}</td><td>{q.points}</td><td className="text-xs">{DIFF[q.difficulty]}</td>
            <td className="whitespace-nowrap"><button onClick={() => setEdit(q)} className="p-1.5 text-slate-400 hover:text-nova-600"><Pencil size={15} /></button><button onClick={() => del(q)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button></td></tr>)}</tbody></Table>
      )}
      {edit && <QuestionForm q={edit} courses={courses} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </Card>
  );
}

function QuestionForm({ q, courses, onClose, onSaved }: { q: any; courses: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const init = () => {
    const base = { course_id: q.course_id, module_id: q.module_id ?? null, qtype: q.qtype ?? 'mcq', text: q.text ?? '', points: q.points ?? 1, explanation: q.explanation ?? '', difficulty: q.difficulty ?? 'medium' };
    return { ...base, options: q.options ?? [{ id: rid(), text: '' }, { id: rid(), text: '' }, { id: rid(), text: '' }], answer: q.answer ?? {} };
  };
  const [f, setF] = useState<any>(init);
  const [busy, setBusy] = useState(false);
  const { data: course } = useLoad(() => (f.course_id ? api.get(`/teacher/courses/${f.course_id}`) : Promise.resolve(null)), [f.course_id]);
  const up = (p: any) => setF({ ...f, ...p });
  function setType(t: string) {
    const o = t === 'match' ? { left: [{ id: rid(), text: '' }, { id: rid(), text: '' }], right: [{ id: rid(), text: '' }, { id: rid(), text: '' }] } : t === 'tf' || t === 'short' ? [] : Array.isArray(f.options) && f.options.length ? f.options : [{ id: rid(), text: '' }, { id: rid(), text: '' }];
    up({ qtype: t, options: o, answer: t === 'tf' ? { correct: true } : t === 'short' ? { accepted: [] } : t === 'order' ? { order: (o as any[]).map((x) => x.id) } : t === 'match' ? { pairs: {} } : t === 'multi' ? { correct: [] } : {} });
  }
  async function save() {
    const body = { ...f, points: Number(f.points) };
    if (f.qtype === 'order') body.answer = { order: f.options.map((o: any) => o.id) };
    if (f.qtype === 'match') body.answer = { pairs: Object.fromEntries(f.options.left.map((l: any, i: number) => [l.id, f.options.right[i]?.id])) };
    setBusy(true);
    try { if (q.id) await api.put(`/teacher/assessments/questions/${q.id}`, body); else await api.post('/teacher/assessments/questions', body); toast('ok', 'تم حفظ السؤال'); onSaved(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  const opts: any[] = Array.isArray(f.options) ? f.options : [];
  const setOpt = (i: number, text: string) => up({ options: opts.map((o, k) => (k === i ? { ...o, text } : o)) });
  return (
    <Modal open onClose={onClose} wide title={q.id ? 'تعديل السؤال' : 'إضافة سؤال'} footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ السؤال</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الدورة"><Select value={f.course_id} disabled={!!q.id} onChange={(e) => up({ course_id: e.target.value, module_id: null })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
        <Field label="الوحدة المرتبطة"><Select value={f.module_id ?? ''} onChange={(e) => up({ module_id: e.target.value || null })}><option value="">— عامة —</option>{(course?.modules ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
        <Field label="نوع السؤال"><Select value={f.qtype} onChange={(e) => setType(e.target.value)}>{QTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="الدرجة"><Input type="number" min={0.5} step={0.5} value={f.points} onChange={(e) => up({ points: e.target.value })} /></Field>
          <Field label="الصعوبة"><Select value={f.difficulty} onChange={(e) => up({ difficulty: e.target.value })}>{Object.entries(DIFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></div>
        <Field label="نص السؤال" className="sm:col-span-2"><Textarea rows={2} value={f.text} onChange={(e) => up({ text: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-2 text-sm font-medium text-slate-700">الإجابات والإجابة الصحيحة</div>
          {(f.qtype === 'mcq' || f.qtype === 'multi') && (
            <div className="space-y-2">
              {opts.map((o, i) => {
                const on = f.qtype === 'mcq' ? f.answer.correct === o.id : (f.answer.correct ?? []).includes(o.id);
                return (
                  <div key={o.id} className="flex items-center gap-2">
                    <button type="button" onClick={() => up({ answer: f.qtype === 'mcq' ? { correct: o.id } : { correct: on ? f.answer.correct.filter((x: string) => x !== o.id) : [...(f.answer.correct ?? []), o.id] } })}
                      className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent')} aria-label="تحديد كإجابة صحيحة"><CheckCircle2 size={16} /></button>
                    <Input value={o.text} onChange={(e) => setOpt(i, e.target.value)} placeholder={`الخيار ${i + 1}`} />
                    <button type="button" onClick={() => up({ options: opts.filter((_, k) => k !== i) })} disabled={opts.length <= 2} className="p-1 text-slate-400 disabled:opacity-30"><Trash2 size={16} /></button>
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => up({ options: [...opts, { id: rid(), text: '' }] })}>إضافة خيار</Button>
              <p className="text-xs text-slate-400">اضغطي على المربع بجانب الخيار لتحديده كإجابة صحيحة{f.qtype === 'multi' ? ' (يمكن تحديد أكثر من خيار)' : ''}.</p>
            </div>
          )}
          {f.qtype === 'tf' && <div className="flex gap-2">{[[true, 'صح'], [false, 'خطأ']].map(([v, l]) => <button key={String(v)} type="button" onClick={() => up({ answer: { correct: v } })} className={cx('flex-1 rounded-xl border py-2', f.answer.correct === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200')}>{l as string}</button>)}</div>}
          {f.qtype === 'order' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">أدخلي الخطوات بالترتيب الصحيح؛ ستُعرض للطالبة بترتيب عشوائي.</p>
              {opts.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2"><b className="w-6 text-center">{i + 1}</b><Input value={o.text} onChange={(e) => setOpt(i, e.target.value)} />
                  <button type="button" disabled={i === 0} onClick={() => { const x = [...opts]; [x[i], x[i - 1]] = [x[i - 1], x[i]]; up({ options: x }); }} className="p-1 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" disabled={i === opts.length - 1} onClick={() => { const x = [...opts]; [x[i], x[i + 1]] = [x[i + 1], x[i]]; up({ options: x }); }} className="p-1 disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button type="button" disabled={opts.length <= 2} onClick={() => up({ options: opts.filter((_, k) => k !== i) })} className="p-1 text-slate-400 disabled:opacity-30"><Trash2 size={15} /></button></div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => up({ options: [...opts, { id: rid(), text: '' }] })}>إضافة خطوة</Button>
            </div>
          )}
          {f.qtype === 'match' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">كل عنصر يقابله تعريفه في السطر نفسه؛ ستُخلط التعريفات للطالبة.</p>
              {f.options.left.map((l: any, i: number) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Input value={l.text} placeholder="العنصر" onChange={(e) => up({ options: { ...f.options, left: f.options.left.map((x: any, k: number) => (k === i ? { ...x, text: e.target.value } : x)) } })} />
                  <span className="text-slate-400">↔</span>
                  <Input value={f.options.right[i]?.text ?? ''} placeholder="ما يطابقه" onChange={(e) => up({ options: { ...f.options, right: f.options.right.map((x: any, k: number) => (k === i ? { ...x, text: e.target.value } : x)) } })} />
                  <button type="button" disabled={f.options.left.length <= 2} onClick={() => up({ options: { left: f.options.left.filter((_: any, k: number) => k !== i), right: f.options.right.filter((_: any, k: number) => k !== i) } })} className="p-1 text-slate-400 disabled:opacity-30"><Trash2 size={15} /></button>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => up({ options: { left: [...f.options.left, { id: rid(), text: '' }], right: [...f.options.right, { id: rid(), text: '' }] } })}>إضافة زوج</Button>
            </div>
          )}
          {f.qtype === 'short' && <Field label="إجابات مقبولة للتصحيح التلقائي (اختياري)" hint="إجابة في كل سطر. الإجابات غير المطابقة تذهب للتصحيح اليدوي."><Textarea rows={3} value={(f.answer.accepted ?? []).join('\n')} onChange={(e) => up({ answer: { accepted: e.target.value.split('\n').filter((x: string) => x.trim()) } })} /></Field>}
        </div>
        <Field label="تفسير الإجابة" className="sm:col-span-2"><Textarea rows={2} value={f.explanation} onChange={(e) => up({ explanation: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Tests({ course, courses }: { course: string; courses: any[] }) {
  const { data, loading, reload } = useLoad(() => api.get(`/teacher/assessments${qs({ course_id: course })}`), [course]);
  const [edit, setEdit] = useState<any>(null);
  const toast = useToast();
  async function open(a: any) { setEdit(await api.get(`/teacher/assessments/item/${a.id}`)); }
  async function del(a: any) { if (!confirm('حذف الاختبار؟')) return; try { await api.del(`/teacher/assessments/item/${a.id}`); reload(); } catch (e: any) { toast('err', e.message); } }
  return (
    <Card>
      <div className="flex justify-end p-4"><Button icon={<Plus size={16} />} disabled={!courses.length} onClick={() => setEdit({ course_id: course || courses[0]?.id })}>إنشاء اختبار</Button></div>
      {loading ? <Spinner /> : !data?.length ? <Empty title="لا توجد اختبارات" /> : (
        <Table><thead><tr><th>الاختبار</th><th>الدورة</th><th>النوع</th><th>الأسئلة</th><th>النجاح</th><th>المحاولات</th><th>المدة</th><th>التقديمات</th><th></th></tr></thead>
          <tbody>{data.map((a: any) => <tr key={a.id}><td className="font-medium">{a.title}{!a.is_published && <Badge className="ms-2">غير منشور</Badge>}</td><td className="text-xs">{a.course_title}</td><td>{a.is_final ? <Badge color="violet">نهائي</Badge> : <span className="text-xs">{a.module_title ?? 'وحدة'}</span>}</td><td>{a.question_count}</td><td>{a.pass_score}%</td><td>{a.max_attempts}</td><td className="text-xs">{a.time_limit_min ? `${a.time_limit_min} د` : 'مفتوح'}</td><td>{a.submissions}{a.pending > 0 && <Badge color="violet" className="ms-1">{a.pending} للتصحيح</Badge>}</td>
            <td className="whitespace-nowrap"><button onClick={() => open(a)} className="p-1.5 text-slate-400 hover:text-nova-600"><Pencil size={15} /></button><button onClick={() => del(a)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button></td></tr>)}</tbody></Table>
      )}
      {edit && <TestForm a={edit} courses={courses} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </Card>
  );
}

function TestForm({ a, courses, onClose, onSaved }: { a: any; courses: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ course_id: a.course_id, module_id: a.module_id ?? null, is_final: a.is_final ?? false, title: a.title ?? '', description: a.description ?? '', pass_score: a.pass_score ?? 70, max_attempts: a.max_attempts ?? 3,
    time_limit_min: a.time_limit_min ?? null, shuffle: a.shuffle ?? false, show_result: a.show_result ?? true, show_answers: a.show_answers ?? 'after_submit', open_at: a.open_at ?? null, close_at: a.close_at ?? null, is_published: a.is_published ?? true, question_ids: a.question_ids ?? [] });
  const { data: qsList } = useLoad(() => api.get(`/teacher/assessments/questions?course_id=${f.course_id}`), [f.course_id]);
  const { data: course } = useLoad(() => api.get(`/teacher/courses/${f.course_id}`), [f.course_id]);
  useEffect(() => { if (course && !a.id) setF((x: any) => ({ ...x, pass_score: course.course.pass_score, max_attempts: course.course.max_attempts })); }, [course]); // eslint-disable-line
  const [busy, setBusy] = useState(false);
  const up = (p: any) => setF({ ...f, ...p });
  const total = (qsList ?? []).filter((q: any) => f.question_ids.includes(q.id)).reduce((s: number, q: any) => s + Number(q.points), 0);
  async function save() {
    setBusy(true);
    try { const body = { ...f, pass_score: Number(f.pass_score), max_attempts: Number(f.max_attempts), time_limit_min: f.time_limit_min ? Number(f.time_limit_min) : null };
      if (a.id) await api.put(`/teacher/assessments/item/${a.id}`, body); else await api.post('/teacher/assessments', body); toast('ok', 'تم حفظ الاختبار'); onSaved(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} wide title={a.id ? 'تعديل الاختبار' : 'إنشاء اختبار'} footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ الاختبار</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الدورة"><Select value={f.course_id} disabled={!!a.id} onChange={(e) => up({ course_id: e.target.value, question_ids: [], module_id: null })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
        <Field label="موقع الاختبار"><Select value={f.is_final ? 'final' : f.module_id ?? ''} onChange={(e) => e.target.value === 'final' ? up({ is_final: true, module_id: null }) : up({ is_final: false, module_id: e.target.value || null })}>
          <option value="">اختبار عام</option>{(course?.modules ?? []).map((m: any) => <option key={m.id} value={m.id}>بعد {m.title}</option>)}<option value="final">الاختبار النهائي للدورة</option></Select></Field>
        <Field label="عنوان الاختبار" className="sm:col-span-2"><Input value={f.title} onChange={(e) => up({ title: e.target.value })} /></Field>
        <Field label="وصف الاختبار" className="sm:col-span-2"><Input value={f.description} onChange={(e) => up({ description: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label="درجة النجاح %"><Input type="number" value={f.pass_score} onChange={(e) => up({ pass_score: e.target.value })} /></Field>
          <Field label="عدد المحاولات"><Input type="number" value={f.max_attempts} onChange={(e) => up({ max_attempts: e.target.value })} /></Field>
          <Field label="المدة (دقائق)" hint="فارغ = بدون وقت"><Input type="number" value={f.time_limit_min ?? ''} onChange={(e) => up({ time_limit_min: e.target.value || null })} /></Field>
        </div>
        <DateTimeField label="موعد فتح الاختبار" value={f.open_at} onChange={(v) => up({ open_at: v })} />
        <DateTimeField label="موعد إغلاق الاختبار" value={f.close_at} onChange={(v) => up({ close_at: v })} />
        <Toggle label="ترتيب عشوائي للأسئلة" checked={f.shuffle} onChange={(v) => up({ shuffle: v })} />
        <Toggle label="إظهار النتيجة للطالبة" checked={f.show_result} onChange={(v) => up({ show_result: v })} />
        <Field label="إظهار الإجابات الصحيحة"><Select value={f.show_answers} onChange={(e) => up({ show_answers: e.target.value })}><option value="after_submit">بعد التسليم</option><option value="after_close">بعد إغلاق الاختبار</option><option value="never">عدم الإظهار</option></Select></Field>
        <Toggle label="منشور للطالبات" checked={f.is_published} onChange={(v) => up({ is_published: v })} />
        <div className="sm:col-span-2">
          <div className="mb-2 flex justify-between text-sm"><b>الأسئلة المختارة ({f.question_ids.length})</b><span className="text-slate-500">الدرجة الكلية: {total}</span></div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {!(qsList ?? []).length && <div className="p-4 text-center text-sm text-slate-400">لا توجد أسئلة لهذه الدورة في البنك بعد</div>}
            {(qsList ?? []).map((q: any) => (
              <label key={q.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-1" checked={f.question_ids.includes(q.id)} onChange={(e) => up({ question_ids: e.target.checked ? [...f.question_ids, q.id] : f.question_ids.filter((x: string) => x !== q.id) })} />
                <span className="flex-1">{q.text}</span><Badge color="violet">{QLABEL[q.qtype]}</Badge><span className="text-xs text-slate-400">{q.points}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Results({ course }: { course: string }) {
  const { data, loading } = useLoad(() => api.get(`/teacher/assessments/results${qs({ course_id: course })}`), [course]);
  return (
    <Card>
      <div className="flex justify-end gap-2 p-4"><Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => download(`/teacher/assessments/results${qs({ course_id: course, format: 'xlsx' })}`)}>Excel</Button><Button size="sm" variant="secondary" onClick={() => download(`/teacher/assessments/results${qs({ course_id: course, format: 'csv' })}`)}>CSV</Button></div>
      {loading ? <Spinner /> : !data?.length ? <Empty title="لا توجد نتائج بعد" /> : (
        <Table><thead><tr><th>الطالبة</th><th>الدورة</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>المحاولة</th><th>تاريخ التقديم</th><th>حالة الاجتياز</th></tr></thead>
          <tbody>{data.map((r: any) => <tr key={r.id}><td className="font-medium">{r.full_name}</td><td className="text-xs">{r.course_title}</td><td className="text-xs">{r.assessment_title}</td><td>{r.score ?? '—'} / {r.max_score}</td><td className="font-semibold">{pct(r.score_pct)}</td><td>{r.attempt_no}</td><td className="text-xs">{fmtDateTime(r.submitted_at)}</td><td><Badge color={r.status === 'pending_review' ? 'violet' : r.passed ? 'green' : 'red'}>{r.statusLabel}</Badge></td></tr>)}</tbody></Table>
      )}
    </Card>
  );
}

function Grading({ items, reload }: { items: any[] | null; reload: () => void }) {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, { points: string; feedback: string }>>({});
  async function grade(it: any) {
    const k = it.attempt_id + it.question_id; const v = vals[k];
    if (!v?.points) return toast('err', 'أدخلي الدرجة');
    try { const r = await api.post(`/teacher/assessments/grading/${it.attempt_id}`, { question_id: it.question_id, points: Number(v.points), feedback: v.feedback ?? '' }); toast('ok', r.finalized ? 'تم التصحيح واعتماد النتيجة' : 'تم حفظ الدرجة'); reload(); }
    catch (e: any) { toast('err', e.message); }
  }
  if (!items) return <Spinner />;
  if (!items.length) return <Card><Empty icon={<CheckCircle2 size={36} />} title="لا توجد إجابات بانتظار التصحيح" /></Card>;
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const k = it.attempt_id + it.question_id;
        return (
          <Card key={k} className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><b className="text-sm text-slate-900">{it.full_name}</b>· {it.course_title} · {it.assessment_title} · {fmtDateTime(it.submitted_at)}</div>
            <div className="mt-2 font-semibold text-slate-800">{it.text}</div>
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">{typeof it.response === 'string' ? it.response : JSON.stringify(it.response)}</div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label={`الدرجة (من ${it.points})`}><Input type="number" min={0} max={it.points} step={0.5} className="w-28" value={vals[k]?.points ?? ''} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], points: e.target.value } })} /></Field>
              <Field label="تغذية راجعة" className="flex-1"><Input value={vals[k]?.feedback ?? ''} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], feedback: e.target.value } })} /></Field>
              <Button onClick={() => grade(it)}>اعتماد</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
