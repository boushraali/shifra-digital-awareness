/** Applies the schema and (re)loads the seven journey worlds. Safe to run repeatedly. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './lib/core.js';
import { WORLDS, STEP_MAX } from './content/worlds.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);

  await tx(async (c) => {
    for (const w of WORLDS) {
      await c.query(
        `INSERT INTO stages(id, slug, title, topic, summary, color, icon, badge_name, key_name, intro)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, title=EXCLUDED.title, topic=EXCLUDED.topic, summary=EXCLUDED.summary,
           color=EXCLUDED.color, icon=EXCLUDED.icon, badge_name=EXCLUDED.badge_name, key_name=EXCLUDED.key_name, intro=EXCLUDED.intro`,
        [w.id, w.slug, w.title, w.topic, w.summary, w.color, w.icon, w.badge, w.keyName, JSON.stringify(w.intro)]);
      await c.query('INSERT INTO stage_schedules(stage_id) VALUES ($1) ON CONFLICT DO NOTHING', [w.id]);

      for (const [i, s] of w.steps.entries()) {
        const pos = i + 1;
        let content: any; let key: any = null;
        if (s.kind === 'scenario') content = { scene: s.scene, setting: s.setting, dialogue: s.dialogue, prompt: s.prompt };
        else if (s.kind === 'quiz') { content = { question: s.question }; key = { explanation: s.explanation }; }
        else if (s.game === 'classify') {
          content = { game: 'classify', instructions: s.instructions, bins: s.bins, items: s.items.map(({ id, text }) => ({ id, text })) };
          key = { map: Object.fromEntries(s.items.map((it) => [it.id, it.bin])) };
        } else if (s.game === 'spot') {
          content = { game: 'spot', instructions: s.instructions, artifact: s.artifact, lines: s.lines.map(({ id, text }) => ({ id, text })) };
          key = { flags: s.lines.filter((l) => l.flag).map((l) => l.id), why: Object.fromEntries(s.lines.filter((l) => l.why).map((l) => [l.id, l.why])) };
        } else {
          content = { game: 'order', instructions: s.instructions, steps: s.steps.map(({ id, text }) => ({ id, text })) };
          key = { order: s.steps.map((x) => x.id) };
        }
        const { rows: [sc] } = await c.query(
          `INSERT INTO scenarios(stage_id, position, kind, title, content, answer_key, max_points)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (stage_id, position) DO UPDATE SET kind=EXCLUDED.kind, title=EXCLUDED.title, content=EXCLUDED.content,
             answer_key=EXCLUDED.answer_key, max_points=EXCLUDED.max_points
           RETURNING id`,
          [w.id, pos, s.kind, s.title, JSON.stringify(content), key && JSON.stringify(key), STEP_MAX]);

        const choices =
          s.kind === 'scenario' ? s.choices.map((ch) => ({ label: ch.label, outcome: ch.outcome, points: ch.points, followup: ch.followup ?? null }))
          : s.kind === 'quiz' ? s.options.map((o) => ({ label: o.label, outcome: '', points: o.correct ? STEP_MAX : 0, followup: null }))
          : [];
        const best = Math.max(...choices.map((x) => x.points), 0);
        for (const [j, ch] of choices.entries()) {
          await c.query(
            `INSERT INTO scenario_choices(scenario_id, position, label, outcome, points, is_best, followup)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (scenario_id, position) DO UPDATE SET label=EXCLUDED.label, outcome=EXCLUDED.outcome,
               points=EXCLUDED.points, is_best=EXCLUDED.is_best, followup=EXCLUDED.followup`,
            [sc.id, j + 1, ch.label, ch.outcome, ch.points, ch.points === best, ch.followup && JSON.stringify(ch.followup)]);
        }
        await c.query('DELETE FROM scenario_choices WHERE scenario_id=$1 AND position>$2 AND id NOT IN (SELECT choice_id FROM stage_responses WHERE choice_id IS NOT NULL)', [sc.id, choices.length]);
      }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => { console.log('✓ schema applied & 7 worlds loaded'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
