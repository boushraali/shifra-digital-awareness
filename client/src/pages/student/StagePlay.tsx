/** The adventure engine UI. All scoring/gating is on the server; this only renders and submits choices. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Mail, MessageCircle, Smartphone, Star, KeyRound, Award, RotateCcw, CheckCircle2, Sparkles, Eye } from 'lucide-react';
import { api } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, cx, useToast } from '../../lib/ui';
import { Noor, WorldIcon } from '../../components/Art';
import { SBtn, SGhost, SBar } from './Layout';

type Step = { id: number; position: number; kind: 'scenario' | 'minigame' | 'quiz'; title: string; content: any; max_points: number; choices: { id: number; label: string }[] };
type Answered = { scenarioId: number; kind: string; outcome?: string; points?: number; followup?: { prompt: string; options: string[] }; followupAnswer?: number | null; followupOutcome?: string; detail?: any };
type Feedback = { tone: 'good' | 'mid' | 'bad'; outcome: string; points?: number; followup?: { prompt: string; options: string[] } | null; detail?: any; followupDone?: { outcome: string; good: boolean } };

const tone = (p: number, max = 10): Feedback['tone'] => (p >= max * 0.9 ? 'good' : p >= max * 0.4 ? 'mid' : 'bad');

export function StagePlay() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/journey/${id}`), [id]);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [introIdx, setIntroIdx] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  // a scenario/minigame answer waits here until the student presses «التالي», so the feedback can be shown
  const [pending, setPending] = useState<Answered | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.attempt) {
      setAttemptId(data.attempt.id);
      setAnswered(data.answered);
      setPhase('play');
      const last: Answered | undefined = data.answered[data.answered.length - 1];
      if (last?.followup && last.followupAnswer == null) setFb({ tone: tone(last.points ?? 0), outcome: last.outcome!, points: last.points, followup: last.followup });
    }
  }, [data]);

  const steps: Step[] = data?.steps ?? [];
  const current = steps[answered.length] as Step | undefined;
  const earned = useMemo(() => answered.reduce((s, a) => s + (a.points ?? 0), 0), [answered]);

  if (loading) return <Spinner />;
  if (error || !data) return <div className="space-y-4"><ErrorBox error={error ?? ''} /><Link className="text-cyan-300 underline" to="/student/journey">العودة للخريطة</Link></div>;
  const { stage, access } = data;

  async function start() {
    setBusy(true);
    try { const r = await api.post(`/journey/${id}/start`); setAttemptId(r.attemptId); if (r.resumed) await reload(); setPhase('play'); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  async function answer(body: any) {
    if (!attemptId || !current) return;
    setBusy(true);
    try {
      const r = await api.post(`/journey/attempts/${attemptId}/answer`, { scenarioId: current.id, ...body });
      if (r.kind === 'quiz') { setAnswered((a) => [...a, { scenarioId: current.id, kind: 'quiz' }]); setFb(null); return; }
      if (r.kind === 'scenario') {
        setFb({ tone: tone(r.points), outcome: r.outcome, points: r.points, followup: r.followup });
        setPending({ scenarioId: current.id, kind: 'scenario', outcome: r.outcome, points: r.points, followup: r.followup ?? undefined, followupAnswer: null });
      } else {
        setFb({ tone: tone(r.points), outcome: r.points >= 9 ? 'أداء رائع في التحدي!' : r.points >= 5 ? 'أحسنتِ! راجعي الملاحظات لتتقني المهارة.' : 'تحدٍّ صعب! انظري إلى الإجابات الصحيحة لتتعلمي منها.', points: r.points, detail: r.detail });
        setPending({ scenarioId: current.id, kind: 'minigame', points: r.points, detail: r.detail });
      }
    } catch (e: any) {
      toast('err', e.message);
      if (e.status === 403) nav('/student/journey');
    } finally { setBusy(false); }
  }
  async function answerFollowup(i: number) {
    if (!attemptId || !fb) return;
    const target = pending?.scenarioId ?? answered[answered.length - 1]?.scenarioId;
    setBusy(true);
    try {
      const r = await api.post(`/journey/attempts/${attemptId}/answer`, { scenarioId: target, followup: i });
      setFb({ ...fb, followupDone: { outcome: r.outcome, good: r.good }, points: r.points, tone: tone(r.points) });
      if (pending) setPending({ ...pending, points: r.points, followupAnswer: i });
      else setAnswered((a) => a.map((x, k) => (k === a.length - 1 ? { ...x, points: r.points, followupAnswer: i } : x)));
    } catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  function next() {
    if (pending) { const p = pending; setPending(null); setAnswered((a) => [...a, p]); }
    setFb(null);
  }
  async function finish() {
    setBusy(true);
    try { const r = await api.post(`/journey/attempts/${attemptId}/finish`); setResult(r); setPhase('result'); }
    catch (e: any) { toast('err', e.message); } finally { setBusy(false); }
  }
  async function loadReview() {
    try { setReview(await api.get(`/journey/attempts/${attemptId}/review`)); } catch (e: any) { toast('info', e.message); }
  }

  const header = (
    <div className="mb-5 flex items-center gap-3">
      <Link to="/student/journey" className="rounded-xl p-2 hover:bg-white/10" aria-label="العودة"><ArrowRight /></Link>
      <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `linear-gradient(135deg, ${stage.color}, #1e1b4b)` }}><WorldIcon name={stage.icon} size={22} /></div>
      <div className="min-w-0 flex-1"><div className="truncate font-bold">{stage.title}</div><div className="text-xs text-violet-100/70">{stage.topic}</div></div>
      {phase === 'play' && <div className="glass flex items-center gap-1.5 px-3 py-1.5 text-sm"><Star size={16} className="text-amber-300" /><b>{earned + (pending?.points ?? 0)}</b></div>}
    </div>
  );

  // -------------------------------------------------------------- intro
  if (phase === 'intro') {
    const lines = stage.intro as { speaker: string; text: string }[];
    const done = access.state === 'completed';
    return (
      <div className="mx-auto max-w-3xl">{header}
        <div className="glass relative overflow-hidden p-6 md:p-10">
          <div className="absolute -top-20 -end-20 h-60 w-60 rounded-full opacity-30 blur-3xl" style={{ background: stage.color }} />
          <div className="relative flex flex-col items-center text-center">
            <Noor size={110} mood={introIdx === 0 ? 'think' : 'happy'} className="animate-float" />
            <AnimatePresence mode="wait">
              <motion.div key={introIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 min-h-[7rem] max-w-xl">
                <div className="text-sm font-semibold text-cyan-200">{lines[introIdx].speaker}</div>
                <p className="mt-2 text-lg leading-9">{lines[introIdx].text}</p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 flex gap-1.5">{lines.map((_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-all', i === introIdx ? 'w-6 bg-cyan-300' : 'w-1.5 bg-white/30')} />)}</div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {introIdx < lines.length - 1 ? <SBtn onClick={() => setIntroIdx(introIdx + 1)}>التالي <ArrowLeft size={18} /></SBtn>
                : done ? <SGhost onClick={() => nav('/student/certificates')}><Award size={18} />أكملتِ هذه المرحلة — عرض الشهادة</SGhost>
                : <SBtn onClick={start} disabled={busy}><Sparkles size={18} />ابدئي المغامرة</SBtn>}
            </div>
            {!done && <div className="mt-4 text-xs text-violet-100/60">درجة الاجتياز {access.passScore}% · المحاولات المتبقية {access.attemptsLeft}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- result
  if (phase === 'result' && result) {
    return (
      <div className="mx-auto max-w-2xl">{header}
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass relative overflow-hidden p-8 text-center">
          {result.passed && <Confetti />}
          <Noor size={110} mood={result.passed ? 'wow' : 'sad'} className="mx-auto" />
          <h2 className="mt-4 text-3xl font-bold">{result.passed ? 'أحسنتِ! اجتزتِ المرحلة 🎉' : 'لم تصلي إلى درجة الاجتياز بعد'}</h2>
          <div className="mt-4 text-6xl font-black text-transparent bg-clip-text bg-gradient-to-l from-cyan-300 to-fuchsia-400">{Math.round(result.scorePct)}%</div>
          <div className="mt-1 text-sm text-violet-100/70">{result.points} من {result.maxPoints} نقطة · درجة الاجتياز {result.passScore}%</div>
          {result.passed && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <div className="glass flex items-center gap-2 px-4 py-2"><Award className="text-fuchsia-300" size={20} />شارة: <b>{result.badge}</b></div>
              <div className="glass flex items-center gap-2 px-4 py-2"><KeyRound className="text-cyan-300" size={20} /><b>{result.key}</b></div>
            </div>
          )}
          {result.journeyCertificateId && <div className="mt-5 rounded-2xl bg-amber-400/15 p-4 font-semibold text-amber-200">🏅 أكملتِ العوالم السبعة! حصلتِ على شهادة «سفيرة الوعي الرقمي»</div>}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {result.certificateId && <SBtn onClick={() => nav(`/student/certificates/${result.certificateId}`)}><Award size={18} />عرض شهادة المرحلة</SBtn>}
            {!result.passed && result.attemptsLeft > 0 && <SBtn onClick={() => window.location.reload()}><RotateCcw size={18} />إعادة المحاولة ({result.attemptsLeft})</SBtn>}
            {result.reviewAvailable && !review && <SGhost onClick={loadReview}><Eye size={18} />مراجعة الإجابات</SGhost>}
            <SGhost onClick={() => nav('/student/journey')}>العودة للخريطة</SGhost>
          </div>
          {!result.reviewAvailable && <div className="mt-4 text-xs text-violet-100/60">ستتاح مراجعة الإجابات الصحيحة وفق إعدادات المعلمة.</div>}
        </motion.div>
        {review && (
          <div className="glass mt-5 space-y-2 p-5">
            <h3 className="mb-2 font-bold">مراجعة المحاولة</h3>
            {review.items.map((it: any) => (
              <div key={it.position} className="rounded-xl bg-white/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{it.position}. {it.title}</b><span className={cx('text-xs', it.points >= it.max_points * 0.9 ? 'text-emerald-300' : 'text-amber-200')}>{it.points}/{it.max_points}</span></div>
                {it.question && <div className="mt-1 text-violet-100/80">{it.question}</div>}
                {it.my_choice && <div className="mt-1 text-violet-100/70">إجابتك: {it.my_choice}</div>}
                {it.best_choice && it.best_choice !== it.my_choice && <div className="text-emerald-300">الأفضل: {it.best_choice}</div>}
                {it.explanation && <div className="mt-1 text-cyan-100/80">💡 {it.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------- play
  const pos = Math.min(answered.length + (pending ? 1 : 0), steps.length);
  return (
    <div className="mx-auto max-w-3xl">{header}
      <div className="mb-5 flex items-center gap-3">
        <SBar value={(pos / steps.length) * 100} className="flex-1" />
        <span className="text-xs text-violet-100/70">{pos}/{steps.length}</span>
      </div>
      {!current && !fb ? (
        <div className="glass p-8 text-center">
          <Noor size={100} mood="happy" className="mx-auto" />
          <h2 className="mt-4 text-2xl font-bold">أنهيتِ جميع الأنشطة!</h2>
          <p className="mt-2 text-violet-100/70">اضغطي لحساب نتيجتك النهائية في هذه المرحلة.</p>
          <SBtn className="mt-6" onClick={finish} disabled={busy}><CheckCircle2 size={18} />إنهاء المرحلة واحتساب النتيجة</SBtn>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={(current?.id ?? 0) + (fb ? '-fb' : '')} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            {fb ? <FeedbackPanel fb={fb} step={steps[answered.length]} busy={busy} onFollowup={answerFollowup} onNext={next} /> :
              current!.kind === 'scenario' ? <ScenarioStep s={current!} busy={busy} onChoose={(cid) => answer({ choiceId: cid })} /> :
              current!.kind === 'quiz' ? <QuizStep s={current!} busy={busy} index={steps.filter((x) => x.kind === 'quiz').indexOf(current!) + 1} onChoose={(cid) => answer({ choiceId: cid })} /> :
              <MiniGame s={current!} busy={busy} onSubmit={(payload) => answer({ payload })} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
const SCENE_ICON: Record<string, any> = { email: Mail, chat: MessageCircle, phone: Smartphone, call: Smartphone };

function ScenarioStep({ s, busy, onChoose }: { s: Step; busy: boolean; onChoose: (id: number) => void }) {
  const I = SCENE_ICON[s.content.scene] ?? Sparkles;
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3 text-sm text-cyan-100"><I size={16} />{s.content.setting}<span className="ms-auto text-xs text-violet-100/60">سيناريو</span></div>
      <div className="p-5 md:p-6">
        <h2 className="text-xl font-bold">{s.title}</h2>
        <div className="mt-4 space-y-3">
          {s.content.dialogue.map((d: any, i: number) => {
            const noor = d.speaker === 'نور';
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.25 }} className={cx('flex items-end gap-2', noor && 'flex-row-reverse')}>
                {noor ? <Noor size={40} mood="think" /> : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs">{d.speaker[0]}</div>}
                <div className={cx('max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7', noor ? 'rounded-be-sm bg-nova-600/50' : 'rounded-bs-sm bg-white/10')}>
                  <div className="mb-0.5 text-xs font-semibold opacity-70">{d.speaker}</div>{d.text}
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-6 font-semibold text-cyan-100">{s.content.prompt}</div>
        <div className="mt-3 grid gap-2">
          {s.choices.map((c, i) => (
            <button key={c.id} disabled={busy} onClick={() => onChoose(c.id)} className="group flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-start transition hover:border-cyan-300/60 hover:bg-white/10 disabled:opacity-50">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-bold group-hover:bg-cyan-400/30">{['أ', 'ب', 'ج', 'د'][i]}</span>{c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizStep({ s, busy, index, onChoose }: { s: Step; busy: boolean; index: number; onChoose: (id: number) => void }) {
  return (
    <div className="glass p-6">
      <div className="text-xs font-semibold text-fuchsia-300">التقييم النهائي · سؤال {index} من 4</div>
      <h2 className="mt-2 text-xl font-bold leading-9">{s.content.question}</h2>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {s.choices.map((c) => <button key={c.id} disabled={busy} onClick={() => onChoose(c.id)} className="rounded-xl border border-white/15 bg-white/5 p-4 text-start transition hover:border-fuchsia-300/60 hover:bg-white/10 disabled:opacity-50">{c.label}</button>)}
      </div>
      <div className="mt-4 text-xs text-violet-100/60">ستظهر الإجابات الصحيحة بعد إنهاء المرحلة وفق إعدادات المعلمة.</div>
    </div>
  );
}

function FeedbackPanel({ fb, busy, onFollowup, onNext }: { fb: Feedback; step?: Step; busy: boolean; onFollowup: (i: number) => void; onNext: () => void }) {
  const col = fb.tone === 'good' ? 'from-emerald-500/30 border-emerald-400/40' : fb.tone === 'mid' ? 'from-amber-500/25 border-amber-400/40' : 'from-rose-500/25 border-rose-400/40';
  const needsFollowup = fb.followup && !fb.followupDone;
  return (
    <div className={cx('rounded-2xl border bg-gradient-to-b to-transparent p-6', col)}>
      <div className="flex items-start gap-4">
        <Noor size={70} mood={fb.tone === 'good' ? 'wow' : fb.tone === 'mid' ? 'think' : 'sad'} />
        <div className="flex-1">
          <div className="text-sm font-semibold opacity-80">{fb.tone === 'good' ? 'قرار موفق!' : fb.tone === 'mid' ? 'قرار مقبول… ويمكن أفضل' : 'نتيجة القرار'}</div>
          <p className="mt-1 text-lg leading-8">{fb.outcome}</p>
          {fb.points !== undefined && <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm"><Star size={14} className="text-amber-300" />+{fb.points} نقاط</div>}
        </div>
      </div>
      {fb.detail && <MiniGameDetail detail={fb.detail} />}
      {needsFollowup && (
        <div className="mt-5 rounded-xl bg-black/20 p-4">
          <div className="mb-3 font-semibold text-cyan-100">↪ {fb.followup!.prompt}</div>
          <div className="grid gap-2">{fb.followup!.options.map((o, i) => <button key={i} disabled={busy} onClick={() => onFollowup(i)} className="rounded-xl border border-white/15 bg-white/5 p-3 text-start hover:bg-white/10 disabled:opacity-50">{o}</button>)}</div>
        </div>
      )}
      {fb.followupDone && <div className={cx('mt-4 rounded-xl p-4', fb.followupDone.good ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>{fb.followupDone.outcome}</div>}
      {!needsFollowup && <div className="mt-6 flex justify-end"><SBtn onClick={onNext}>متابعة <ArrowLeft size={18} /></SBtn></div>}
    </div>
  );
}

function MiniGameDetail({ detail }: { detail: any }) {
  if (detail.why) return (
    <div className="mt-4 space-y-1 text-sm">
      <div className="text-violet-100/80">اكتشفتِ {detail.hits} من {detail.flags.length} علامات{detail.wrong ? ` (و${detail.wrong} اختيار غير صحيح)` : ''}:</div>
      {Object.entries(detail.why).map(([k, v]) => <div key={k} className="flex gap-2"><span className="text-rose-300">⚑</span>{v as string}</div>)}
    </div>
  );
  if (detail.order) return <div className="mt-4 text-sm text-violet-100/80">رتبتِ {detail.correctPositions} من {detail.order.length} خطوات في مكانها الصحيح.</div>;
  const vals = Object.values(detail) as any[];
  return <div className="mt-4 text-sm text-violet-100/80">صنّفتِ {vals.filter((v) => v.correct).length} من {vals.length} عناصر بشكل صحيح.</div>;
}

function MiniGame({ s, busy, onSubmit }: { s: Step; busy: boolean; onSubmit: (p: any) => void }) {
  const c = s.content;
  const [map, setMap] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string[]>([]);
  const [order, setOrder] = useState<{ id: string; text: string }[]>(c.steps ?? []);
  const move = (i: number, d: number) => { const x = [...order]; [x[i], x[i + d]] = [x[i + d], x[i]]; setOrder(x); };
  return (
    <div className="glass p-5 md:p-6">
      <div className="text-xs font-semibold text-amber-300">🎮 لعبة مصغّرة</div>
      <h2 className="mt-1 text-xl font-bold">{s.title}</h2>
      <p className="mt-2 text-sm text-violet-100/80">{c.instructions}</p>
      {c.game === 'classify' && (
        <div className="mt-5 space-y-2">
          {c.items.map((it: any) => (
            <div key={it.id} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 sm:flex-row sm:items-center">
              <span className="flex-1 text-sm">{it.text}</span>
              <div className="flex gap-1.5">
                {c.bins.map((b: any) => (
                  <button key={b.id} onClick={() => setMap({ ...map, [it.id]: b.id })}
                    className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', map[it.id] === b.id ? 'bg-cyan-400 text-ink-900' : 'bg-white/10 hover:bg-white/20')}>{b.label}</button>
                ))}
              </div>
            </div>
          ))}
          <SBtn className="mt-3 w-full" disabled={busy || Object.keys(map).length < c.items.length} onClick={() => onSubmit({ map })}>تحقق ({Object.keys(map).length}/{c.items.length})</SBtn>
        </div>
      )}
      {c.game === 'spot' && (
        <div className="mt-5">
          <div className="overflow-hidden rounded-xl bg-white text-slate-800">
            <div className="flex items-center gap-2 border-b bg-slate-100 px-4 py-2 text-xs text-slate-500"><Mail size={14} />{c.artifact.header}</div>
            {c.lines.map((l: any) => (
              <button key={l.id} onClick={() => setSel(sel.includes(l.id) ? sel.filter((x) => x !== l.id) : [...sel, l.id])}
                className={cx('block w-full border-b border-slate-100 px-4 py-3 text-start text-sm transition', sel.includes(l.id) ? 'bg-rose-100 font-semibold text-rose-800' : 'hover:bg-slate-50')}>
                {sel.includes(l.id) && '⚑ '}{l.text}
              </button>
            ))}
          </div>
          <SBtn className="mt-4 w-full" disabled={busy || !sel.length} onClick={() => onSubmit({ selected: sel })}>تحقق من العلامات ({sel.length})</SBtn>
        </div>
      )}
      {c.game === 'order' && (
        <div className="mt-5 space-y-2">
          {order.map((it, i) => (
            <div key={it.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/20 font-bold">{i + 1}</span>
              <span className="flex-1 text-sm">{it.text}</span>
              <button aria-label="أعلى" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"><ArrowUp size={16} /></button>
              <button aria-label="أسفل" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"><ArrowDown size={16} /></button>
            </div>
          ))}
          <SBtn className="mt-3 w-full" disabled={busy} onClick={() => onSubmit({ order: order.map((x) => x.id) })}>تأكيد الترتيب</SBtn>
        </div>
      )}
    </div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 40 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((_, i) => (
        <motion.span key={i} className="absolute top-0 h-2.5 w-1.5 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: ['#22d3ee', '#f0abfc', '#fde047', '#a78bfa', '#34d399'][i % 5] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: 520, rotate: 360 * (i % 2 ? 1 : -1), opacity: 0 }} transition={{ duration: 2.2 + (i % 5) * 0.3, delay: (i % 10) * 0.08 }} />
      ))}
    </div>
  );
}

