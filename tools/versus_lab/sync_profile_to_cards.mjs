// Sync 22_versus_feature_profiles.js draft/UI cost + cooldown tables to the
// authoritative 99 CARDS (runtime owner). Keeps 22 a faithful mirror for the
// BP/draft UI and balance telemetry so displayed costs/cooldowns match gameplay.
// Only updates cards that exist in 99 CARDS (Versus set); leaves adventure-only
// cards in 22 untouched.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createS7HeadlessRuntime} from './headless_runtime.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const P22 = path.join(ROOT, 'src/js/22_versus_feature_profiles.js');

const rt = createS7HeadlessRuntime();
const CARDS = rt.S7VersusBattle.CARDS;
let t = fs.readFileSync(P22, 'utf8');
const changes = [];

for (const side of ['plant', 'zombie']){
  for (const [id, c] of Object.entries(CARDS[side])){
    const cost = Math.round(c.cost);
    const cd = c.cd;
    if (side === 'plant'){
      // PLANT_RESOURCE_COSTS = Object.freeze({ id:COST, ... })
      const reCost = new RegExp('(\\b' + id + ':)(\\d+)(\\b)');
      if (reCost.test(t)){
        t = t.replace(reCost, (m, a, old, b) => {
          if (Number(old) !== cost){ changes.push(`22.PLANT_RESOURCE_COSTS.${id}: ${old}->${cost}`); return a + cost + b; }
          return m;
        });
      }
      // PLANT_COOLDOWNS = { id: [cd, opening, "group"], ... }
      const reCd = new RegExp('(\\b' + id + ':\\s*\\[)(\\d+\\.?\\d*)');
      if (reCd.test(t)){
        t = t.replace(reCd, (m, a, old) => {
          if (Number(old) !== cd){ changes.push(`22.PLANT_COOLDOWNS.${id} cd: ${old}->${cd}`); return a + cd; }
          return m;
        });
      }
    } else {
      const reCost = new RegExp('(\\b' + id + ':)(\\d+)(\\b)');
      if (reCost.test(t)){
        t = t.replace(reCost, (m, a, old, b) => {
          if (Number(old) !== cost){ changes.push(`22.ZOMBIE_RESOURCE_COSTS.${id}: ${old}->${cost}`); return a + cost + b; }
          return m;
        });
      }
      const reCd = new RegExp('(\\b' + id + ':\\s*\\[)(\\d+\\.?\\d*)');
      if (reCd.test(t)){
        t = t.replace(reCd, (m, a, old) => {
          if (Number(old) !== cd){ changes.push(`22.zombieOverrides.${id} cd: ${old}->${cd}`); return a + cd; }
          return m;
        });
      }
    }
  }
}
fs.writeFileSync(P22, t);
for (const c of changes) console.log('SYNC', c);
console.log(`SYNC_DONE ${changes.length} changes`);
