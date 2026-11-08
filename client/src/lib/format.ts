/** All dates are shown and entered in Asia/Riyadh (UTC+3, no DST); the server stores UTC. */
export const TZ = 'Asia/Riyadh';
const LOCALE = 'ar-SA-u-ca-gregory-nu-latn';

export function fmtDate(v?: string | Date | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(v));
}
export function fmtDateTime(v?: string | Date | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v));
}
export function fmtShort(v?: string | Date | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(v));
}
/** ISO → value for <input type="date"> and <input type="time"> in Riyadh time. */
export function toRiyadhParts(v?: string | null): { date: string; time: string } {
  if (!v) return { date: '', time: '' };
  const d = new Date(new Date(v).getTime() + 3 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
/** Riyadh date + time → ISO string with +03:00 offset (or null). */
export function fromRiyadhParts(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || '00:00'}:00+03:00`;
}
export function relTime(v: string) {
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'الآن';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}
export const levelLabel = (l?: string | null) => (l === 'intermediate' ? 'المتوسطة' : l === 'secondary' ? 'الثانوية' : 'الكل');
export const gradeLabel = (g?: number | null) => (g ? ['الأول', 'الثاني', 'الثالث'][g - 1] : '—');
export const classLabel = (s: { level?: string; grade?: number; section?: string }) =>
  `${gradeLabel(s.grade)} ${levelLabel(s.level)} — ${s.section ?? ''}`;
export const pct = (v?: number | null) => (v === null || v === undefined ? '—' : `${Math.round(v * 10) / 10}%`);
