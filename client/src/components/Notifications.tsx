import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cx, useLoad, Spinner, Empty } from '../lib/ui';
import { relTime } from '../lib/format';

export interface Note { id: number; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }

export function NotificationList({ dark, limit, onNavigate }: { dark?: boolean; limit?: number; onNavigate?: () => void }) {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(() => api.get<Note[]>('/notifications'));
  const open = async (n: Note) => {
    if (!n.read_at) { await api.post('/notifications/read', { ids: [n.id] }); refresh(); reload(); }
    if (n.link) { onNavigate?.(); nav(n.link); }
  };
  const all = async () => { await api.post('/notifications/read'); refresh(); reload(); };
  if (loading) return <Spinner />;
  const items = (data ?? []).slice(0, limit ?? 100);
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className={cx('text-sm font-semibold', dark ? 'text-white' : 'text-slate-800')}>الإشعارات</span>
        {items.some((n) => !n.read_at) && <button onClick={all} className={cx('flex items-center gap-1 text-xs font-semibold', dark ? 'text-cyan-300' : 'text-nova-600')}><CheckCheck size={14} />تعليم الكل كمقروء</button>}
      </div>
      {!items.length ? <Empty title="لا توجد إشعارات" /> : (
        <ul className="space-y-1">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className={cx('flex w-full gap-3 rounded-xl p-3 text-start transition',
                dark ? 'hover:bg-white/10' : 'hover:bg-slate-50', !n.read_at && (dark ? 'bg-white/[.07]' : 'bg-nova-50/60'))}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-rose-500')} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-sm font-semibold', dark ? 'text-white' : 'text-slate-800')}>{n.title}</span>
                  {n.body && <span className={cx('block text-xs', dark ? 'text-violet-200/70' : 'text-slate-500')}>{n.body}</span>}
                  <span className={cx('mt-0.5 block text-[11px]', dark ? 'text-violet-200/50' : 'text-slate-400')}>{relTime(n.created_at)} · {n.read_at ? 'مقروء' : 'غير مقروء'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Bell_({ dark, allLink }: { dark?: boolean; allLink: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="الإشعارات" className={cx('relative rounded-xl p-2', dark ? 'text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100')}>
        <Bell size={21} />
        {!!user?.unread && <span className="absolute -top-0.5 -end-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{user.unread > 99 ? '99+' : user.unread}</span>}
      </button>
      {open && (
        <div className={cx('absolute end-0 z-40 mt-2 w-[min(22rem,90vw)] rounded-2xl p-3 shadow-2xl', dark ? 'border border-white/10 bg-ink-800' : 'border border-slate-200 bg-white')}>
          <div className="max-h-96 overflow-y-auto"><NotificationList dark={dark} limit={8} onNavigate={() => setOpen(false)} /></div>
          <Link to={allLink} onClick={() => setOpen(false)} className={cx('mt-2 block rounded-xl py-2 text-center text-sm font-semibold', dark ? 'text-cyan-300 hover:bg-white/5' : 'text-nova-600 hover:bg-slate-50')}>عرض كل الإشعارات</Link>
        </div>
      )}
    </div>
  );
}
