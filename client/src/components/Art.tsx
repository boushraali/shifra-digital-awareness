/* Original vector artwork for the platform (logo, «نور» the assistant, Nova city, learning scene). */
import { Fish, Castle, Users, FlaskConical, Shield, Hourglass, Search, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

export function Logo({ size = 40, withText = true, light = false }: { size?: number; withText?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#7444ff" /></linearGradient></defs>
        <path d="M32 4 56 18v28L32 60 8 46V18z" fill="url(#lg)" />
        <path d="M24 24l-6 8 6 8M40 24l6 8-6 8M35 20l-6 24" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && (
        <div className="leading-tight">
          <div className={`text-lg font-bold ${light ? 'text-white' : 'text-slate-900'}`}>شفرة الوعي الرقمي</div>
          <div className={`text-[10px] font-medium tracking-wider ${light ? 'text-cyan-200/80' : 'text-slate-400'}`} dir="ltr">DIGITAL AWARENESS QUEST</div>
        </div>
      )}
    </div>
  );
}

/** «نور» — a friendly floating light-bot. mood changes the eyes. */
export function Noor({ size = 120, mood = 'happy', className = '' }: { size?: number; mood?: 'happy' | 'think' | 'wow' | 'sad'; className?: string }) {
  const eyes = {
    happy: <><path d="M44 58q5-6 10 0" /><path d="M66 58q5-6 10 0" /></>,
    think: <><circle cx="49" cy="57" r="4" fill="#fff" stroke="none" /><path d="M66 57h10" /></>,
    wow: <><circle cx="49" cy="56" r="5" fill="#fff" stroke="none" /><circle cx="71" cy="56" r="5" fill="#fff" stroke="none" /></>,
    sad: <><path d="M44 56q5 5 10 0" /><path d="M66 56q5 5 10 0" /></>,
  }[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label="نور المساعدة الافتراضية">
      <defs>
        <radialGradient id="nb" cx="40%" cy="30%"><stop offset="0" stopColor="#c4b5fd" /><stop offset=".6" stopColor="#7444ff" /><stop offset="1" stopColor="#4614b8" /></radialGradient>
        <linearGradient id="nv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0e7490" /><stop offset="1" stopColor="#1e1b4b" /></linearGradient>
        <filter id="ng"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <ellipse cx="60" cy="112" rx="26" ry="4" fill="#000" opacity=".25" />
      <circle cx="60" cy="16" r="7" fill="#fde047" filter="url(#ng)" opacity=".8" />
      <path d="M57 11a7 7 0 1 0 8 9 5.5 5.5 0 1 1-8-9z" fill="#fde047" />
      <path d="M60 24v10" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
      <rect x="22" y="32" width="76" height="62" rx="30" fill="url(#nb)" />
      <rect x="32" y="44" width="56" height="30" rx="15" fill="url(#nv)" />
      <g stroke="#67e8f9" strokeWidth="4" fill="none" strokeLinecap="round">{eyes}</g>
      <path d="M52 84q8 5 16 0" stroke="#e9d5ff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="70" r="4" fill="#f9a8d4" opacity=".7" /><circle cx="90" cy="70" r="4" fill="#f9a8d4" opacity=".7" />
      <path d="M22 64q-10 4-8 14" stroke="#7444ff" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M98 64q10 4 8 14" stroke="#7444ff" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function NovaCity({ className = '' }: { className?: string }) {
  const bld = [[10, 70, 22], [36, 45, 18], [58, 80, 26], [88, 55, 16], [208, 60, 20], [232, 85, 24], [260, 50, 18], [282, 72, 24]];
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e1b4b" /><stop offset="1" stopColor="#4c1d95" /></linearGradient>
        <linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#312e81" /><stop offset="1" stopColor="#1e1b4b" /></linearGradient>
        <radialGradient id="portal"><stop offset="0" stopColor="#67e8f9" /><stop offset=".55" stopColor="#7444ff" stopOpacity=".7" /><stop offset="1" stopColor="#7444ff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#sky)" />
      {Array.from({ length: 26 }).map((_, i) => <circle key={i} cx={(i * 47) % 320} cy={(i * 23) % 70} r={i % 3 ? 0.8 : 1.4} fill="#fff" opacity=".7" />)}
      <circle cx="160" cy="92" r="58" fill="url(#portal)" />
      <ellipse cx="160" cy="96" rx="30" ry="40" fill="none" stroke="#a5f3fc" strokeWidth="3" />
      <ellipse cx="160" cy="96" rx="22" ry="31" fill="#0e7490" opacity=".35" />
      {bld.map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={180 - h} width={w} height={h} fill="url(#bd)" />
          {Array.from({ length: Math.floor(h / 12) }).map((_, r) => <rect key={r} x={x + 4} y={180 - h + 6 + r * 12} width={w - 8} height="3" rx="1" fill={r % 2 ? '#22d3ee' : '#a78bfa'} opacity=".55" />)}
        </g>
      ))}
      {[[118, 40], [202, 34], [72, 28], [250, 26]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}><rect width="16" height="10" rx="5" fill="none" stroke="#f0abfc" strokeWidth="1.5" /><circle cx="8" cy="5" r="2" fill="#f0abfc" /></g>
      ))}
      <rect y="168" width="320" height="12" fill="#0b0a1f" />
      <path d="M0 168h320" stroke="#22d3ee" strokeWidth="1.5" opacity=".6" />
    </svg>
  );
}

export function LearningScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="ls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0c4a6e" /><stop offset="1" stopColor="#134e4a" /></linearGradient>
        <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#7444ff" /></linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#ls)" />
      {Array.from({ length: 14 }).map((_, i) => <circle key={i} cx={(i * 61) % 320} cy={(i * 29) % 90} r="1" fill="#fff" opacity=".5" />)}
      <rect x="98" y="46" width="124" height="80" rx="8" fill="#0f172a" stroke="#67e8f9" strokeWidth="2" />
      <rect x="106" y="54" width="108" height="64" rx="4" fill="url(#scr)" opacity=".85" />
      <polygon points="152,74 152,98 172,86" fill="#fff" />
      <rect x="84" y="126" width="152" height="8" rx="4" fill="#94a3b8" />
      <g transform="translate(30 92)">
        <rect width="46" height="10" rx="2" fill="#f472b6" /><rect y="10" width="52" height="10" rx="2" fill="#a78bfa" /><rect x="-2" y="20" width="56" height="12" rx="2" fill="#fbbf24" />
      </g>
      <g transform="translate(240 70) rotate(-8)">
        <rect width="58" height="42" rx="4" fill="#fff" /><rect x="6" y="8" width="46" height="4" rx="2" fill="#7444ff" /><rect x="10" y="16" width="38" height="3" rx="1.5" fill="#cbd5e1" />
        <rect x="10" y="22" width="30" height="3" rx="1.5" fill="#cbd5e1" /><circle cx="46" cy="32" r="7" fill="#fbbf24" /><path d="M42 38l-2 8 6-3 6 3-2-8" fill="#f59e0b" />
      </g>
      <g transform="translate(246 136)"><rect width="26" height="40" rx="5" fill="#0f172a" stroke="#a5f3fc" strokeWidth="1.5" /><rect x="4" y="5" width="18" height="26" rx="2" fill="#22d3ee" opacity=".6" /></g>
      <path d="M150 30l10-6 10 6-10 6z" fill="#fde047" /><path d="M154 33v5q6 4 12 0v-5" fill="#fde047" />
    </svg>
  );
}

export const WORLD_ICON: Record<string, ComponentType<LucideProps>> = { fish: Fish, castle: Castle, users: Users, flask: FlaskConical, shield: Shield, hourglass: Hourglass, search: Search };
export const WorldIcon = ({ name, ...p }: { name: string } & LucideProps) => { const I = WORLD_ICON[name] ?? Shield; return <I {...p} />; };
