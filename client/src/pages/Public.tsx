import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, UserRound, LogIn, ShieldCheck, ShieldX, Sparkles, BookOpen, Award, Lock, ArrowLeft } from 'lucide-react';
import { Logo, Noor, NovaCity, LearningScene } from '../components/Art';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Input, Field, cx, useLoad, Spinner } from '../lib/ui';
import { fmtDate } from '../lib/format';
import { CERT_KIND } from '../components/Certificate';

export function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const go = (section: 'journey' | 'courses') => {
    if (user?.role === 'student') nav(section === 'journey' ? '/student/journey' : '/student/courses');
    else if (user?.role === 'teacher') nav(section === 'journey' ? '/teacher/stages' : '/teacher/courses');
    else nav(`/login?role=student&next=${section === 'journey' ? '/student/journey' : '/student/courses'}`);
  };
  return (
    <div className="student-bg min-h-screen text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo light />
        {user ? (
          <Button onClick={() => nav(user.role === 'teacher' ? '/teacher' : '/student')} icon={<ArrowLeft size={16} />}>لوحتي</Button>
        ) : (
          <Button onClick={() => nav('/login')} icon={<LogIn size={16} />}>تسجيل الدخول</Button>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="flex flex-col items-center py-10 text-center md:py-14">
          <Noor size={110} className="animate-float" />
          <h1 className="mt-4 bg-gradient-to-l from-cyan-300 via-violet-200 to-fuchsia-300 bg-clip-text pb-3 text-4xl font-bold leading-[1.35] text-transparent md:text-6xl md:leading-[1.35]">شفرة الوعي الرقمي</h1>
          <p className="mt-3 text-xl font-semibold text-cyan-100">تعلمي، اكتشفي، أنجزي.</p>
          <p className="mt-3 max-w-2xl text-base leading-8 text-violet-100/80">منصة تفاعلية لطالبات المرحلتين المتوسطة والثانوية، تجمع بين مغامرة تعليمية في مدينة نوفا الرقمية ودورات تدريبية بشهادات إنجاز معتمدة.</p>
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          {[
            { k: 'journey' as const, title: 'رحلة الوعي الرقمي', desc: 'انطلقي في مغامرة تعليمية لاكتساب مهارات الوعي الرقمي.', btn: 'استكشفي الرحلة', art: <NovaCity className="h-full w-full" />, tags: [[Sparkles, '7 عوالم تفاعلية'], [Award, 'شهادة لكل مرحلة']], noor: true },
            { k: 'courses' as const, title: 'الدورات التدريبية', desc: 'طوري مهاراتك من خلال دورات تعليمية واختبارات وشهادات إنجاز.', btn: 'استعرضي الدورات', art: <LearningScene className="h-full w-full" />, tags: [[BookOpen, 'وحدات ودروس'], [GraduationCap, 'اختبارات وشهادات']] },
          ].map((c, i) => (
            <motion.button key={c.k} onClick={() => go(c.k)} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.12 }}
              whileHover={{ y: -6 }} className="glass group flex flex-col overflow-hidden text-start shadow-glow">
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                {c.art}
                {c.noor && <Noor size={72} mood="wow" className="absolute bottom-3 start-4 drop-shadow-xl" />}
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h2 className="text-2xl font-bold">{c.title}</h2>
                <p className="mt-2 text-violet-100/80">{c.desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.tags.map(([I, t]: any) => <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs"><I size={14} />{t}</span>)}
                </div>
                <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-nova-600 px-5 py-2.5 font-semibold transition group-hover:gap-3">{c.btn}<ArrowLeft size={18} /></span>
              </div>
            </motion.button>
          ))}
        </section>
        <section className="mt-12 grid gap-4 text-sm text-violet-100/70 sm:grid-cols-3">
          {[[Lock, 'حسابات آمنة', 'دخول منفصل للمعلمة والطالبة وصلاحيات محمية على الخادم.'], [ShieldCheck, 'شهادات قابلة للتحقق', 'لكل شهادة رقم فريد ورمز QR للتحقق من صحتها.'], [Sparkles, 'تعلّم بالمغامرة', 'سيناريوهات وقرارات وألعاب مصغرة بدل الأسئلة الجامدة.']].map(([I, t, d]: any) => (
            <div key={t} className="glass p-5"><I className="text-cyan-300" size={22} /><div className="mt-2 font-semibold text-white">{t}</div><div className="mt-1 leading-6">{d}</div></div>
          ))}
        </section>
      </main>
      <footer className="pb-8 text-center text-xs text-violet-200/50">© {new Date().getFullYear()} شفرة الوعي الرقمي — Digital Awareness Quest</footer>
    </div>
  );
}

export function Login() {
  const [sp] = useSearchParams();
  const [role, setRole] = useState<'student' | 'teacher'>(sp.get('role') === 'teacher' ? 'teacher' : 'student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const nav = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post('/auth/login', { role, username, password });
      await refresh();
      const next = sp.get('next');
      const home = r.user.role === 'teacher' ? '/teacher' : '/student';
      nav(r.user.mustChangePassword ? '/change-password' : next && next.startsWith(home) ? next : home, { replace: true });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="student-bg grid min-h-screen place-items-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <Link to="/" className="mb-6 inline-block"><Logo /></Link>
        <h1 className="text-xl font-bold text-slate-900">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-slate-500">اختاري نوع الحساب ثم أدخلي بياناتك</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" role="tablist">
          {([['student', 'دخول الطالبة', UserRound], ['teacher', 'دخول المعلمة', GraduationCap]] as const).map(([r, l, I]) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)}
              className={cx('flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition', role === r ? 'bg-white text-nova-700 shadow' : 'text-slate-500')}>
              <I size={17} />{l}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={role === 'teacher' ? 'البريد الإلكتروني' : 'الرقم التعريفي'}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" dir="ltr" className="text-start" required
              placeholder={role === 'teacher' ? 'name@school.sa' : 'S2612345'} />
          </Field>
          <Field label="كلمة المرور">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" dir="ltr" required />
          </Field>
          {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{err}</div>}
          <Button type="submit" loading={busy} className="w-full" size="lg" icon={<LogIn size={18} />}>دخول</Button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">{role === 'student' ? 'نسيتِ كلمة المرور؟ تطلب المعلمة إعادة تعيينها من لوحتها.' : 'حسابات المعلمات تُنشأ من قبل مسؤول المنصة.'}</p>
      </motion.div>
    </div>
  );
}

export function ChangePassword() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState(''); const [n1, setN1] = useState(''); const [n2, setN2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (n1 !== n2) return setErr('كلمتا المرور غير متطابقتين');
    setBusy(true);
    try { await api.post('/auth/change-password', { current: cur, next: n1 }); await refresh(); nav(user?.role === 'teacher' ? '/teacher' : '/student', { replace: true }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (!user) return <Login />;
  return (
    <div className="student-bg grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-7 shadow-2xl">
        <Logo />
        <h1 className="text-xl font-bold">تعيين كلمة مرور جديدة</h1>
        <p className="text-sm text-slate-500">{user.mustChangePassword ? 'لحماية حسابك، اختاري كلمة مرور خاصة بك قبل المتابعة.' : 'غيّري كلمة المرور الخاصة بك.'}</p>
        <Field label="كلمة المرور الحالية (المؤقتة)"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required dir="ltr" autoComplete="current-password" /></Field>
        <Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل — جرّبي عبارة مرور طويلة يسهل تذكرها"><Input type="password" value={n1} onChange={(e) => setN1(e.target.value)} required minLength={8} dir="ltr" autoComplete="new-password" /></Field>
        <Field label="تأكيد كلمة المرور"><Input type="password" value={n2} onChange={(e) => setN2(e.target.value)} required dir="ltr" autoComplete="new-password" /></Field>
        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <Button type="submit" loading={busy} className="w-full" size="lg">حفظ</Button>
      </form>
    </div>
  );
}

export function Verify() {
  const { serial } = useParams();
  const [sp] = useSearchParams();
  const { data, loading } = useLoad(() => fetch(`/api/verify/${encodeURIComponent(serial!)}?t=${encodeURIComponent(sp.get('t') ?? '')}`).then((r) => r.json()), [serial]);
  const c = data?.certificate;
  return (
    <div className="student-bg grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">التحقق من صحة الشهادة</h1>
        {loading ? <Spinner /> : !c ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700"><ShieldX size={28} /><div><b>لم يتم العثور على الشهادة</b><div className="text-sm">تأكدي من مسح رمز QR الصحيح أو من رقم الشهادة.</div></div></div>
        ) : (
          <>
            <div className={cx('mt-6 flex items-center gap-3 rounded-2xl p-4', data.valid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700')}>
              {data.valid ? <ShieldCheck size={30} /> : <ShieldX size={30} />}
              <div><b className="text-lg">{data.valid ? 'شهادة سارية وصحيحة' : 'شهادة ملغاة'}</b><div className="text-sm">{data.valid ? 'صادرة من منصة شفرة الوعي الرقمي' : `أُلغيت بتاريخ ${fmtDate(c.revoked_at)}`}</div></div>
            </div>
            <dl className="mt-5 divide-y divide-slate-100 text-sm">
              {[['نوع الشهادة', CERT_KIND[c.kind]], ['اسم الطالبة', c.student_name], [c.kind === 'course' ? 'الدورة' : 'المرحلة', c.title], ...(c.hours ? [['الساعات التدريبية', c.hours]] : []), ['تاريخ الإصدار', fmtDate(c.issued_at)], ['رقم الشهادة', c.serial]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
          </>
        )}
        <Link to="/" className="mt-6 block text-center text-sm font-semibold text-nova-600">العودة إلى المنصة</Link>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="student-bg grid min-h-screen place-items-center p-4 text-center text-white">
      <div><Noor mood="sad" size={110} /><h1 className="mt-4 text-2xl font-bold">الصفحة غير موجودة</h1><Link to="/" className="mt-4 inline-block text-cyan-300 underline">العودة للرئيسية</Link></div>
    </div>
  );
}
