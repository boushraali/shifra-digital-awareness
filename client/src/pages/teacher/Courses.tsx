import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Upload, Eye, Users, BookOpen, FolderOpen, ListChecks, Download, FileText, ArrowRight, Image as ImageIcon, Save } from 'lucide-react';
import { api, download, fileUrl, uploadFile as uploadToStorage } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, Card, Button, Badge, Modal, Field, Input, Select, Textarea, PageHeader, Table, Empty, useToast, Toggle, DateTimeField, STATUS_COLOR, Tabs, Progress, cx } from '../../lib/ui';
import { fmtDate, gradeLabel } from '../../lib/format';
import { LessonView, KindIcon } from '../student/Courses';
import { LearningScene } from '../../components/Art';

// =============================================================== list
export function CoursesList({ contentMode = false }: { contentMode?: boolean }) {
  const { data, loading, error, reload } = useLoad(() => api.get('/teacher/courses'));
  const [form, setForm] = useState<any>(null);
  const nav = useNavigate();
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  return (
    <div>
      <PageHeader title={contentMode ? 'إدارة المحتوى العلمي' : 'إدارة الدورات التدريبية'}
        subtitle={contentMode ? 'اختاري دورة لرفع المواد وتنظيم الوحدات والدروس — دون أي تعديل في الكود.' : 'أنشئي الدورات وانشريها للطالبات وتابعي التسجيل والإنجاز.'}
        actions={<Button icon={<Plus size={16} />} onClick={() => setForm({})}>إضافة دورة</Button>} />
      {!data.length ? <Card><Empty icon={<BookOpen size={40} />} title="لا توجد دورات بعد" text="ابدئي بإنشاء أول دورة تدريبية." action={<Button className="mt-2" onClick={() => setForm({})}>إضافة دورة</Button>} /></Card> : (
        <Card>
          <Table>
            <thead><tr><th>الدورة</th><th>الفئة المستهدفة</th><th>المدة</th><th>تاريخ الإنشاء</th><th>الحالة</th><th>المحتوى</th><th>المسجلات</th><th>المجتازات</th><th>الشهادات</th><th></th></tr></thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id}>
                  <td><div className="flex items-center gap-3">
                    {c.cover_file_id ? <img src={fileUrl(c.cover_file_id)} className="h-10 w-16 rounded-lg object-cover" alt="" /> : <LearningScene className="h-10 w-16 rounded-lg" />}
                    <div><Link to={`/teacher/courses/${c.id}`} className="font-semibold text-slate-900 hover:text-nova-600">{c.title}</Link><div className="max-w-xs truncate text-xs text-slate-500">{c.short_desc}</div></div>
                  </div></td>
                  <td className="whitespace-nowrap text-xs">{c.target_level ? (c.target_level === 'intermediate' ? 'المتوسطة' : 'الثانوية') : 'الكل'}{c.target_grades?.length ? ` · ${c.target_grades.map(gradeLabel).join('، ')}` : ''}</td>
                  <td className="whitespace-nowrap">{c.duration_hours} س</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(c.created_at)}</td>
                  <td><Badge color={STATUS_COLOR[c.status]}>{c.statusLabel}</Badge></td>
                  <td className="whitespace-nowrap text-xs">{c.modules} وحدات · {c.lessons} دروس</td>
                  <td>{c.enrolled}</td><td>{c.completed}</td><td>{c.certificates}</td>
                  <td className="whitespace-nowrap">
                    <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => nav(`/teacher/courses/${c.id}`)}>المحتوى</Button>
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setForm(c)}>تعديل</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {form && <CourseForm course={form} onClose={() => setForm(null)} onSaved={(c) => { setForm(null); reload(); if (!form.id) nav(`/teacher/courses/${c.id}`); }} />}
    </div>
  );
}

const STATES = [['draft', 'مسودة'], ['published', 'منشورة'], ['archived', 'مؤرشفة']];

export function CourseForm({ course, onClose, onSaved }: { course: any; onClose: () => void; onSaved: (c: any) => void }) {
  const toast = useToast();
  const [c, setC] = useState<any>({
    title: '', short_desc: '', long_desc: '', objectives: [], skills: [], cover_file_id: null, instructor_name: '', target_level: null, target_grades: [], level_label: 'مبتدئ',
    duration_hours: 2, enroll_start: null, enroll_end: null, content_start: null, course_end: null, pass_score: 70, max_attempts: 3,
    require_all_lessons: true, require_unit_tests: false, require_final_pass: true, publish_state: 'draft', ...course,
  });
  const [busy, setBusy] = useState(false);
  const up = (p: any) => setC({ ...c, ...p });
  async function uploadCover(f?: File) {
    if (!f) return;
    try { const r = await uploadToStorage('cover', f); up({ cover_file_id: r.id }); } catch (e: any) { toast('err', e.message); }
  }
  async function save(state?: string) {
    setBusy(true);
    const body = { ...Object.fromEntries(['title', 'short_desc', 'long_desc', 'objectives', 'skills', 'cover_file_id', 'instructor_name', 'target_level', 'target_grades', 'level_label', 'duration_hours', 'enroll_start', 'enroll_end', 'content_start', 'course_end', 'pass_score', 'max_attempts', 'require_all_lessons', 'require_unit_tests', 'require_final_pass', 'publish_state'].map((k) => [k, c[k]])), ...(state ? { publish_state: state } : {}), duration_hours: Number(c.duration_hours), pass_score: Number(c.pass_score), max_attempts: Number(c.max_attempts) };
    try { const r = course.id ? await api.put(`/teacher/courses/${course.id}`, body) : await api.post('/teacher/courses', body); toast('ok', 'تم حفظ الدورة'); onSaved(r); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('حذف الدورة نهائيًا؟')) return;
    try { await api.del(`/teacher/courses/${course.id}`); toast('ok', 'تم الحذف'); onSaved({}); } catch (e: any) { toast('err', e.message); }
  }
  return (
    <Modal open onClose={onClose} wide title={course.id ? 'تعديل الدورة' : 'إضافة دورة جديدة'} footer={<>
      {course.id && <Button variant="ghost" className="me-auto text-rose-600" onClick={remove} icon={<Trash2 size={16} />}>حذف</Button>}
      <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      <Button variant="secondary" loading={busy} onClick={() => save('draft')} icon={<Save size={16} />}>حفظ كمسودة</Button>
      <Button loading={busy} onClick={() => save()}>حفظ</Button>
    </>}>
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <h3 className="font-bold text-slate-900 sm:col-span-2">المعلومات الأساسية</h3>
          <Field label="عنوان الدورة" className="sm:col-span-2"><Input value={c.title} onChange={(e) => up({ title: e.target.value })} /></Field>
          <Field label="وصف مختصر" className="sm:col-span-2"><Input value={c.short_desc} onChange={(e) => up({ short_desc: e.target.value })} maxLength={400} /></Field>
          <Field label="وصف تفصيلي" className="sm:col-span-2"><Textarea value={c.long_desc} onChange={(e) => up({ long_desc: e.target.value })} /></Field>
          <Field label="أهداف الدورة" hint="هدف في كل سطر"><Textarea rows={3} value={c.objectives.join('\n')} onChange={(e) => up({ objectives: e.target.value.split('\n').filter((x: string) => x.trim()) })} /></Field>
          <Field label="المهارات المكتسبة" hint="مهارة في كل سطر"><Textarea rows={3} value={c.skills.join('\n')} onChange={(e) => up({ skills: e.target.value.split('\n').filter((x: string) => x.trim()) })} /></Field>
          <Field label="صورة الغلاف" hint="PNG / JPG / WEBP">
            <div className="flex items-center gap-3">
              {c.cover_file_id ? <img src={fileUrl(c.cover_file_id)} alt="" className="h-16 w-28 rounded-lg object-cover" /> : <div className="grid h-16 w-28 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImageIcon /></div>}
              <label className="cursor-pointer text-sm font-semibold text-nova-600"><Upload size={14} className="me-1 inline" />رفع صورة<input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} /></label>
            </div>
          </Field>
          <Field label="اسم المدربة"><Input value={c.instructor_name} onChange={(e) => up({ instructor_name: e.target.value })} /></Field>
          <Field label="المرحلة الدراسية المستهدفة"><Select value={c.target_level ?? ''} onChange={(e) => up({ target_level: e.target.value || null })}><option value="">جميع المراحل</option><option value="intermediate">المتوسطة</option><option value="secondary">الثانوية</option></Select></Field>
          <Field label="الصفوف المستهدفة"><div className="flex gap-2">{[1, 2, 3].map((g) => <button key={g} type="button" onClick={() => up({ target_grades: c.target_grades.includes(g) ? c.target_grades.filter((x: number) => x !== g) : [...c.target_grades, g].sort() })} className={cx('flex-1 rounded-xl border py-2 text-sm', c.target_grades.includes(g) ? 'border-nova-500 bg-nova-50 text-nova-700' : 'border-slate-200')}>{gradeLabel(g)}</button>)}</div><span className="mt-1 block text-xs text-slate-400">بدون اختيار = جميع الصفوف</span></Field>
          <Field label="المدة التقديرية (ساعات تدريبية معتمدة)"><Input type="number" min={0.5} step={0.5} value={c.duration_hours} onChange={(e) => up({ duration_hours: e.target.value })} /></Field>
          <Field label="مستوى الدورة"><Select value={c.level_label} onChange={(e) => up({ level_label: e.target.value })}>{['مبتدئ', 'متوسط', 'متقدم'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <h3 className="font-bold text-slate-900 sm:col-span-2">المواعيد</h3>
          <DateTimeField label="تاريخ بدء التسجيل" value={c.enroll_start} onChange={(v) => up({ enroll_start: v })} />
          <DateTimeField label="تاريخ إغلاق التسجيل" value={c.enroll_end} onChange={(v) => up({ enroll_end: v })} />
          <DateTimeField label="تاريخ إتاحة المحتوى" value={c.content_start} onChange={(v) => up({ content_start: v })} />
          <DateTimeField label="تاريخ انتهاء الدورة" value={c.course_end} onChange={(v) => up({ course_end: v })} />
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <h3 className="font-bold text-slate-900 sm:col-span-2">الاجتياز وشروط الإكمال</h3>
          <Field label="درجة الاجتياز الافتراضية (%)"><Input type="number" min={0} max={100} value={c.pass_score} onChange={(e) => up({ pass_score: e.target.value })} /></Field>
          <Field label="عدد محاولات الاختبار الافتراضي"><Input type="number" min={1} max={20} value={c.max_attempts} onChange={(e) => up({ max_attempts: e.target.value })} /></Field>
          <Toggle label="إكمال جميع الدروس الإلزامية" checked={c.require_all_lessons} onChange={(v) => up({ require_all_lessons: v })} />
          <Toggle label="اجتياز اختبارات الوحدات" checked={c.require_unit_tests} onChange={(v) => up({ require_unit_tests: v })} />
          <Toggle label="اجتياز الاختبار النهائي" checked={c.require_final_pass} onChange={(v) => up({ require_final_pass: v })} />
        </section>
        <Field label="حالة الدورة"><div className="grid grid-cols-3 gap-2">{STATES.map(([v, l]) => <button key={v} type="button" onClick={() => up({ publish_state: v })} className={cx('rounded-xl border py-2 text-sm font-medium', c.publish_state === v ? 'border-nova-500 bg-nova-50 text-nova-700' : 'border-slate-200 text-slate-600')}>{l}</button>)}</div>
          <span className="mt-1 block text-xs text-slate-400">الحالات «مجدولة» و«مغلقة للتسجيل» و«منتهية» تُحسب تلقائيًا من المواعيد.</span></Field>
      </div>
    </Modal>
  );
}

// ============================================================ builder
const KINDS = [['text', 'نص تعليمي'], ['video', 'فيديو'], ['file', 'ملف (PDF / PowerPoint / Word…)'], ['image', 'صورة'], ['link', 'رابط تعليمي'], ['activity', 'نشاط تفاعلي']];

export function CourseBuilder() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/teacher/courses/${id}`), [id]);
  const { data: enr, reload: reloadEnr } = useLoad(() => api.get(`/teacher/courses/${id}/enrollments`), [id]);
  const [tab, setTab] = useState<'content' | 'enrollments'>('content');
  const [lesson, setLesson] = useState<{ moduleId: string; l?: any } | null>(null);
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [newMod, setNewMod] = useState('');
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const c = data.course;
  async function addModule() {
    if (!newMod.trim()) return;
    try { await api.post(`/teacher/courses/${id}/modules`, { title: newMod }); setNewMod(''); reload(); } catch (e: any) { toast('err', e.message); }
  }
  async function moveModule(i: number, d: number) {
    const ids = data!.modules.map((m: any) => m.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await api.post(`/teacher/courses/${id}/modules/reorder`, { ids }); reload();
  }
  async function moveLesson(m: any, i: number, d: number) {
    const ids = m.lessons.map((l: any) => l.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await api.post(`/teacher/courses/modules/${m.id}/lessons/reorder`, { ids }); reload();
  }
  async function renameModule(m: any) {
    const t = prompt('عنوان الوحدة', m.title); if (!t) return;
    await api.patch(`/teacher/courses/modules/${m.id}`, { title: t }); reload();
  }
  async function delModule(m: any) { if (confirm(`حذف «${m.title}» وجميع دروسها؟`)) { await api.del(`/teacher/courses/modules/${m.id}`); reload(); } }
  async function delLesson(l: any) { if (confirm(`حذف الدرس «${l.title}»؟`)) { await api.del(`/teacher/courses/lessons/${l.id}`); reload(); } }
  const final = data.tests.find((t: any) => t.is_final);
  return (
    <div>
      <Link to="/teacher/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowRight size={16} />الدورات</Link>
      <PageHeader title={c.title} subtitle={`${c.instructor_name} · ${c.duration_hours} ساعات`} actions={<>
        <Badge color={STATUS_COLOR[c.status]} className="self-center">{c.statusLabel}</Badge>
        <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEdit(true)}>بيانات الدورة</Button>
        <Button variant="secondary" icon={<Eye size={16} />} onClick={() => setPreview(true)}>معاينة كما تظهر للطالبة</Button>
        <Link to={`/teacher/assessments?course=${id}`}><Button variant="secondary" icon={<ListChecks size={16} />}>الأسئلة والاختبارات</Button></Link>
      </>} />
      {c.require_final_pass && !final && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">شرط «اجتياز الاختبار النهائي» مفعّل، لكن لا يوجد اختبار نهائي بعد. أضيفيه من «بنك الأسئلة والاختبارات».</div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'content', label: 'الوحدات والدروس' }, { id: 'enrollments', label: `المسجلات (${enr?.length ?? 0})` }]} />
      {tab === 'content' ? (
        <div className="space-y-4">
          {data.modules.map((m: any, i: number) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <b className="text-slate-900">{m.title}</b>
                <span className="text-xs text-slate-400">{m.lessons.length} دروس</span>
                <div className="ms-auto flex items-center">
                  <button disabled={i === 0} onClick={() => moveModule(i, -1)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="أعلى"><ArrowUp size={16} /></button>
                  <button disabled={i === data.modules.length - 1} onClick={() => moveModule(i, 1)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="أسفل"><ArrowDown size={16} /></button>
                  <button onClick={() => renameModule(m)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="تعديل"><Pencil size={16} /></button>
                  <button onClick={() => delModule(m)} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="حذف"><Trash2 size={16} /></button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {m.lessons.map((l: any, j: number) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <KindIcon k={l.kind} size={16} />
                    <span className="flex-1">{l.title}{l.file_name && <span className="ms-2 text-xs text-slate-400">({l.file_name})</span>}</span>
                    {l.is_mandatory ? <Badge color="blue">إلزامي</Badge> : <Badge>اختياري</Badge>}
                    <span className="text-xs text-slate-400">{l.duration_min} د</span>
                    <button disabled={j === 0} onClick={() => moveLesson(m, j, -1)} className="p-1 text-slate-400 disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button disabled={j === m.lessons.length - 1} onClick={() => moveLesson(m, j, 1)} className="p-1 text-slate-400 disabled:opacity-30"><ArrowDown size={15} /></button>
                    <button onClick={() => setLesson({ moduleId: m.id, l })} className="p-1 text-slate-400 hover:text-nova-600"><Pencil size={15} /></button>
                    <button onClick={() => delLesson(l)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                  </li>
                ))}
                {data.tests.filter((t: any) => t.module_id === m.id).map((t: any) => <li key={t.id} className="flex items-center gap-3 bg-violet-50/50 px-4 py-2.5 text-sm text-violet-800"><ListChecks size={16} />{t.title}<span className="text-xs">({t.question_count} أسئلة)</span></li>)}
              </ul>
              <div className="px-4 py-3"><Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setLesson({ moduleId: m.id })}>إضافة درس / مادة</Button></div>
            </Card>
          ))}
          {final && <div className="flex items-center gap-2 rounded-2xl bg-violet-50 p-4 text-sm font-semibold text-violet-800"><ListChecks size={18} />{final.title} — {final.question_count} أسئلة</div>}
          <Card className="flex gap-2 p-4"><Input placeholder="عنوان الوحدة الجديدة، مثل: الوحدة الأولى: مقدمة" value={newMod} onChange={(e) => setNewMod(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModule()} /><Button onClick={addModule} icon={<Plus size={16} />}>إضافة وحدة</Button></Card>
        </div>
      ) : (
        <Card>
          <div className="flex justify-end gap-2 p-3"><Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => download(`/teacher/courses/${id}/enrollments?format=xlsx`)}>Excel</Button><Button size="sm" variant="secondary" onClick={() => download(`/teacher/courses/${id}/enrollments?format=csv`)}>CSV</Button><Button size="sm" variant="ghost" onClick={reloadEnr}>تحديث</Button></div>
          {!enr?.length ? <Empty icon={<Users size={36} />} title="لا توجد تسجيلات بعد" /> : (
            <Table><thead><tr><th>الطالبة</th><th>الفصل</th><th>تاريخ التسجيل</th><th>نسبة الإنجاز</th><th>الحالة</th><th>تاريخ الإكمال</th></tr></thead>
              <tbody>{enr.map((e: any) => <tr key={e.id}><td><Link to={`/teacher/students/${e.student_id}`} className="font-medium hover:text-nova-600">{e.full_name}</Link></td><td className="text-xs">{gradeLabel(e.grade)}/{e.section}</td><td className="text-xs">{fmtDate(e.enrolled_at)}</td><td className="w-40"><div className="flex items-center gap-2"><Progress value={e.progress} /><span className="text-xs">{e.progress}%</span></div></td><td><Badge color={STATUS_COLOR[e.status]}>{e.statusLabel}</Badge></td><td className="text-xs">{fmtDate(e.completed_at)}</td></tr>)}</tbody></Table>
          )}
        </Card>
      )}
      {lesson && <LessonForm moduleId={lesson.moduleId} lesson={lesson.l} onClose={() => setLesson(null)} onSaved={() => { setLesson(null); reload(); }} />}
      {edit && <CourseForm course={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      {preview && <Preview data={data} onClose={() => setPreview(false)} />}
    </div>
  );
}

const ACCEPT: Record<string, string> = { file: '.pdf,.pptx,.ppt,.docx,.doc,.xlsx,.zip,.txt', video: '.mp4,.webm', image: '.png,.jpg,.jpeg,.webp,.gif' };

function LessonForm({ moduleId, lesson, onClose, onSaved }: { moduleId: string; lesson?: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [l, setL] = useState<any>({ title: '', kind: 'text', body: '', url: '', file_id: null, file_name: '', downloadable: true, is_mandatory: true, duration_min: 10, ...lesson });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const up = (p: any) => setL({ ...l, ...p });
  async function uploadFile(f?: File) {
    if (!f) return;
    setUploading(true);
    try { const r = await uploadToStorage('lesson', f); up({ file_id: r.id, file_name: r.original_name }); toast('ok', 'تم رفع الملف'); } catch (e: any) { toast('err', e.message); } finally { setUploading(false); }
  }
  async function save() {
    setBusy(true);
    const body = { title: l.title, kind: l.kind, body: l.body ?? '', url: l.url || null, file_id: l.file_id || null, downloadable: l.downloadable, is_mandatory: l.is_mandatory, duration_min: Number(l.duration_min) };
    try { if (lesson?.id) await api.put(`/teacher/courses/lessons/${lesson.id}`, body); else await api.post(`/teacher/courses/modules/${moduleId}/lessons`, body); toast('ok', 'تم حفظ الدرس'); onSaved(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} wide title={lesson?.id ? 'تعديل الدرس' : 'إضافة درس / مادة علمية'} footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عنوان الدرس" className="sm:col-span-2"><Input value={l.title} onChange={(e) => up({ title: e.target.value })} /></Field>
        <Field label="نوع المحتوى"><Select value={l.kind} onChange={(e) => up({ kind: e.target.value })}>{KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
        <Field label="المدة (دقائق)"><Input type="number" min={1} value={l.duration_min} onChange={(e) => up({ duration_min: e.target.value })} /></Field>
        {['file', 'video', 'image'].includes(l.kind) && (
          <Field label={l.kind === 'video' ? 'ملف الفيديو (أو رابط أدناه)' : 'الملف'} className="sm:col-span-2" hint={`الأنواع المسموحة: ${ACCEPT[l.kind]}`}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-nova-400">
              {uploading ? <Spinner label="جارٍ الرفع…" /> : <><Upload className="text-slate-400" /><span className="text-sm">{l.file_name || 'اختاري ملفًا للرفع'}</span>{l.file_id && <FileText className="ms-auto text-emerald-500" />}</>}
              <input type="file" accept={ACCEPT[l.kind]} className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
            </label>
          </Field>
        )}
        {(l.kind === 'link' || l.kind === 'video') && <Field label={l.kind === 'video' ? 'رابط فيديو (YouTube / Vimeo)' : 'الرابط التعليمي الموثوق'} className="sm:col-span-2"><Input dir="ltr" value={l.url ?? ''} onChange={(e) => up({ url: e.target.value })} placeholder="https://" /></Field>}
        <Field label={l.kind === 'activity' ? 'تعليمات النشاط' : l.kind === 'text' ? 'النص التعليمي' : 'شرح مرافق (اختياري)'} className="sm:col-span-2"><Textarea rows={8} value={l.body} onChange={(e) => up({ body: e.target.value })} /></Field>
        <Toggle label="درس إلزامي لإكمال الدورة" checked={l.is_mandatory} onChange={(v) => up({ is_mandatory: v })} />
        {['file', 'video', 'image'].includes(l.kind) && <Toggle label="السماح للطالبة بتحميل الملف" checked={l.downloadable} onChange={(v) => up({ downloadable: v })} />}
      </div>
    </Modal>
  );
}

function Preview({ data, onClose }: { data: any; onClose: () => void }) {
  const lessons = data.modules.flatMap((m: any) => m.lessons);
  const [sel, setSel] = useState<any>(lessons[0]);
  useEffect(() => { setSel(lessons[0]); }, []); // eslint-disable-line
  return (
    <Modal open onClose={onClose} wide title="معاينة الدورة كما تظهر للطالبة">
      <div className="student-bg -m-5 grid gap-4 p-4 text-white md:grid-cols-[14rem_1fr]">
        <aside className="glass h-fit p-2">{data.modules.map((m: any) => (
          <div key={m.id} className="mb-2"><div className="px-2 py-1 text-xs text-violet-100/60">{m.title}</div>
            {m.lessons.map((l: any) => <button key={l.id} onClick={() => setSel(l)} className={cx('block w-full rounded-lg px-2 py-1.5 text-start text-sm', sel?.id === l.id ? 'bg-white/15' : 'hover:bg-white/5')}>{l.title}</button>)}</div>
        ))}</aside>
        <section className="glass min-h-[20rem] p-5">{sel ? <LessonView l={{ ...sel, file: sel.file_id ? { id: sel.file_id, original_name: sel.file_name, mime: sel.file_mime, size_bytes: 0 } : null }} /> : <div className="text-violet-100/60">لا توجد دروس بعد</div>}</section>
      </div>
    </Modal>
  );
}
