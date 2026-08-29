// Deterministic policy training: seeded mutation + league evaluation.
// Search-side RNG is allowed (training only); in-game decisions stay deterministic.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMatch} from './match_runner.mjs';
import {makeLegacyDecide} from './legacy_ai.mjs';

function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// baseline policy snapshot (from current src)
function basePolicy(){
  const rt = createRuntime();
  return JSON.parse(JSON.stringify(rt.S7VersusAI.POLICY));
}
import {createS7HeadlessRuntime as createRuntime} from './headless_runtime.mjs';

function mutate(policy, rng, scale){
  const out = JSON.parse(JSON.stringify(policy));
  for (const side of ['plant','zombie']){
    for (const k of Object.keys(out[side])){
      if (rng() < 0.35){
        const v = out[side][k];
        if (Number.isInteger(v)) out[side][k] = Math.max(1, Math.round(v * (1 + (rng()-0.5)*2*scale)));
        else out[side][k] = Math.max(0.05, Math.round(v * (1 + (rng()-0.5)*2*scale) * 100) / 100);
      }
    }
  }
  return out;
}

// fitness: both directions vs a mixed league of opponents
function evaluate(policyPatch, seeds, opponents){
  let wins = 0, total = 0, resolvedRatioSum = 0, ashWaste = 0, ashUses = 0, timeSum = 0;
  for (const seed of seeds){
    for (const opp of opponents){
      const mA = runMatch({seed, policyPatch, zombieAI: opp.zombieAI || null, plantCards: opp.plantCards, zombieCards: opp.zombieCards});
      const mB = runMatch({seed: seed + 3, policyPatch, plantAI: opp.plantAI || null, plantCards: opp.plantCards, zombieCards: opp.zombieCards});
      for (const [m, side] of [[mA, 'plant'], [mB, 'zombie']]){
        total++;
        if (m.result?.winner === side) wins++;
        timeSum += m.time;
        const deps = m.ledger.deployments.filter(d => d.side === side);
        const spent = deps.reduce((s, d) => s + d.paidCost, 0);
        const got = deps.reduce((s, d) => s + d.resolvedPaidValueDamageEquivalent, 0);
        if (spent > 0) resolvedRatioSum += got / spent;
        const ash = deps.filter(d => ['cherrybomb','jalapeno','doomshroom'].includes(d.cardId));
        ashUses += ash.length;
        ashWaste += ash.filter(d => d.resolvedPaidValueDamageEquivalent < d.paidCost * 0.5).length;
      }
    }
  }
  return { winRate: wins / total, avgExchangeRatio: resolvedRatioSum / total, ashWasteRate: ashUses ? ashWaste / ashUses : 0, avgTime: timeSum / total };
}

const ROUNDS = Number(process.argv[2] || 12);
const SEEDS_PER_EVAL = (process.argv[3] || '3001,3002').split(',').map(Number);
const base = basePolicy();
const league = [
  {name: 'legacy', zombieAI: null, plantAI: null, legacy: true},
];
let best = JSON.parse(JSON.stringify(base));
let bestScore = null;
const log = [];
// evaluate baseline against legacy AI both directions
function evalVsLegacy(patch, seeds){
  const opp = {};
  return evaluate(patch, seeds, [{zombieAI: makeLegacyDecide()}, {plantAI: makeLegacyDecide()}].map(o => o));
}
// Simpler: evaluate(patch, seeds, [{zombieAI:legacyInstance},{plantAI:legacyInstance}]) — legacy holds state, need fresh per match.
// Wrap: opponent spec {makeZombieAI: ()=>makeLegacyDecide()}
const CANDIDATE_OVERRIDES = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
function evaluate2(patch, seeds){
  let wins = 0, total = 0, ratioSum = 0, ashWaste = 0, ashUses = 0, timeSum = 0;
  for (const seed of seeds){
    const mA = runMatch({seed, policyPatch: patch, zombieAI: makeLegacyDecide(), overrides: CANDIDATE_OVERRIDES});
    const mB = runMatch({seed: seed + 3, policyPatch: patch, plantAI: makeLegacyDecide(), overrides: CANDIDATE_OVERRIDES});
    // also self-play current-best mirror
    const mC = runMatch({seed: seed + 7, policyPatch: patch, overrides: CANDIDATE_OVERRIDES});
    for (const [m, side] of [[mA, 'plant'], [mB, 'zombie'], [mC, 'plant'], [mC, 'zombie']]){
      total++;
      if (m.result?.winner === side) wins++;
      timeSum += m.time;
      const deps = m.ledger.deployments.filter(d => d.side === side);
      const spent = deps.reduce((s, d) => s + d.paidCost, 0);
      const got = deps.reduce((s, d) => s + d.resolvedPaidValueDamageEquivalent, 0);
      if (spent > 0) ratioSum += got / spent;
      const ash = deps.filter(d => ['cherrybomb','jalapeno','doomshroom'].includes(d.cardId));
      ashUses += ash.length;
      ashWaste += ash.filter(d => d.resolvedPaidValueDamageEquivalent < d.paidCost * 0.5).length;
    }
  }
  // 胜率为主, 交换效率与灰烬浪费为辅; vs legacy 胜率目标高, 镜像自对弈反映上限
  return { score: wins / total + 0.15 * (ratioSum / total) - 0.1 * (ashUses ? ashWaste / ashUses : 0),
    winRate: wins / total, avgExchangeRatio: ratioSum / total, ashWasteRate: ashUses ? ashWaste / ashUses : 0, avgTime: Math.round(timeSum / total) };
}

bestScore = evaluate2(best, SEEDS_PER_EVAL);
log.push({round: 0, note: 'baseline', score: bestScore});
console.log('baseline', JSON.stringify(bestScore));
const rng = mulberry32(20260828);
for (let round = 1; round <= ROUNDS; round++){
  const cand = mutate(best, rng, 0.22);
  const score = evaluate2(cand, SEEDS_PER_EVAL);
  const accept = score.score > bestScore.score;
  log.push({round, accept, score});
  console.log(`round ${round}: score=${score.score.toFixed(4)} win=${score.winRate.toFixed(3)} xr=${score.avgExchangeRatio.toFixed(3)} ashWaste=${score.ashWasteRate.toFixed(3)} ${accept ? 'ACCEPT' : 'reject'}`);
  if (accept){ best = cand; bestScore = score; }
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.resolve(HERE, '../../dist/versus_lab'), {recursive: true});
fs.writeFileSync(path.resolve(HERE, '../../dist/versus_lab/trained_policy.json'), JSON.stringify({policy: best, score: bestScore, log, overridesUsed: !!CANDIDATE_OVERRIDES}, null, 2));
console.log('TRAINED_POLICY_SAVED', JSON.stringify(bestScore));
