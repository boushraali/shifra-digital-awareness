import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, KeyRound, Star, Trophy, Lock, BookOpen, ShieldCheck, Map } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad, Spinner, ErrorBox, cx } from '../../lib/ui';
import { fmtDate, levelLabel, gradeLabel } from '../../lib/format';
import { WorldIcon } from '../../components/Art';
import { CertificateViewer, CERT_KIND, type Cert } from '../../components/Certificate';
import { NotificationList } from '../../components/Notifications';
import { SCard, STitle, SBar, SGhost } from './Layout';

export function Achievements() {
  const { data, loading, error } = useLoad(() => api.get('/student/achievements'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const done = data.stages.filter((s: any) => s.status === 'completed').length;
  return (
    <div className="space-y-6">
      <STitle title="إنجازاتي" sub="نقاطك وشاراتك ومفاتيح مدينة نوفا." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[[Star, 'مجموع النقاط', data.totalPoints, 'text-amber-300'], [KeyRound, 'المفاتيح', `${done}/7`, 'text-cyan-300'], [Award, 'الشارات', data.items.filter((i: any) => i.kind === 'badge').length, 'text-fuchsia-300'], [BookOpen, 'دورات مكتملة', `${data.courses.completed}/${data.courses.enrolled}`, 'text-emerald-300']].map(([I, l, v, c]: any) => (
          <SCard key={l} className="!p-4"><I className={c} size={22} /><div className="mt-2 text-2xl font-bold">{v}</div><div className="text-xs text-violet-100/70">{l}</div></SCard>
        ))}
      </div>
      <SCard>
        <div className="mb-2 flex justify-between text-sm"><b>نسبة إنجاز رحلة الوعي الرقمي</b><span>{Math.round((done / 7) * 100)}%</span></div>
        <SBar value={(done / 7) * 100} />
      </SCard>
      <div>
        <h2 className="mb-3 text-lg font-bold">شارات ومفاتيح العوالم</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.stages.map((s: any) => {
            const got = s.status === 'completed';
            return (
              <SCard key={s.id} className={cx('text-center', !got && 'opacity-50')}>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: got ? `radial-gradient(circle, ${s.color}, #1e1b4b)` : '#ffffff14' }}>
                  {got ? <WorldIcon name={s.icon} size={28} /> : <Lock size={24} />}
                </div>
                <div className="mt-2 font-bold">{s.badge_name}</div>
                <div className="text-xs text-violet-100/70">{s.title}</div>
                {got && <div className="mt-1 text-xs text-cyan-200">🔑 {s.key_name} · {Math.round(s.best_score)}%</div>}
              </SCard>
            );
          })}
          <SCard className={cx('text-center', done < 7 && 'opacity-50')}>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600"><Trophy size={28} className="text-amber-950" /></div>
            <div className="mt-2 font-bold">سفيرة الوعي الرقمي</div><div className="text-xs text-violet-100/70">أكملي العوالم السبعة</div>
          </SCard>
        </div>
      </div>
    </div>
  );
}

export function Certificates() {
  const { data, loading, error } = useLoad(() => api.get<Cert[]>('/certificates/mine'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  const groups: [string, Cert[]][] = [['شهادات رحلة الوعي الرقمي', data.filter((c) => c.kind !== 'course')], ['شهادات الدورات التدريبية', data.filter((c) => c.kind === 'course')]];
  return (
    <div className="space-y-6">
      <STitle title="شهاداتي" sub="جميع شهاداتك في مكان واحد — يمكنك عرضها وتحميلها بصيغة PDF في أي وقت." />
      {!data.length && <SCard className="py-12 text-center text-violet-100/70">لم تحصلي على شهادات بعد. أكملي مرحلة من رحلة الوعي الرقمي أو دورة تدريبية لتحصلي على أول شهادة!</SCard>}
      {groups.map(([title, list]) => !!list.length && (
        <div key={title}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">{title.includes('رحلة') ? <Map size={18} /> : <BookOpen size={18} />}{title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link key={c.id} to={`/student/certificates/${c.id}`} className="glass group relative overflow-hidden p-5 transition hover:-translate-y-1 hover:bg-white/10">
                <div className="absolute -end-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-amber-300/40 to-fuchsia-500/30 blur-xl" />
                <Award size={30} className={c.kind === 'journey' ? 'text-amber-300' : 'text-cyan-300'} />
                <div className="mt-3 text-xs text-violet-100/70">{CERT_KIND[c.kind]}</div>
                <div className="text-lg font-bold">{c.title}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-violet-100/60"><span>{fmtDate(c.issued_at)}</span>
                  <span className={cx('rounded-full px-2 py-0.5', c.status === 'valid' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200')}>{c.status === 'valid' ? 'سارية' : 'ملغاة'}</span></div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CertificatePage({ dark = true }: { dark?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, error } = useLoad(() => api.get<Cert>(`/certificates/${id}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} />;
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 print:hidden">
        {dark ? <SGhost onClick={() => nav(-1)}>رجوع</SGhost> : <button onClick={() => nav(-1)} className="text-sm text-slate-500">← رجوع</button>}
        <div><div className={cx('font-bold', !dark && 'text-slate-900')}>{CERT_KIND[data.kind]} — {data.title}</div><div className={cx('text-xs', dark ? 'text-violet-100/60' : 'text-slate-500')} dir="ltr">{data.serial}</div></div>
      </div>
      {data.status === 'revoked' && <div className="mb-4 rounded-xl bg-rose-500/20 p-3 text-sm text-rose-100 print:hidden">هذه الشهادة ملغاة{data.revoke_reason ? `: ${data.revoke_reason}` : ''}</div>}
      <CertificateViewer c={data} />
    </div>
  );
}

export function StudentProfile() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <STitle title="ملفي الشخصي" />
      <SCard className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-nova-600 text-2xl font-bold">{user.name[0]}</div>
        <div><div className="text-xl font-bold">{user.name}</div><div className="text-sm text-violet-100/70">الرقم التعريفي: <span dir="ltr">{user.studentCode}</span></div></div>
      </SCard>
      <SCard>
        <h2 className="mb-3 font-bold">البيانات التعليمية</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          {[['المرحلة الدراسية', levelLabel(user.level)], ['الصف', gradeLabel(user.grade)], ['الفصل', user.section]].map(([k, v]) => <div key={k} className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-violet-100/60">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-violet-100/60">لتعديل بياناتك التعليمية تواصلي مع معلمتك. لا تجمع المنصة إلا البيانات الضرورية للتعلم.</p>
      </SCard>
      <SCard>
        <h2 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck size={18} />إعدادات الحساب</h2>
        <Link to="/change-password" className="inline-flex rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">تغيير كلمة المرور</Link>
      </SCard>
    </div>
  );
}

export function StudentNotifications() {
  return <div className="mx-auto max-w-2xl"><STitle title="الإشعارات" /><SCard><NotificationList dark /></SCard></div>;
}
