import {runMatch} from './match_runner.mjs';
const t0 = Date.now();
const m = runMatch({seed: 7, maxSeconds: 2500});
const dt = Date.now() - t0;
console.log(JSON.stringify({
  result: m.result, time: Math.round(m.time * 100) / 100, frames: m.frames,
  wallMs: dt,
  plantCards: m.plantCards, zombieCards: m.zombieCards,
  deployments: m.ledger?.deployments?.length,
  plantSpend: m.ledger?.deployments?.filter(d=>d.side==='plant').reduce((s,d)=>s+d.paidCost,0),
  zombieSpend: m.ledger?.deployments?.filter(d=>d.side==='zombie').reduce((s,d)=>s+d.paidCost,0),
  mowerCleared: m.ledger?.mowerClearedPaidValue
}, null, 2));
