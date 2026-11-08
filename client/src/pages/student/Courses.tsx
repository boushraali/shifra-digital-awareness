import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, User, BookOpen, CheckCircle2, Circle, PlayCircle, FileText, Link2, Image as ImageIcon, Video, ListChecks, ArrowRight, ArrowLeft, Download, Lock, Target, Sparkles, Timer, Award, ExternalLink, GraduationCap } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, cx, useToast } from '../../lib/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { LearningScene } from '../../components/Art';
import { SCard, SBtn, SGhost, SBar, STitle } from './Layout';

const Cover = ({ id, className }: { id?: string | null; className?: string }) =>
  id ? <img src={fileUrl(id)} alt="" className={cx('object-cover', className)} /> : <LearningScene className={className} />;

const STATUS_CHIP: Record<string, string> = {
  published: 'bg-emerald-400/20 text-emerald-200', scheduled: 'bg-sky-400/20 text-sky-200', enroll_closed: 'bg-amber-400/20 text-amber-200', ended: 'bg-white/10 text-violet-100/70',
};

export function Catalog() {
  const { data, loading, error, reload } = useLoad(() => api.get('/learn/courses'));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <STitle title="اكتشفي دوراتك التدريبية" sub="دورات تنشئها معلمتك، مع دروس واختبارات وشهادة عند الإتمام." />
      {!data.length ? <SCard className="py-12 text-center text-violet-100/70">لا توجد دورات متاحة لكِ حاليًا. ستصلك إشعارات عند نشر دورات جديدة.</SCard> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c: any) => (
            <Link key={c.id} to={`/student/courses/${c.id}`} className="glass group flex flex-col overflow-hidden transition hover:-translate-y-1 hover:bg-white/10">
              <Cover id={c.cover_file_id} className="aspect-video w-full" />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2">
                  <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', c.enrolled ? 'bg-cyan-400/20 text-cyan-200' : STATUS_CHIP[c.status])}>{c.enrolled ? 'مسجلة' : c.status === 'published' ? 'التسجيل متاح' : c.statusLabel}</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{c.level_label}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold">{c.title}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-violet-100/70">{c.short_desc}</p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-violet-100/70">
                  <span className="flex items-center gap-1"><User size={13} />{c.instructor_name}</span>
                  <span className="flex items-center gap-1"><Clock size={13} />{c.duration_hours} ساعات</span>
                  <span className="flex items-center gap-1"><BookOpen size={13} />{c.lesson_count} دروس</span>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan-300">عرض التفاصيل <ArrowLeft size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CourseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/learn/courses/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const c = data.course;
  async function enroll() {
    setBusy(true);
    try { const r = await api.post(`/learn/courses/${id}/enroll`); toast('ok', r.message); await reload(); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  const final = data.tests.find((t: any) => t.is_final);
  return (
    <div className="space-y-5">
      <Link to="/student/courses" className="inline-flex items-center gap-1 text-sm text-violet-100/70 hover:text-white"><ArrowRight size={16} />كل الدورات</Link>
      <div className="glass overflow-hidden md:grid md:grid-cols-5">
        <Cover id={c.cover_file_id} className="aspect-video w-full md:col-span-2 md:aspect-auto md:h-full" />
        <div className="p-6 md:col-span-3">
          <h1 className="text-2xl font-bold md:text-3xl">{c.title}</h1>
          <p className="mt-2 text-violet-100/80">{c.short_desc}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[[User, 'المدربة', c.instructor_name], [Clock, 'المدة', `${c.duration_hours} ساعات`], [GraduationCap, 'المستوى', c.level_label], [Target, 'الاجتياز', `${final?.pass_score ?? c.pass_score}%`]].map(([I, l, v]: any) => (
              <div key={l} className="rounded-xl bg-white/5 p-3"><I size={16} className="text-cyan-300" /><div className="mt-1 text-xs text-violet-100/60">{l}</div><div className="font-semibold">{v}</div></div>
            ))}
          </div>
          <div className="mt-4 text-xs text-violet-100/70">
            {c.content_start && <>بداية الدورة: <b>{fmtDate(c.content_start)}</b> · </>}{c.course_end && <>نهاية الدورة: <b>{fmtDate(c.course_end)}</b></>}
            {c.enroll_end && <> · آخر موعد للتسجيل: <b>{fmtDateTime(c.enroll_end)}</b></>}
          </div>
          <div className="mt-5">
            {data.enrolled ? <SBtn onClick={() => nav(`/student/courses/${id}/learn`)}><PlayCircle size={18} />{data.contentAvailable ? 'متابعة التعلم' : 'المحتوى يُتاح قريبًا'}</SBtn>
              : data.canEnroll ? <SBtn onClick={enroll} disabled={busy}><Sparkles size={18} />سجلي الآن</SBtn>
              : <span className="rounded-xl bg-white/10 px-4 py-2.5 text-sm">{c.statusLabel === 'مجدولة' ? `يبدأ التسجيل ${fmtDateTime(c.enroll_start)}` : c.statusLabel}</span>}
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {c.long_desc && <SCard><h2 className="mb-2 font-bold">عن الدورة</h2><p className="whitespace-pre-line leading-8 text-violet-100/85">{c.long_desc}</p></SCard>}
          <SCard>
            <h2 className="mb-3 font-bold">الوحدات والدروس</h2>
            <div className="space-y-3">
              {data.modules.map((m: any, i: number) => (
                <div key={m.id} className="rounded-xl bg-white/5 p-4">
                  <div className="font-semibold">{i + 1}. {m.title}</div>
                  <ul className="mt-2 space-y-1.5 text-sm text-violet-100/80">
                    {m.lessons.map((l: any) => <li key={l.id} className="flex items-center gap-2">{data.enrolled ? <KindIcon k={l.kind} /> : <Lock size={14} className="opacity-60" />}{l.title}<span className="ms-auto text-xs opacity-60">{l.duration_min} د</span></li>)}
                    {data.tests.filter((t: any) => t.module_id === m.id).map((t: any) => <li key={t.id} className="flex items-center gap-2 text-fuchsia-200"><ListChecks size={14} />{t.title}</li>)}
                  </ul>
                </div>
              ))}
              {final && <div className="flex items-center gap-2 rounded-xl bg-fuchsia-500/10 p-4 font-semibold text-fuchsia-200"><ListChecks size={16} />{final.title}</div>}
            </div>
          </SCard>
        </div>
        <div className="space-y-5">
          {!!c.objectives?.length && <SCard><h2 className="mb-2 font-bold">أهداف الدورة</h2><ul className="space-y-2 text-sm">{c.objectives.map((o: string) => <li key={o} className="flex gap-2"><Target size={16} className="mt-0.5 shrink-0 text-cyan-300" />{o}</li>)}</ul></SCard>}
          {!!c.skills?.length && <SCard><h2 className="mb-2 font-bold">المهارات المكتسبة</h2><div className="flex flex-wrap gap-2">{c.skills.map((s: string) => <span key={s} className="rounded-full bg-white/10 px-3 py-1 text-xs">{s}</span>)}</div></SCard>}
          <SCard><h2 className="mb-2 font-bold">متطلبات الاجتياز</h2><ul className="space-y-1.5 text-sm text-violet-100/80">
            {c.require_all_lessons && <li>• إكمال جميع الدروس الإلزامية</li>}
            {c.require_unit_tests && <li>• اجتياز اختبارات الوحدات</li>}
            {c.require_final_pass && final && <li>• اجتياز الاختبار النهائي بدرجة {final.pass_score}% على الأقل</li>}
            <li>• تصدر الشهادة تلقائيًا عند استيفاء الشروط</li>
          </ul></SCard>
        </div>
      </div>
    </div>
  );
}

export function KindIcon({ k, size = 14 }: { k: string; size?: number }) {
  const I = { video: Video, file: FileText, link: Link2, image: ImageIcon, activity: Sparkles, text: BookOpen }[k] ?? BookOpen;
  return <I size={size} className="shrink-0 opacity-80" />;
}

export function MyCourses() {
  const { data, loading, error, reload } = useLoad(() => api.get('/learn/my-courses'));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <STitle title="دوراتي" sub="تابعي تقدمك وأكملي من حيث توقفتِ." />
      {!data.length ? <SCard className="py-12 text-center"><p className="text-violet-100/70">لم تسجلي في أي دورة بعد.</p><Link to="/student/courses" className="mt-3 inline-block font-semibold text-cyan-300">استعرضي الدورات</Link></SCard> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c: any) => (
            <SCard key={c.id} className="flex gap-4">
              <Cover id={c.cover_file_id} className="hidden h-28 w-28 shrink-0 rounded-xl sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{c.title}</h3><span className="whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{c.statusLabel}</span></div>
                <div className="mt-3 flex items-center gap-2"><SBar value={c.progress} className="flex-1" /><span className="text-xs font-semibold">{c.progress}%</span></div>
                <div className="mt-2 text-xs text-violet-100/70">{c.lessonsDone} من {c.lessonsTotal} دروس مكتملة{c.lastTest && <> · آخر اختبار: <b>{Math.round(c.lastTest.score_pct)}%</b></>}</div>
                <Link to={`/student/courses/${c.id}/learn`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-300">{c.status === 'completed' ? 'مراجعة الدورة' : 'متابعة التعلم'}<ArrowLeft size={16} /></Link>
              </div>
            </SCard>
          ))}
        </div>
      )}
    </div>
  );
}

export function CoursePlayer() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => api.get(`/learn/courses/${id}/learn`), [id]);
  const lessons = useMemo(() => (data?.modules ?? []).flatMap((m: any) => m.lessons), [data]);
  const lessonId = sp.get('lesson') ?? data?.lastLessonId ?? lessons.find((l: any) => !l.done)?.id ?? lessons[0]?.id;
  const [lesson, setLesson] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!lessonId || !data?.contentAvailable) return;
    setLesson(null);
    api.get(`/learn/lessons/${lessonId}`).then(setLesson).catch((e) => toast('err', e.message));
  }, [lessonId, data?.contentAvailable]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const ev = data.evaluation;
  const idx = lessons.findIndex((l: any) => l.id === lessonId);
  async function complete() {
    setBusy(true);
    try {
      const r = await api.post(`/learn/lessons/${lessonId}/complete`);
      await reload();
      if (r.certificateId) { toast('ok', 'مبروك! أكملتِ الدورة وأصبحت شهادتك متاحة 🎓'); nav(`/student/certificates/${r.certificateId}`); return; }
      toast('ok', 'تم تسجيل إكمال الدرس');
      if (idx < lessons.length - 1) setSp({ lesson: lessons[idx + 1].id });
    } catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <Link to="/student/my-courses" className="mb-3 inline-flex items-center gap-1 text-sm text-violet-100/70 hover:text-white"><ArrowRight size={16} />دوراتي</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{data.course.title}</h1>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{ev.statusLabel}</span>
        <div className="ms-auto flex w-full items-center gap-2 sm:w-64"><SBar value={ev.progress} className="flex-1" /><b className="text-sm">{ev.progress}%</b></div>
      </div>
      {ev.status === 'completed' && <div className="mb-5 flex items-center gap-3 rounded-2xl bg-emerald-500/15 p-4"><Award className="text-emerald-300" />أكملتِ هذه الدورة بنجاح! <Link to="/student/certificates" className="font-semibold text-emerald-200 underline">عرض الشهادة</Link></div>}
      {!data.contentAvailable ? <SCard className="py-12 text-center">المحتوى غير متاح حاليًا. {data.course.content_start && <>يُتاح في {fmtDateTime(data.course.content_start)}.</>}</SCard> : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <aside className="glass h-fit p-3 lg:sticky lg:top-20">
            {data.modules.map((m: any) => (
              <div key={m.id} className="mb-3">
                <div className="px-2 py-1.5 text-xs font-semibold text-violet-100/60">{m.title}</div>
                {m.lessons.map((l: any) => (
                  <button key={l.id} onClick={() => setSp({ lesson: l.id })} className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm', l.id === lessonId ? 'bg-white/15' : 'hover:bg-white/5')}>
                    {l.done ? <CheckCircle2 size={16} className="shrink-0 text-emerald-300" /> : <Circle size={16} className="shrink-0 opacity-40" />}
                    <span className="flex-1">{l.title}</span>{!l.is_mandatory && <span className="text-[10px] opacity-60">اختياري</span>}
                  </button>
                ))}
                {data.tests.filter((t: any) => t.module_id === m.id).map((t: any) => <TestLink key={t.id} t={t} />)}
              </div>
            ))}
            {data.tests.filter((t: any) => t.is_final).map((t: any) => <TestLink key={t.id} t={t} />)}
          </aside>
          <section className="glass min-h-[24rem] p-5 md:p-7">
            {!lesson ? <Spinner /> : <LessonView l={lesson} />}
            {lesson && (
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
                <SGhost disabled={idx <= 0} onClick={() => setSp({ lesson: lessons[idx - 1].id })}><ArrowRight size={16} />السابق</SGhost>
                {lesson.done ? <span className="flex items-center gap-1 text-sm text-emerald-300"><CheckCircle2 size={16} />درس مكتمل</span>
                  : <SBtn onClick={complete} disabled={busy}><CheckCircle2 size={16} />أكملتُ الدرس</SBtn>}
                <SGhost className="ms-auto" disabled={idx >= lessons.length - 1} onClick={() => setSp({ lesson: lessons[idx + 1].id })}>التالي<ArrowLeft size={16} /></SGhost>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function TestLink({ t }: { t: any }) {
  const state = t.passed ? 'ناجحة ✓' : t.pending ? 'بانتظار التصحيح' : t.open_attempt ? 'محاولة جارية' : t.used ? `${Math.round(t.best ?? 0)}% · ${t.used}/${t.max_attempts}` : `${t.question_count} أسئلة`;
  return (
    <Link to={`/student/assessments/${t.id}`} className={cx('mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm', t.is_final ? 'bg-fuchsia-500/15 font-semibold' : 'hover:bg-white/5')}>
      <ListChecks size={16} className={t.passed ? 'text-emerald-300' : 'text-fuchsia-300'} /><span className="flex-1">{t.title}</span><span className="text-[11px] opacity-70">{state}</span>
    </Link>
  );
}

function embed(url: string) {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export function LessonView({ l }: { l: any }) {
  const f = l.file;
  return (
    <article>
      <div className="flex items-center gap-2 text-xs text-violet-100/60"><KindIcon k={l.kind} />{l.duration_min} دقيقة{l.is_mandatory ? ' · إلزامي' : ' · اختياري'}</div>
      <h2 className="mt-1 text-2xl font-bold">{l.title}</h2>
      <div className="mt-5 space-y-5">
        {l.kind === 'video' && f && <video src={fileUrl(f.id)} controls className="aspect-video w-full rounded-xl bg-black" controlsList={l.downloadable ? undefined : 'nodownload'} />}
        {l.kind === 'video' && !f && l.url && (embed(l.url) ? <iframe src={embed(l.url)!} className="aspect-video w-full rounded-xl" allowFullScreen title={l.title} /> : <a href={l.url} target="_blank" rel="noreferrer" className="text-cyan-300 underline">مشاهدة الفيديو</a>)}
        {l.kind === 'image' && f && <img src={fileUrl(f.id)} alt={l.title} className="max-h-[70vh] w-full rounded-xl object-contain" />}
        {l.kind === 'file' && f && (
          <>
            {f.mime === 'application/pdf' && <iframe src={fileUrl(f.id)} title={f.original_name} className="h-[70vh] w-full rounded-xl bg-white" />}
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4">
              <FileText className="text-cyan-300" /><div className="flex-1"><div className="font-semibold">{f.original_name}</div><div className="text-xs opacity-60">{(f.size_bytes / 1024 / 1024).toFixed(2)} ميغابايت</div></div>
              {l.downloadable ? <a href={fileUrl(f.id, true)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><Download size={16} />تحميل</a> : <span className="text-xs opacity-60">التحميل غير متاح</span>}
            </div>
          </>
        )}
        {l.kind === 'link' && l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-white/5 p-4 hover:bg-white/10"><ExternalLink className="text-cyan-300" /><span className="flex-1 break-all" dir="ltr">{l.url}</span></a>}
        {l.body && <div className={cx('prose-lesson whitespace-pre-line text-[17px] leading-9 text-violet-50/90', l.kind === 'activity' && 'rounded-xl border border-amber-300/30 bg-amber-400/10 p-5')}>{l.kind === 'activity' && <div className="mb-2 font-bold text-amber-200">✏️ نشاط تطبيقي</div>}{l.body}</div>}
      </div>
    </article>
  );
}

// ----------------------------------------------------------- assessments
export function AssessmentTake() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [st, setSt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [started, setStarted] = useState(false);
  const { data: history } = useLoad(() => api.get(`/learn/assessments/${id}/attempts`), [id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  async function begin() {
    setBusy(true);
    try { const r = await api.post(`/learn/assessments/${id}/start`); setSt(r); setAnswers(r.saved ?? {}); setStarted(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const save = (qid: string, v: any) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    api.put(`/learn/attempts/${st.attemptId}/answer`, { questionId: qid, response: v }).catch((e) => toast('err', e.message));
  };
  async function submit(auto = false) {
    if (!auto && !confirm('هل تريدين تسليم الاختبار؟ لن تتمكني من تعديل الإجابات بعد التسليم.')) return;
    setBusy(true);
    try { await api.post(`/learn/attempts/${st.attemptId}/submit`); nav(`/student/attempts/${st.attemptId}`, { replace: true }); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  const left = st?.deadline ? Math.max(0, Math.floor((new Date(st.deadline).getTime() - now) / 1000)) : null;
  useEffect(() => { if (left === 0 && started && !busy) submit(true); }, [left]); // eslint-disable-line
  if (!started) return (
    <div className="mx-auto max-w-xl">
      <SCard className="text-center">
        <ListChecks size={40} className="mx-auto text-fuchsia-300" />
        <h1 className="mt-3 text-2xl font-bold">الاختبار</h1>
        <p className="mt-2 text-violet-100/70">تُحفظ إجاباتك تلقائيًا أثناء الحل. إذا كان الاختبار محددًا بوقت فسيُسلَّم تلقائيًا عند انتهائه.</p>
        {err && <div className="mt-4 rounded-xl bg-rose-500/20 p-3 text-sm">{err}</div>}
        <div className="mt-6 flex justify-center gap-3"><SGhost onClick={() => nav(-1)}>رجوع</SGhost><SBtn onClick={begin} disabled={busy}>ابدئي / تابعي الاختبار</SBtn></div>
        {!!history?.length && (
          <div className="mt-6 text-start text-sm">
            <div className="mb-2 font-semibold">محاولاتك السابقة</div>
            {history.map((h: any) => <Link key={h.id} to={`/student/attempts/${h.id}`} className="flex justify-between rounded-lg px-3 py-2 hover:bg-white/5"><span>المحاولة {h.attempt_no}</span><span>{h.status === 'pending_review' ? 'بانتظار التصحيح' : h.status === 'in_progress' ? 'جارية' : `${Math.round(h.score_pct ?? 0)}% ${h.passed ? '✓' : ''}`}</span></Link>)}
          </div>
        )}
      </SCard>
    </div>
  );
  const answeredN = st.questions.filter((q: any) => answers[q.id] !== undefined && answers[q.id] !== '' && answers[q.id] !== null).length;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-16 z-20 mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/90 p-3 backdrop-blur">
        <b className="flex-1 truncate">{st.title}</b>
        <span className="text-sm">{answeredN}/{st.questions.length}</span>
        {left !== null && <span className={cx('flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-sm', left < 60 ? 'bg-rose-500/30' : 'bg-white/10')}><Timer size={15} />{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
      </div>
      <div className="space-y-4">
        {st.questions.map((q: any, i: number) => <QuestionInput key={q.id} q={q} i={i} value={answers[q.id]} onChange={(v) => save(q.id, v)} />)}
      </div>
      <div className="mt-6 flex justify-end"><SBtn onClick={() => submit()} disabled={busy}>تسليم الاختبار</SBtn></div>
    </div>
  );
}

const QTYPE: Record<string, string> = { mcq: 'اختيار من متعدد', tf: 'صح أو خطأ', multi: 'اختيار أكثر من إجابة', match: 'مطابقة', order: 'ترتيب', short: 'إجابة قصيرة' };

function QuestionInput({ q, i, value, onChange }: { q: any; i: number; value: any; onChange: (v: any) => void }) {
  const opt = 'flex items-center gap-3 rounded-xl border p-3 text-start text-sm transition';
  const [order, setOrder] = useState<any[]>(() => (q.qtype === 'order' ? (Array.isArray(value) ? value.map((id: string) => q.options.find((o: any) => o.id === id)).filter(Boolean) : q.options) : []));
  const mv = (k: number, d: number) => { const x = [...order]; [x[k], x[k + d]] = [x[k + d], x[k]]; setOrder(x); onChange(x.map((o) => o.id)); };
  return (
    <SCard>
      <div className="flex justify-between text-xs text-violet-100/60"><span>سؤال {i + 1} · {QTYPE[q.qtype]}</span><span>{q.points} درجة</span></div>
      <div className="mt-2 font-semibold leading-8">{q.text}</div>
      <div className="mt-3 grid gap-2">
        {(q.qtype === 'mcq' || q.qtype === 'tf') && q.options.map((o: any) => {
          const v = q.qtype === 'tf' ? o.id === 'true' : o.id;
          return <button key={o.id} onClick={() => onChange(v)} className={cx(opt, value === v ? 'border-cyan-300 bg-cyan-400/15' : 'border-white/15 hover:bg-white/5')}><span className={cx('h-4 w-4 rounded-full border-2', value === v ? 'border-cyan-300 bg-cyan-300' : 'border-white/40')} />{o.text}</button>;
        })}
        {q.qtype === 'multi' && q.options.map((o: any) => {
          const arr: string[] = Array.isArray(value) ? value : []; const on = arr.includes(o.id);
          return <button key={o.id} onClick={() => onChange(on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} className={cx(opt, on ? 'border-cyan-300 bg-cyan-400/15' : 'border-white/15 hover:bg-white/5')}><span className={cx('grid h-4 w-4 place-items-center rounded border-2 text-[10px]', on ? 'border-cyan-300 bg-cyan-300 text-ink-900' : 'border-white/40')}>{on && '✓'}</span>{o.text}</button>;
        })}
        {q.qtype === 'match' && q.options.left.map((l: any) => (
          <div key={l.id} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm font-medium">{l.text}</span>
            <select value={value?.[l.id] ?? ''} onChange={(e) => onChange({ ...(value ?? {}), [l.id]: e.target.value })} className="rounded-lg border border-white/20 bg-ink-800 px-3 py-2 text-sm sm:w-64">
              <option value="">— اختاري —</option>
              {q.options.right.map((r: any) => <option key={r.id} value={r.id}>{r.text}</option>)}
            </select>
          </div>
        ))}
        {q.qtype === 'order' && order.map((o, k) => (
          <div key={o.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-sm">
            <b className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">{k + 1}</b><span className="flex-1">{o.text}</span>
            <button disabled={k === 0} onClick={() => mv(k, -1)} className="px-2 disabled:opacity-30" aria-label="أعلى">▲</button>
            <button disabled={k === order.length - 1} onClick={() => mv(k, 1)} className="px-2 disabled:opacity-30" aria-label="أسفل">▼</button>
          </div>
        ))}
        {q.qtype === 'short' && <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-xl border border-white/20 bg-white/5 p-3 text-sm" placeholder="اكتبي إجابتك…" />}
      </div>
    </SCard>
  );
}

export function AttemptResult() {
  const { id } = useParams();
  const { data, loading, error } = useLoad(() => api.get(`/learn/attempts/${id}/result`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const show = (q: any) => {
    if (q.qtype === 'mcq') return q.options.find((o: any) => o.id === q.response)?.text;
    if (q.qtype === 'tf') return q.response === true ? 'صح' : q.response === false ? 'خطأ' : null;
    if (q.qtype === 'multi') return (q.response ?? []).map((id: string) => q.options.find((o: any) => o.id === id)?.text).join('، ');
    if (q.qtype === 'match') return q.options.left.map((l: any) => `${l.text} ← ${q.options.right.find((r: any) => r.id === q.response?.[l.id])?.text ?? '—'}`).join(' | ');
    if (q.qtype === 'order') return (q.response ?? []).map((id: string) => q.options.find((o: any) => o.id === id)?.text).join(' ← ');
    return q.response;
  };
  const correct = (q: any) => {
    const a = q.answer; if (!a) return null;
    if (q.qtype === 'mcq') return q.options.find((o: any) => o.id === a.correct)?.text;
    if (q.qtype === 'tf') return a.correct ? 'صح' : 'خطأ';
    if (q.qtype === 'multi') return a.correct.map((id: string) => q.options.find((o: any) => o.id === id)?.text).join('، ');
    if (q.qtype === 'match') return q.options.left.map((l: any) => `${l.text} ← ${q.options.right.find((r: any) => r.id === a.pairs[l.id])?.text}`).join(' | ');
    if (q.qtype === 'order') return a.order.map((id: string) => q.options.find((o: any) => o.id === id)?.text).join(' ← ');
    return a.accepted?.join(' / ') || null;
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SCard className="text-center">
        <div className="text-sm text-violet-100/70">{data.title}</div>
        {data.status === 'pending_review' ? <><h1 className="mt-2 text-2xl font-bold">تم التسليم — بانتظار التصحيح</h1><p className="mt-2 text-violet-100/70">بعض الإجابات تحتاج إلى تصحيح المعلمة، وسيصلك إشعار عند ظهور النتيجة.</p></>
          : data.showResult ? <><div className="mt-3 text-6xl font-black">{Math.round(data.scorePct)}%</div><div className={cx('mt-2 text-lg font-bold', data.passed ? 'text-emerald-300' : 'text-amber-200')}>{data.passed ? 'ناجحة 🎉' : `لم تصلي لدرجة الاجتياز (${data.passScore}%)`}</div></>
          : <h1 className="mt-2 text-2xl font-bold">تم تسليم الاختبار</h1>}
      </SCard>
      {data.items.map((q: any, i: number) => (
        <SCard key={q.id}>
          <div className="flex justify-between text-xs text-violet-100/60"><span>سؤال {i + 1}</span>{q.earned !== null && q.earned !== undefined && <span>{q.earned}/{q.points}</span>}{q.needsReview && <span className="text-fuchsia-300">بانتظار التصحيح</span>}</div>
          <div className="mt-1 font-semibold">{q.text}</div>
          <div className="mt-2 text-sm text-violet-100/80">إجابتك: {show(q) || '—'}</div>
          {data.revealAnswers && correct(q) && <div className="mt-1 text-sm text-emerald-300">الإجابة الصحيحة: {correct(q)}</div>}
          {q.explanation && <div className="mt-1 text-sm text-cyan-100/80">💡 {q.explanation}</div>}
          {q.feedback && <div className="mt-2 rounded-lg bg-white/5 p-2 text-sm">ملاحظة المعلمة: {q.feedback}</div>}
        </SCard>
      ))}
      <div className="flex justify-center"><SGhost onClick={() => history.back()}>العودة</SGhost></div>
    </div>
  );
}
