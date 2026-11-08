import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

export interface Me {
  id: string; role: 'teacher' | 'student'; name: string; username: string; mustChangePassword: boolean; isDemo: boolean;
  studentCode?: string; level?: string; grade?: number; section?: string; schoolName?: string; unread: number;
}
interface Ctx { user: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; }
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setUser((await api.get<{ user: Me | null }>('/auth/me')).user); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); }, []);
  useEffect(() => {
    refresh();
    const onExpired = () => setUser(null);
    window.addEventListener('session-expired', onExpired);
    const t = setInterval(refresh, 60_000); // keeps the unread badge fresh
    return () => { window.removeEventListener('session-expired', onExpired); clearInterval(t); };
  }, [refresh]);
  return <AuthCtx.Provider value={{ user, loading, refresh, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/** Client-side route guard (UX only — the server enforces every permission independently). */
export function RequireRole({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center text-slate-400">جارٍ التحميل…</div>;
  if (!user) return <Navigate to={`/login?role=${role}&next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}
