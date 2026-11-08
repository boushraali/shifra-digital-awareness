import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Home, Map, BookOpen, Trophy, Award, UserRound, LogOut, Library } from 'lucide-react';
import { Logo } from '../../components/Art';
import { Bell_ } from '../../components/Notifications';
import { useAuth } from '../../lib/auth';
import { cx } from '../../lib/ui';

const LINKS = [
  ['/student', 'الرئيسية', Home, true], ['/student/journey', 'رحلة الوعي', Map], ['/student/courses', 'الدورات', Library],
  ['/student/my-courses', 'دوراتي', BookOpen], ['/student/achievements', 'إنجازاتي', Trophy], ['/student/certificates', 'شهاداتي', Award],
] as const;

export function StudentLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="student-bg min-h-screen pb-20 text-white lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-900/70 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/student"><Logo light size={34} /></Link>
          <nav className="ms-4 hidden flex-1 gap-1 lg:flex">
            {LINKS.map(([to, label, I, end]) => (
              <NavLink key={to} to={to} end={!!end} className={({ isActive }) => cx('flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'bg-white/15 text-white' : 'text-violet-100/70 hover:bg-white/10 hover:text-white')}>
                <I size={16} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <Bell_ dark allLink="/student/notifications" />
            <NavLink to="/student/profile" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/10" aria-label="ملفي الشخصي">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-nova-600 text-sm font-bold">{user?.name?.[0]}</span>
              <span className="hidden text-sm sm:block">{user?.name.split(' ')[0]}</span>
            </NavLink>
            <button onClick={async () => { await logout(); nav('/'); }} className="rounded-xl p-2 text-violet-100/70 hover:bg-white/10" aria-label="تسجيل الخروج"><LogOut size={19} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/10 bg-ink-900/95 backdrop-blur lg:hidden print:hidden">
        {[...LINKS.slice(0, 5), ['/student/profile', 'ملفي', UserRound] as const].map(([to, label, I, end]) => (
          <NavLink key={to} to={to} end={!!end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px]', isActive ? 'text-cyan-300' : 'text-violet-100/60')}>
            <I size={20} />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Dark-theme building blocks for student pages */
export const SCard = ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={cx('glass p-5', className)}>{children}</div>;
export const SBtn = ({ className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-nova-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none', className)}>{children}</button>
);
export const SGhost = ({ className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40', className)}>{children}</button>
);
export const SBar = ({ value, className }: { value: number; className?: string }) => (
  <div className={cx('h-2 overflow-hidden rounded-full bg-white/10', className)}><div className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-fuchsia-500 transition-all" style={{ width: `${Math.min(100, value)}%` }} /></div>
);
export const STitle = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-6"><h1 className="text-2xl font-bold md:text-3xl">{title}</h1>{sub && <p className="mt-1 text-violet-100/70">{sub}</p>}</div>
);
