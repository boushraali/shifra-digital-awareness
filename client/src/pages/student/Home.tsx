import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, BookOpen, Award, Star, Trophy, ArrowLeft, Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { useLoad, Spinner, ErrorBox } from '../../lib/ui';
import { relTime } from '../../lib/format';
import { Noor, NovaCity } from '../../components/Art';
import { SCard, SBar } from './Layout';

export function StudentHome() {
  const { data, loading, error, reload } = useLoad(() => api.get('/student/dashboard'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const { me, journey, courses, certificates, points, lastAchievement, notifications } = data;
  const jp = Math.round((journey.completed / 7) * 100);
  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden p-6 md:p-8">
        <div className="relative z-10 max-w-xl">
          <div className="text-sm text-cyan-200">{me.levelLabel} — الصف {me.gradeLabel} — فصل {me.section}</div>
          <h1 className="mt-1 text-3xl font-bold">أهلًا {me.full_name.split(' ')[0]}! 👋</h1>
          <p className="mt-2 text-violet-100/80">{journey.completed === 7 ? 'أنتِ سفيرة الوعي الرقمي! تابعي تطوير مهاراتك عبر الدورات.' : journey.started ? 'رحلتك مستمرة في مدينة نوفا… العالم التالي بانتظارك.' : 'نور بانتظارك عند بوابة مدينة نوفا الرقمية. هل أنتِ مستعدة؟'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/student/journey" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-nova-600 px-5 py-2.5 font-semibold shadow-glow">رحلة الوعي الرقمي <ArrowLeft size={18} /></Link>
            <Link to="/student/courses" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 font-semibold hover:bg-white/10">الدورات التدريبية</Link>
          </div>
        </div>
        <Noor size={130} className="absolute bottom-2 end-4 hidden animate-float md:block" />
      </motion.section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[[Star, 'مجموع النقاط', points, 'text-amber-300'], [Award, 'الشهادات', certificates, 'text-cyan-300'], [Map, 'العوالم المكتملة', `${journey.completed}/7`, 'text-fuchsia-300'], [BookOpen, 'الدورات المسجلة', courses.enrolled, 'text-emerald-300']].map(([I, l, v, c]: any) => (
          <SCard key={l} className="!p-4"><I className={c} size={22} /><div className="mt-2 text-2xl font-bold">{v}</div><div className="text-xs text-violet-100/70">{l}</div></SCard>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/student/journey"><SCard className="h-full overflow-hidden !p-0 transition hover:bg-white/10">
          <NovaCity className="h-28 w-full object-cover" />
          <div className="p-5">
            <div className="flex items-center justify-between"><b>تقدم رحلة الوعي الرقمي</b><span className="text-sm text-cyan-200">{jp}%</span></div>
            <SBar value={jp} className="mt-3" />
            <div className="mt-2 text-xs text-violet-100/70">{journey.completed} من 7 عوالم مكتملة · {journey.started} بدأتِها</div>
          </div>
        </SCard></Link>
        <Link to="/student/my-courses"><SCard className="h-full transition hover:bg-white/10">
          <div className="flex items-center gap-2"><BookOpen size={20} className="text-emerald-300" /><b>دوراتي</b></div>
          <div className="mt-4 text-4xl font-bold">{courses.completed}<span className="text-lg text-violet-100/60"> / {courses.enrolled}</span></div>
          <div className="text-sm text-violet-100/70">دورة مكتملة</div>
          {lastAchievement && <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm"><Trophy size={18} className="text-amber-300" />آخر إنجاز: <b>{lastAchievement.title}</b> <span className="text-xs text-violet-100/60">{relTime(lastAchievement.created_at)}</span></div>}
        </SCard></Link>
      </div>

      <SCard>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-bold"><Bell size={18} />إشعارات المراحل والدورات</div><Link to="/student/notifications" className="text-sm text-cyan-300">الكل</Link></div>
        {!notifications.length ? <div className="py-4 text-center text-sm text-violet-100/60">لا توجد إشعارات بعد</div> : (
          <ul className="divide-y divide-white/10">
            {notifications.map((n: any) => (
              <li key={n.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-2 w-2 rounded-full ${n.read_at ? 'bg-white/20' : 'bg-rose-500'}`} />
                <div className="flex-1"><Link to={n.link ?? '#'} className="text-sm font-medium hover:underline">{n.title}</Link>{n.body && <div className="text-xs text-violet-100/60">{n.body}</div>}</div>
                <span className="text-xs text-violet-100/50">{relTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </SCard>
    </div>
  );
}
