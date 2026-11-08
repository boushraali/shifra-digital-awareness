import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Map, CalendarClock, LineChart, BookOpen, FolderOpen, ListChecks, Award, BarChart3, Settings, LogOut, Menu, X } from 'lucide-react';
import { Logo } from '../../components/Art';
import { Bell_ } from '../../components/Notifications';
import { useAuth } from '../../lib/auth';
import { cx } from '../../lib/ui';

const NAV = [
  ['/teacher', 'الرئيسية', LayoutDashboard, true], ['/teacher/students', 'إدارة الطالبات', Users], ['/teacher/journey', 'رحلة الوعي الرقمي', Map],
  ['/teacher/stages', 'إدارة المراحل ومواعيدها', CalendarClock], ['/teacher/progress', 'متابعة تقدم الطالبات', LineChart], ['/teacher/courses', 'إدارة الدورات', BookOpen],
  ['/teacher/content', 'إدارة المحتوى العلمي', FolderOpen], ['/teacher/assessments', 'بنك الأسئلة والاختبارات', ListChecks], ['/teacher/certificates', 'الشهادات', Award],
  ['/teacher/reports', 'التقارير والإحصائيات', BarChart3], ['/teacher/settings', 'الإعدادات', Settings],
] as const;

export function TeacherLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const side = (
    <nav className="flex h-full flex-col gap-0.5 p-3">
      <div className="mb-4 px-2 pt-1"><Logo size={36} /></div>
      {NAV.map(([to, label, I, end]) => (
        <NavLink key={to} to={to} end={!!end} onClick={() => setOpen(false)}
          className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-nova-50 text-nova-700' : 'text-slate-600 hover:bg-slate-100')}>
          <I size={18} />{label}
        </NavLink>
      ))}
      <button onClick={async () => { await logout(); nav('/'); }} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut size={18} />تسجيل الخروج</button>
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-slate-200 bg-white lg:block print:hidden">{side}</aside>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-72 bg-white" onClick={(e) => e.stopPropagation()}>{side}</aside></div>}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur print:hidden">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">{open ? <X /> : <Menu />}</button>
          <div className="text-sm text-slate-500">لوحة تحكم المعلمة{user?.isDemo && <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">بيئة تجريبية</span>}</div>
          <div className="ms-auto flex items-center gap-2">
            <Bell_ allLink="/teacher/notifications" />
            <div className="flex items-center gap-2 rounded-xl px-2 py-1">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-nova-600 text-sm font-bold text-white">{user?.name?.[0]}</span>
              <span className="hidden text-sm font-medium text-slate-700 sm:block">{user?.name}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
