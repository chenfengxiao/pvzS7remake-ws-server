// Batch match worker: runs matches for a seed range, emits JSONL (one line per match).
// Usage: node batch_worker.mjs <seedStart> <count> <outPath> [overridesJson]
import fs from 'node:fs';
import {runMatch} from './match_runner.mjs';

const [,, seedStart, count, outPath, overridesJson, maxSecondsArg] = process.argv;
const overrides = overridesJson ? JSON.parse(fs.readFileSync(overridesJson, 'utf8')) : null;
const start = Number(seedStart), n = Number(count);

// Deck diversity: deterministic archetype pairing by seed.
const PLANT_DECKS = [
  ['repeater','wallnut','gatling','cherrybomb','hypno'],
  ['fume','snowpea','melon','jalapeno','spikerock'],
  ['repeater','wallnut','cattail','doomshroom','tallnut'],
  ['starfruit','fume','winter','cherrybomb','wallnut'],
  ['gatling','snowpea','squash','jalapeno','spikerock'],
  ['repeater','melon','kernel','cherrybomb','wallnut']
];
const ZOMBIE_DECKS = [
  ['normal','cone','bucket','football','garg'],
  ['normal','digger','dancer','bucket','giga'],
  ['cone','balloon','pole','football','zomboni'],
  ['normal','bucket','pogo','newspaper','garg'],
  ['cone','dolphin','jack','screen','giga'],
  ['normal','digger','pole','bucket','bobsledSled']
];

const out = fs.openSync(outPath, 'w');
for (let i = 0; i < n; i++){
  const seed = start + i;
  const pd = PLANT_DECKS[seed % PLANT_DECKS.length];
  const zd = ZOMBIE_DECKS[(seed >>> 2) % ZOMBIE_DECKS.length];
  const m = runMatch({seed, plantCards: pd, zombieCards: zd, overrides, maxSeconds: Number(maxSecondsArg) || 2500, policyPatch: overrides?.__policy});
  const rows = m.ledger.deployments.map(d => ({side: d.side, cardId: d.cardId, paid: d.paidCost, res: Math.round((d.resolvedPaidValueDirect + d.resolvedPaidValueDamageEquivalent) * 10) / 10, obj: Math.round(d.objectiveTargetDamage), outcome: d.outcome, t: Math.round(d.startTime)}));
  fs.writeSync(out, JSON.stringify({seed, winner: m.result?.winner || 'none', reason: m.result?.reason || '', time: Math.round(m.time), plantDeck: pd, zombieDeck: zd, deps: rows, mower: m.ledger.mowerClearedPaidValue, house: m.ledger.housePressurePaidValue}) + '\n');
}
fs.closeSync(out);
