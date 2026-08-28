// Fast batch worker: reuses a single headless runtime across all matches.
// Much faster than batch_worker.mjs which creates a new VM per match.
import fs from 'node:fs';
import {createS7HeadlessRuntime} from './headless_runtime.mjs';

const [,, seedStart, count, outPath, overridesJson, maxSecondsArg] = process.argv;
const overrides = overridesJson ? JSON.parse(fs.readFileSync(overridesJson, 'utf8')) : null;
const maxSeconds = Number(maxSecondsArg) || 900;
const start = Number(seedStart), n = Number(count);

const rt = createS7HeadlessRuntime();
const battle = rt.S7VersusBattle;
const DT = rt.FIXED_FRAME_DT;

if (overrides) battle.overrideCards(overrides);

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

function runOne(seed, pd, zd){
  if (typeof rt.s7SetBattleSeed === 'function') rt.s7SetBattleSeed(seed >>> 0 || 1);
  battle.start({mode:'practice', humanSide:null, plantCards:pd, zombieCards:zd, online:false, isHost:true});
  const st = rt.getState();
  let lastDecide = {plant: -1e9, zombie: -1e9};
  let acc = 0;
  const maxFrames = Math.ceil((maxSeconds + 30) / DT);
  for (let f = 0; f < maxFrames; f++){
    rt.update(DT); acc += DT;
    if (acc >= 0.2 - 1e-9){ battle.tick(acc); acc = 0; }
    const t = st.time;
    for (const side of ['plant','zombie']){
      if (t - lastDecide[side] >= 1.0){ lastDecide[side] = t; rt.S7VersusAI.decide(side, battle); }
    }
    if (!st.running) break;
  }
  const ledger = battle.getLedger();
  const st2 = rt.getState();
  const result2 = battle.state.versus?.result || null;
  const rows = ledger.deployments.map(d => ({side: d.side, cardId: d.cardId, paid: d.paidCost, res: Math.round((d.resolvedPaidValueDirect + d.resolvedPaidValueDamageEquivalent) * 10) / 10, obj: Math.round(d.objectiveTargetDamage), outcome: d.outcome, t: Math.round(d.startTime)}));
  return {seed, winner: result2?.winner || 'none', reason: result2?.reason || '', time: Math.round(st2.time), plantDeck: pd, zombieDeck: zd, deps: rows, mower: ledger.mowerClearedPaidValue, house: ledger.housePressurePaidValue};
}

const out = fs.openSync(outPath, 'w');
for (let i = 0; i < n; i++){
  const seed = start + i;
  const pd = PLANT_DECKS[seed % PLANT_DECKS.length];
  const zd = ZOMBIE_DECKS[(seed >>> 2) % ZOMBIE_DECKS.length];
  const m = runOne(seed, pd, zd);
  fs.writeSync(out, JSON.stringify(m) + '\n');
}
fs.closeSync(out);
