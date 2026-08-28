// A/B benchmark: shared policy (101) vs legacy practice heuristic.
// Both faction directions, identical decks, N seeds per arm.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMatch} from './match_runner.mjs';
import {makeLegacyDecide} from './legacy_ai.mjs';

const N = Number(process.argv[2] || 24);
const seeds = Array.from({length: N}, (_, i) => 1000 + i * 7919);

function summarize(matches, side){
  const deps = matches.flatMap(m => m.ledger.deployments.filter(d => d.side === side));
  const ash = deps.filter(d => ['cherrybomb','jalapeno','doomshroom'].includes(d.cardId));
  const wastedAsh = ash.filter(d => d.resolvedPaidValueDirect + d.resolvedPaidValueDamageEquivalent < d.paidCost * 0.5);
  return {
    spend: Math.round(deps.reduce((s, d) => s + d.paidCost, 0) / matches.length),
    deployments: Math.round(deps.length / matches.length * 10) / 10,
    ashUses: ash.length,
    wastedAsh: wastedAsh.length,
    ashAvgResolved: ash.length ? Math.round(ash.reduce((s, d) => s + d.resolvedPaidValueDirect + d.resolvedPaidValueDamageEquivalent, 0) / ash.length) : 0,
    resolvedDirect: Math.round(deps.reduce((s, d) => s + d.resolvedPaidValueDirect, 0) / matches.length),
    resolvedDmgEq: Math.round(deps.reduce((s, d) => s + d.resolvedPaidValueDamageEquivalent, 0) / matches.length)
  };
}

const arms = {A: [], B: []};
const t0 = Date.now();
for (const seed of seeds){
  // Arm A: new policy = plant, legacy = zombie
  arms.A.push(runMatch({seed, plantAI: null, zombieAI: makeLegacyDecide()}));
  // Arm B: legacy = plant, new policy = zombie
  arms.B.push(runMatch({seed, plantAI: makeLegacyDecide(), zombieAI: null}));
}
const winRate = (ms, side) => ms.filter(m => m.result?.winner === side).length / ms.length;
const report = {
  matches: N * 2, wallSeconds: Math.round((Date.now() - t0) / 100) / 10,
  armA_newAsPlant: { winRate: winRate(arms.A, 'plant'), avgTime: Math.round(arms.A.reduce((s,m)=>s+m.time,0)/N), ...summarize(arms.A, 'plant') },
  armB_newAsZombie: { winRate: winRate(arms.B, 'zombie'), avgTime: Math.round(arms.B.reduce((s,m)=>s+m.time,0)/N), ...summarize(arms.B, 'zombie') },
  legacyArmA_asZombie: { winRate: winRate(arms.A, 'zombie'), ...summarize(arms.A, 'zombie') },
  legacyArmB_asPlant: { winRate: winRate(arms.B, 'plant'), ...summarize(arms.B, 'plant') }
};
report.newOverallWinRate = (winRate(arms.A, 'plant') + winRate(arms.B, 'zombie')) / 2;
report.legacyOverallWinRate = (winRate(arms.A, 'zombie') + winRate(arms.B, 'plant')) / 2;
const HERE = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.resolve(HERE, '../../dist/versus_lab'), {recursive: true});
fs.writeFileSync(path.resolve(HERE, '../../dist/versus_lab/ab_policy_vs_legacy.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
