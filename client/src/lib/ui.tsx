import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toRiyadhParts, fromRiyadhParts } from './format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// --------------------------------------------------------------- data hook
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fnRef.current()); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}

// ------------------------------------------------------------------ toast
type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 print:hidden" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
                t.kind === 'ok' ? 'bg-emerald-600 text-white' : t.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white')}>
              {t.kind === 'ok' ? <CheckCircle2 size={18} /> : t.kind === 'err' ? <AlertTriangle size={18} /> : <Info size={18} />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- buttons
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode };
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...p }: BtnProps) {
  return (
    <button {...p} disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-nova-400 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-nova-600 text-white hover:bg-nova-700',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700', className)}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ cards
export const Card = ({ className, children }: { className?: string; children: ReactNode }) =>
  <div className={cx('rounded-2xl border border-slate-200 bg-white shadow-card', className)}>{children}</div>;

const BADGE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', blue: 'bg-sky-50 text-sky-700 ring-sky-600/20', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20', gray: 'bg-slate-100 text-slate-600 ring-slate-500/20', violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
export const Badge = ({ color = 'gray', children, className }: { color?: keyof typeof BADGE | string; children: ReactNode; className?: string }) =>
  <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE[color] ?? BADGE.gray, className)}>{children}</span>;

export const STATUS_COLOR: Record<string, string> = {
  draft: 'gray', scheduled: 'blue', open: 'green', published: 'green', closed: 'red', ended: 'amber', enroll_closed: 'amber', archived: 'gray',
  completed: 'green', in_progress: 'blue', not_started: 'gray', pending_review: 'violet', failed: 'red', valid: 'green', revoked: 'red',
};

export function StatCard({ label, value, icon, tone = 'nova', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: string; hint?: string }) {
  const tones: Record<string, string> = { nova: 'bg-nova-50 text-nova-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600', rose: 'bg-rose-50 text-rose-600', slate: 'bg-slate-100 text-slate-600' };
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="truncate text-sm text-slate-500">{label}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
      </div>
    </Card>
  );
}

export function Progress({ value, className, tone = 'bg-nova-500' }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ----------------------------------------------------------------- modal
export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="إغلاق"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ forms
export const Field = ({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) => (
  <label className={cx('block', className)}>
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
);
const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-nova-500 focus:outline-none focus:ring-2 focus:ring-nova-200 disabled:bg-slate-50';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} {...p} className={cx(inputCls, p.className)} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'pe-8', p.className)}>{children}</select>;
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-nova-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
      </button>
    </label>
  );
}
/** Date + time picker in Riyadh time, value is an ISO string (or null). */
export function DateTimeField({ label, value, onChange, hint }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; hint?: string }) {
  const p = toRiyadhParts(value);
  return (
    <Field label={label} hint={hint ?? 'بتوقيت الرياض'}>
      <div className="flex gap-2">
        <Input type="date" value={p.date} onChange={(e) => onChange(fromRiyadhParts(e.target.value, p.time || '08:00'))} />
        <Input type="time" value={p.time} className="w-32" disabled={!p.date} onChange={(e) => onChange(fromRiyadhParts(p.date, e.target.value))} />
        {value && <button type="button" className="px-2 text-slate-400 hover:text-rose-600" onClick={() => onChange(null)} aria-label="مسح"><X size={16} /></button>}
      </div>
    </Field>
  );
}

// ----------------------------------------------------------------- misc
export const Spinner = ({ label = 'جارٍ التحميل…' }: { label?: string }) =>
  <div className="flex items-center justify-center gap-2 py-12 text-slate-400"><Loader2 className="animate-spin" size={20} />{label}</div>;
export const ErrorBox = ({ error, onRetry }: { error: string; onRetry?: () => void }) => (
  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
    {error} {onRetry && <button className="ms-2 font-semibold underline" onClick={onRetry}>إعادة المحاولة</button>}
  </div>
);
export const Empty = ({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    {icon && <div className="text-slate-300">{icon}</div>}
    <div className="font-semibold text-slate-700">{title}</div>
    {text && <div className="max-w-sm text-sm text-slate-500">{text}</div>}
    {action}
  </div>
);
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition', value === t.id ? 'bg-white text-nova-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
          {t.label}{t.count ? <span className="ms-1.5 rounded-full bg-rose-500 px-1.5 text-xs text-white">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-start text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:whitespace-nowrap [&_th]:bg-slate-50 [&_th]:px-4 [&_th]:py-3 [&_th]:text-start [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-500 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100 [&_tbody_tr:hover]:bg-slate-50/60">{children}</table></div>
);
