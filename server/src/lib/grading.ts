import { z } from 'zod';

const opt = z.object({ id: z.string().min(1).max(20), text: z.string().trim().min(1).max(500) });

/** Validates a question coming from the teacher and checks the answer key is consistent with the options. */
export const questionSchema = z.object({
  qtype: z.enum(['mcq', 'tf', 'multi', 'match', 'order', 'short']),
  text: z.string().trim().min(3).max(2000),
  points: z.number().positive().max(100).default(1),
  explanation: z.string().max(2000).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  module_id: z.string().uuid().nullable().optional(),
  options: z.any(),
  answer: z.any(),
}).superRefine((v, ctx) => {
  const fail = (m: string) => ctx.addIssue({ code: 'custom', message: m, path: ['answer'] });
  try {
    switch (v.qtype) {
      case 'mcq': {
        const o = z.array(opt).min(2).max(8).parse(v.options);
        const a = z.object({ correct: z.string() }).parse(v.answer);
        if (!o.some((x) => x.id === a.correct)) fail('حددي الإجابة الصحيحة');
        break;
      }
      case 'multi': {
        const o = z.array(opt).min(2).max(10).parse(v.options);
        const a = z.object({ correct: z.array(z.string()).min(1) }).parse(v.answer);
        if (!a.correct.every((c) => o.some((x) => x.id === c))) fail('الإجابات الصحيحة غير متطابقة مع الخيارات');
        break;
      }
      case 'tf': z.object({ correct: z.boolean() }).parse(v.answer); break;
      case 'match': {
        const o = z.object({ left: z.array(opt).min(2).max(10), right: z.array(opt).min(2).max(10) }).parse(v.options);
        const a = z.object({ pairs: z.record(z.string(), z.string()) }).parse(v.answer);
        if (!o.left.every((l) => o.right.some((r) => r.id === a.pairs[l.id]))) fail('أكملي المطابقة لكل عنصر');
        break;
      }
      case 'order': {
        const o = z.array(opt).min(2).max(10).parse(v.options);
        const a = z.object({ order: z.array(z.string()) }).parse(v.answer);
        if (a.order.length !== o.length || !o.every((x) => a.order.includes(x.id))) fail('الترتيب الصحيح غير مكتمل');
        break;
      }
      case 'short': z.object({ accepted: z.array(z.string().trim()).default([]) }).parse(v.answer ?? {}); break;
    }
  } catch (e: any) {
    fail(e?.issues?.[0]?.message ?? 'صيغة السؤال غير صحيحة');
  }
});

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** The version of a question that can be sent to a student (no answer key). */
export function publicQuestion(q: any) {
  const base = { id: q.id, qtype: q.qtype, text: q.text, points: q.points };
  switch (q.qtype) {
    case 'mcq': case 'multi': return { ...base, options: q.options };
    case 'tf': return { ...base, options: [{ id: 'true', text: 'صح' }, { id: 'false', text: 'خطأ' }] };
    case 'match': return { ...base, options: { left: q.options.left, right: shuffle(q.options.right) } };
    case 'order': return { ...base, options: shuffle(q.options) };
    default: return { ...base, options: [] };
  }
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();

/** Returns points earned, or null when the answer needs manual grading. */
export function grade(q: any, response: any): { points: number | null; correct: boolean | null } {
  const P = Number(q.points);
  if (response === undefined || response === null) return { points: q.qtype === 'short' ? 0 : 0, correct: false };
  switch (q.qtype) {
    case 'mcq': { const ok = response === q.answer.correct; return { points: ok ? P : 0, correct: ok }; }
    case 'tf': { const ok = (response === true || response === 'true') === q.answer.correct; return { points: ok ? P : 0, correct: ok }; }
    case 'multi': {
      const sel = new Set<string>(Array.isArray(response) ? response : []);
      const cor = new Set<string>(q.answer.correct);
      const ok = sel.size === cor.size && [...cor].every((c) => sel.has(c));
      return { points: ok ? P : 0, correct: ok };
    }
    case 'match': {
      const pairs = q.answer.pairs as Record<string, string>;
      const keys = Object.keys(pairs);
      const right = keys.filter((k) => response?.[k] === pairs[k]).length;
      return { points: Math.round((right / keys.length) * P * 100) / 100, correct: right === keys.length };
    }
    case 'order': {
      const order = q.answer.order as string[];
      const r = Array.isArray(response) ? response : [];
      const right = order.filter((id, i) => r[i] === id).length;
      return { points: Math.round((right / order.length) * P * 100) / 100, correct: right === order.length };
    }
    case 'short': {
      const txt = typeof response === 'string' ? response : '';
      if (!txt.trim()) return { points: 0, correct: false };
      const acc: string[] = q.answer?.accepted ?? [];
      if (acc.some((a) => norm(a) === norm(txt))) return { points: P, correct: true };
      return { points: null, correct: null }; // manual review
    }
  }
  return { points: 0, correct: false };
}
