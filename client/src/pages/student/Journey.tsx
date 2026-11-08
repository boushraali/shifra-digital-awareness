import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, CheckCircle2, Clock, PlayCircle, KeyRound, Star, Award, Hourglass } from 'lucide-react';
import { api } from '../../lib/api';
import { useLoad, Spinner, ErrorBox, cx } from '../../lib/ui';
import { fmtDateTime } from '../../lib/format';
import { Noor, WorldIcon } from '../../components/Art';
import { STitle } from './Layout';

const STATE_STYLE: Record<string, { ring: string; chip: string; icon: any }> = {
  open: { ring: 'ring-2 ring-cyan-300/80 shadow-glow', chip: 'bg-cyan-400/20 text-cyan-200', icon: PlayCircle },
  upcoming: { ring: 'opacity-90', chip: 'bg-sky-400/15 text-sky-200', icon: Clock },
  completed: { ring: 'ring-2 ring-emerald-400/70', chip: 'bg-emerald-400/20 text-emerald-200', icon: CheckCircle2 },
  locked: { ring: 'opacity-55 grayscale', chip: 'bg-white/10 text-violet-100/70', icon: Lock },
  ended: { ring: 'opacity-60', chip: 'bg-amber-400/15 text-amber-200', icon: Hourglass },
  expired_incomplete: { ring: 'opacity-60', chip: 'bg-amber-400/15 text-amber-200', icon: Hourglass },
};

export function JourneyMap() {
  const { data, loading, error, reload } = useLoad(() => api.get('/journey'));
  const nav = useNavigate();
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const done = data.stages.filter((s: any) => s.state === 'completed').length;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <STitle title="خريطة مدينة نوفا الرقمية" sub="سبعة عوالم، في كل عالم مهارة جديدة ومفتاح يقربك من لقب «سفيرة الوعي الرقمي»." />
        <div className="flex gap-2">
          {[[Star, data.totals.points, 'نقطة', 'text-amber-300'], [KeyRound, `${data.totals.keys}/7`, 'مفاتيح', 'text-cyan-300'], [Award, data.totals.badges, 'شارات', 'text-fuchsia-300']].map(([I, v, l, c]: any) => (
            <div key={l} className="glass flex items-center gap-2 px-3 py-2"><I size={18} className={c} /><b>{v}</b><span className="text-xs text-violet-100/70">{l}</span></div>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          <path d="M83 8 C 60 14, 40 10, 17 22 S 40 40, 83 42 S 60 64, 17 62 S 40 84, 50 94" fill="none" stroke="url(#pth)" strokeWidth=".5" strokeDasharray="1.5 1.2" />
          <defs><linearGradient id="pth"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#c026d3" /></linearGradient></defs>
        </svg>
        <div className="relative grid gap-5 md:grid-cols-2">
          {data.stages.map((s: any, i: number) => {
            const st = STATE_STYLE[s.state];
            const clickable = s.state === 'open' || s.state === 'completed';
            return (
              <motion.button key={s.id} disabled={!clickable} onClick={() => nav(`/student/journey/${s.id}`)}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileHover={clickable ? { scale: 1.02 } : {}}
                className={cx('glass flex items-start gap-4 p-5 text-start transition', st.ring, i === 6 && 'md:col-span-2 md:mx-auto md:w-1/2', !clickable && 'cursor-default')}>
                <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${s.color}, #1e1b4b)` }}>
                  <WorldIcon name={s.icon} size={30} />
                  <span className="absolute -top-2 -start-2 grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-xs font-bold ring-2 ring-white/20">{s.id}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', st.chip)}><st.icon size={13} />{s.stateLabel}</span>
                  </div>
                  <div className="text-sm text-cyan-100/80">{s.topic}</div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-violet-100/70">{s.summary}</p>
                  <div className="mt-2 text-xs text-violet-100/60">
                    {s.state === 'upcoming' && <>تُفتح في: <b className="text-sky-200">{fmtDateTime(s.openAt)}</b></>}
                    {s.state === 'open' && <>{s.closeAt ? <>تُغلق في: <b>{fmtDateTime(s.closeAt)}</b> · </> : null}المحاولات المتبقية: <b>{s.attemptsLeft}</b>{s.canContinue && <> · <b className="text-cyan-200">لديك محاولة جارية</b></>}{s.reason && <div className="text-amber-200">{s.reason}</div>}</>}
                    {s.state === 'completed' && <>أفضل درجة: <b className="text-emerald-200">{Math.round(s.bestScore)}%</b> · {s.key_name} 🔑</>}
                    {(s.state === 'locked' || s.state === 'ended' || s.state === 'expired_incomplete') && s.reason}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
      {done === 7 && (
        <div className="glass mt-8 flex items-center gap-4 p-6"><Noor mood="wow" size={80} /><div><div className="text-xl font-bold">مبروك يا سفيرة الوعي الرقمي! 🎉</div><div className="text-violet-100/80">أكملتِ العوالم السبعة. شهادتك الشاملة في صفحة «شهاداتي».</div></div></div>
      )}
    </div>
  );
}
