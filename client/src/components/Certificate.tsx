import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import { Logo } from './Art';
import { Button, useToast } from '../lib/ui';
import { fmtDate } from '../lib/format';

export interface Cert {
  id: string; serial: string; kind: 'stage' | 'journey' | 'course'; title: string; student_name: string; instructor_name?: string | null;
  hours?: number | null; score_pct?: number | null; issued_at: string; status: 'valid' | 'revoked'; verifyUrl: string; revoke_reason?: string | null;
}
export const CERT_KIND: Record<string, string> = { stage: 'شهادة إتمام مرحلة', journey: 'شهادة سفيرة الوعي الرقمي', course: 'شهادة إتمام دورة تدريبية' };

function grade(p?: number | null) {
  if (p === null || p === undefined) return null;
  return p >= 90 ? 'ممتاز' : p >= 80 ? 'جيد جدًا' : p >= 70 ? 'جيد' : 'مقبول';
}

/** A4 landscape certificate (1123×794 px at 96dpi). */
export function CertificateSheet({ c }: { c: Cert }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(c.verifyUrl, { margin: 0, width: 220, color: { dark: '#1e1b4b' } }).then(setQr); }, [c.verifyUrl]);
  const body =
    c.kind === 'stage' ? <>تشهد منصة شفرة الوعي الرقمي بأن الطالبة <b className="text-nova-800">{c.student_name}</b> قد أتمت بنجاح مرحلة <b className="text-nova-800">«{c.title}»</b> ضمن رحلة الوعي الرقمي، وأظهرت إلمامًا بالمهارات والمعارف المستهدفة لهذه المرحلة.</>
    : c.kind === 'journey' ? <>تشهد منصة شفرة الوعي الرقمي بأن الطالبة <b className="text-nova-800">{c.student_name}</b> قد أتمت بنجاح جميع العوالم السبعة في رحلة الوعي الرقمي، وتستحق لقب <b className="text-nova-800">«سفيرة الوعي الرقمي»</b> تقديرًا لوعيها ومسؤوليتها في العالم الرقمي.</>
    : <>تشهد منصة شفرة الوعي الرقمي بأن الطالبة <b className="text-nova-800">{c.student_name}</b> قد أتمت بنجاح الدورة التدريبية بعنوان <b className="text-nova-800">«{c.title}»</b>، بواقع <b>{c.hours}</b> ساعات تدريبية، بعد استيفاء متطلبات الإنجاز والاجتياز.</>;
  const g = c.kind !== 'journey' ? grade(c.score_pct) : null;
  return (
    <div className="relative h-[794px] w-[1123px] overflow-hidden bg-white font-sans text-slate-800" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#ede9fe_0,transparent_40%),radial-gradient(circle_at_85%_80%,#cffafe_0,transparent_40%)]" />
      <div className="absolute inset-6 rounded-[28px] border-[3px] border-nova-700" />
      <div className="absolute inset-9 rounded-[22px] border border-cyan-500/60" />
      <svg className="absolute -left-10 -top-10 opacity-20" width="260" height="260" viewBox="0 0 64 64"><path d="M32 4 56 18v28L32 60 8 46V18z" fill="none" stroke="#7444ff" strokeWidth="1.5" /></svg>
      <svg className="absolute -bottom-12 -right-12 opacity-20" width="300" height="300" viewBox="0 0 64 64"><path d="M32 4 56 18v28L32 60 8 46V18z" fill="none" stroke="#06b6d4" strokeWidth="1.5" /></svg>
      <div className="relative flex h-full flex-col items-center px-24 pt-16 text-center">
        <Logo size={64} />
        <div className="mt-8 text-[44px] font-bold tracking-tight text-nova-900">{CERT_KIND[c.kind]}</div>
        <div className="mt-1 text-base text-slate-500">{c.kind === 'course' ? 'الدورات التدريبية' : 'رحلة الوعي الرقمي — مدينة نوفا الرقمية'}</div>
        <div className="mx-auto mt-6 h-1 w-40 rounded-full bg-gradient-to-l from-cyan-400 to-nova-600" />
        <p className="mt-10 max-w-[820px] text-[23px] leading-[2.1]">{body}</p>
        <div className="mt-auto mb-16 grid w-full grid-cols-3 items-end text-sm">
          <div className="text-start">
            <div className="text-slate-500">تاريخ الإتمام</div>
            <div className="text-lg font-semibold">{fmtDate(c.issued_at)}</div>
            {g && <><div className="mt-2 text-slate-500">التقدير</div><div className="text-lg font-semibold">{g} ({Math.round(c.score_pct!)}%)</div></>}
            {c.kind === 'course' && c.instructor_name && <><div className="mt-2 text-slate-500">المدربة</div><div className="text-lg font-semibold">{c.instructor_name}</div></>}
          </div>
          <div className="flex flex-col items-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-xs font-bold text-amber-950 shadow-lg ring-4 ring-amber-200">
              تعلمي<br />اكتشفي<br />أنجزي
            </div>
          </div>
          <div className="flex flex-col items-end">
            {qr && <img src={qr} alt="رمز التحقق" className="h-24 w-24" />}
            <div className="mt-2 text-xs text-slate-500">رقم الشهادة</div>
            <div className="font-mono text-sm font-semibold" dir="ltr">{c.serial}</div>
          </div>
        </div>
      </div>
      {c.status === 'revoked' && (
        <div className="absolute inset-0 grid place-items-center"><div className="-rotate-12 rounded-2xl border-8 border-rose-600 px-10 py-4 text-7xl font-black text-rose-600/80">ملغاة</div></div>
      )}
    </div>
  );
}

/** Responsive preview + real PDF download (rendered client-side so Arabic shaping is exact). */
export function CertificateViewer({ c }: { c: Cert }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const f = () => wrap.current && setScale(Math.min(1, wrap.current.clientWidth / 1123));
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  async function pdf() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const img = await toJpeg(ref.current, { pixelRatio: 2, quality: 0.9, backgroundColor: '#ffffff', cacheBust: true, width: 1123, height: 794, style: { transform: 'none' } });
      const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794], hotfixes: ['px_scaling'] });
      doc.addImage(img, 'JPEG', 0, 0, 1123, 794);
      doc.setProperties({ title: `${CERT_KIND[c.kind]} — ${c.title}`, subject: c.serial });
      doc.save(`شهادة-${c.serial}.pdf`);
    } catch { toast('err', 'تعذّر إنشاء ملف PDF'); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button onClick={pdf} loading={busy} icon={<Download size={16} />} disabled={c.status === 'revoked'}>تحميل PDF</Button>
        <Button variant="secondary" onClick={() => window.print()} icon={<Printer size={16} />}>طباعة</Button>
        <a href={c.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl px-3 text-sm font-semibold text-nova-600 hover:underline">صفحة التحقق</a>
      </div>
      <div ref={wrap} className="w-full print:!h-auto" style={{ height: 794 * scale }}>
        <div className="origin-top-right shadow-2xl print:shadow-none" style={{ transform: `scale(${scale})`, width: 1123 }}>
          <div ref={ref} className="cert-print"><CertificateSheet c={c} /></div>
        </div>
      </div>
    </div>
  );
}
