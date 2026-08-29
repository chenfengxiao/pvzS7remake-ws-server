// Write the approved balance candidate into the authoritative 99 CARDS literal.
// Usage: node tools/versus_lab/apply_overrides_to_cards.mjs [overridesJson]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const P99 = path.join(ROOT, 'src/js/99_versus_battle_controller.js');
const overridesFile = process.argv[2] || path.join(ROOT, 'dist/versus_lab/balance/candidate_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));

let t = fs.readFileSync(P99, 'utf8');
const changes = [];
for (const side of ['plant', 'zombie']){
  for (const [id, o] of Object.entries(overrides[side] || {})){
    if (o.cost === undefined && o.cd === undefined) continue;
    // match: "id":{"cost":X,"cd":Y   (inside the CARDS literal)
    const re = new RegExp('("' + id + '":\\{"cost":)(\\d+)(,"cd":)(\\d+\\.?\\d*)');
    const m = re.exec(t);
    if (!m){ changes.push(`MISS ${side}.${id}`); continue; }
    const newCost = String(o.cost);
    const newCd = String(o.cd);
    if (m[2] !== newCost || m[4] !== newCd){
      t = t.replace(re, (mm, a, oldCost, b, oldCd) => a + newCost + b + newCd);
      changes.push(`99.CARDS.${side}.${id}: cost ${m[2]}->${newCost}, cd ${m[4]}->${newCd}`);
    }
  }
}
fs.writeFileSync(P99, t);
for (const c of changes) console.log('APPLY', c);
console.log(`APPLY_DONE ${changes.length} changes`);
