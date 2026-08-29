// Exchange Ledger regression: deployment-level paid-value accounting.
// Validates the Versus balance contract's core invariants:
//   - deployment records its true paid cost (deployment-level, no fabrication)
//   - Target objective never converts to resource value
//   - overkill / multiple killers never inflate value (no double-counting)
//   - free cores (twin/gravestone) are tracked as strategic value, not paid value
// The SAME ledger (99_versus_battle_controller.getLedger) backs both the real
// game and the headless training runtime, so this exercises the authoritative owner.
const { createS7HeadlessRuntime } = require('./versus_lab/headless_runtime.mjs');

function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + detail));
  return ok ? 0 : 1;
}

function advance(rt, b, n) {
  for (let i = 0; i < n; i++) {
    rt.update(rt.FIXED_FRAME_DT);
    if (i % 5 === 0) b.tick(0.2);
  }
}

let failed = 0;

// 1) Deployment-level paid cost is recorded exactly (no fabrication / no double book).
{
  const rt = createS7HeadlessRuntime();
  const b = rt.S7VersusBattle;
  b.start({ mode: 'practice', humanSide: null, plantCards: ['repeater', 'gatling'], zombieCards: ['normal', 'garg'], online: false, isHost: true });
  const st = rt.getState();
  b.state.resources.plant = 9999;
  b.state.resources.zombie = 9999;
  const rp = b.performAction({ type: 'play', side: 'plant', cardId: 'repeater', row: 0, col: 3 }, 'ai');
  const rz = b.performAction({ type: 'play', side: 'zombie', cardId: 'garg', row: 1 }, 'ai');
  const L = b.getLedger();
  const depP = L.byId[L.byEntity[rp.entityId]];
  const depZ = L.byId[L.byEntity[rz.entityId]];
  const expectP = b.CARDS.plant.repeater.cost;
  const expectZ = b.CARDS.zombie.garg.cost;
  failed += check('deployment paidCost = CARDS cost (plant)', depP && depP.paidCost === expectP, 'got ' + (depP && depP.paidCost) + ' expect ' + expectP);
  failed += check('deployment paidCost = CARDS cost (zombie)', depZ && depZ.paidCost === expectZ, 'got ' + (depZ && depZ.paidCost) + ' expect ' + expectZ);
}

// 2) Target objective is never converted to resource value.
{
  const rt = createS7HeadlessRuntime();
  const b = rt.S7VersusBattle;
  b.start({ mode: 'practice', humanSide: null, plantCards: ['gatling'], zombieCards: ['normal'], online: false, isHost: true });
  const st = rt.getState();
  b.state.resources.plant = 9999;
  const target = st.zombies.find(z => z.versusObjective);
  const trow = target ? target.row : 2;
  const r = b.performAction({ type: 'play', side: 'plant', cardId: 'gatling', row: trow, col: 8 }, 'ai');
  if (target) target.hp = 5; // fixture: make target killable quickly (no paid value either way)
  advance(rt, b, 1500);
  const L = b.getLedger();
  const dep = L.byId[L.byEntity[r.entityId]];
  const destroyed = b.state.versus.target.destroyed;
  failed += check('a Target was destroyed by the plant', destroyed >= 1, 'destroyed=' + destroyed);
  // Contract: a Target objective yields ZERO paid/exchange value. The only actor
  // here is the gatling (no paid zombies deployed), so any resolvedPaidValueDirect
  // > 0 would mean the objective was wrongly converted to resource value.
  failed += check('Target death converts 0 paid/exchange value (no resource conversion)',
    dep && dep.resolvedPaidValueDirect === 0,
    'paidDirect=' + (dep && dep.resolvedPaidValueDirect));
}

// 3) Overkill / multiple killers never inflate value (no double-counting).
{
  const rt = createS7HeadlessRuntime();
  const b = rt.S7VersusBattle;
  b.start({ mode: 'practice', humanSide: null, plantCards: ['repeater', 'gatling'], zombieCards: ['garg'], online: false, isHost: true });
  const st = rt.getState();
  b.state.resources.plant = 9999;
  b.state.resources.zombie = 9999;
  const rz = b.performAction({ type: 'play', side: 'zombie', cardId: 'garg', row: 1 }, 'ai');
  const z = st.zombies.find(zz => zz.id === rz.entityId);
  if (z) { z.x = 5; z.stun = 1e9; } // pin so both plants focus-fire it
  const rp1 = b.performAction({ type: 'play', side: 'plant', cardId: 'repeater', row: 1, col: 2 }, 'ai');
  const rp2 = b.performAction({ type: 'play', side: 'plant', cardId: 'gatling', row: 1, col: 3 }, 'ai');
  advance(rt, b, 2000);
  const L = b.getLedger();
  const gargDep = L.byId[L.byEntity[rz.entityId]];
  const d1 = L.byId[L.byEntity[rp1.entityId]];
  const d2 = L.byId[L.byEntity[rp2.entityId]];
  const gargCost = b.CARDS.zombie.garg.cost;
  const sumDirect = (d1 ? d1.resolvedPaidValueDirect : 0) + (d2 ? d2.resolvedPaidValueDirect : 0);
  const sumDmgEq = (d1 ? d1.resolvedPaidValueDamageEquivalent : 0) + (d2 ? d2.resolvedPaidValueDamageEquivalent : 0);
  failed += check('paid victim marked killed', gargDep && gargDep.outcome === 'killed', 'outcome=' + (gargDep && gargDep.outcome));
  failed += check('paid victim claimed exactly its cost', gargDep && gargDep.paidValueClaimed === gargCost, 'claimed=' + (gargDep && gargDep.paidValueClaimed) + ' cost=' + gargCost);
  failed += check('no double-count: sum of killers <= victim cost', sumDirect <= gargCost + 1e-6, 'sum=' + sumDirect + ' cost=' + gargCost);
  // Total exchange measure is the EHP-proportional damage value; a killed victim's
  // full value must be credited at most once across ALL killers (no direct+dmgEq double count).
  failed += check('no double-count: total damage-equivalent across killers <= victim cost',
    sumDmgEq <= gargCost + 1e-6, 'sumDmgEq=' + sumDmgEq + ' cost=' + gargCost);
}

// 4) Free core damage is strategic value, NOT paid value.
{
  const rt = createS7HeadlessRuntime();
  const b = rt.S7VersusBattle;
  b.start({ mode: 'practice', humanSide: null, plantCards: ['repeater'], zombieCards: ['normal'], online: false, isHost: true });
  const st = rt.getState();
  b.state.resources.zombie = 9999;
  const twin = st.plants.find(p => p.versusCore === 'twin');
  const rz = b.performAction({ type: 'play', side: 'zombie', cardId: 'normal', row: twin ? twin.row : 2 }, 'ai');
  advance(rt, b, 6000);
  const L = b.getLedger();
  const zDep = L.byId[L.byEntity[rz.entityId]];
  failed += check('free twin core not registered as paid deployment',
    !L.deployments.some(d => d.cardId === 'twinSunflower' && d.paidCost > 0), 'twin listed with paidCost>0');
  failed += check('free core damage -> freeCoreStrategicValue (not paidDirect)',
    zDep && zDep.freeCoreStrategicValue > 0 && zDep.resolvedPaidValueDirect === 0,
    'strat=' + (zDep && zDep.freeCoreStrategicValue) + ' paidDirect=' + (zDep && zDep.resolvedPaidValueDirect));
}

if (failed) {
  console.log('EXCHANGE_LEDGER_FAIL ' + failed);
  process.exit(1);
}
console.log('EXCHANGE_LEDGER_PASS');
