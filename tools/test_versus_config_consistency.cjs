// Config consistency: 22_versus_feature_profiles.js (draft/UI cost + cooldown
// tables) MUST mirror the authoritative 99_versus_battle_controller.js CARDS.
// The runtime owner for Versus cost/CD is 99; 22 is the display/draft layer.
// This test fails if a Versus card shows a different cost or cooldown in the
// draft/BP UI than what the battle core actually charges.
const fs = require('fs');
const path = require('path');

(async () => {
  const { createS7HeadlessRuntime } = await import('./versus_lab/headless_runtime.mjs');
  const rt = createS7HeadlessRuntime();
  const CARDS = rt.S7VersusBattle.CARDS;

  const P22 = path.resolve(__dirname, '../src/js/22_versus_feature_profiles.js');
  const src = fs.readFileSync(P22, 'utf8');

  // Extract a frozen/object map block: NAME = (<Object.freeze>)?{ ... };
  function mapEntries(name) {
    const re = new RegExp(name + '\\s*=\\s*(?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}\\s*\\)?\\s*;');
    const m = re.exec(src);
    if (!m) return null;
    const body = m[1];
    const out = {};
    // cost form: id: NUMBER
    const costRe = /(\w+):\s*(\d+)\b/g;
    let cm;
    while ((cm = costRe.exec(body))) out[cm[1]] = { cost: Number(cm[2]) };
    return out;
  }
  function cooldownEntries(name) {
    const re = new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;');
    const m = re.exec(src);
    if (!m) return null;
    const body = m[1];
    const out = {};
    const cdRe = /(\w+):\s*\[\s*([\d.]+)/g;
    let cm;
    while ((cm = cdRe.exec(body))) out[cm[1]] = { cd: Number(cm[2]) };
    return out;
  }

  const plantCost = mapEntries('PLANT_RESOURCE_COSTS');
  const zombieCost = mapEntries('ZOMBIE_RESOURCE_COSTS');
  const plantCd = cooldownEntries('PLANT_COOLDOWNS');
  const zombieCd = cooldownEntries('zombieOverrides');

  const errors = [];
  const LOCKED = { cherrybomb: [150, 50], jalapeno: [125, 50], doomshroom: [200, 50] };

  for (const [id, c] of Object.entries(CARDS.plant)) {
    if (plantCost && plantCost[id] && plantCost[id].cost !== Math.round(c.cost))
      errors.push(`plant.${id}: cost 99=${c.cost} vs 22=${plantCost[id].cost}`);
    if (plantCd && plantCd[id] && plantCd[id].cd !== c.cd)
      errors.push(`plant.${id}: cd 99=${c.cd} vs 22=${plantCd[id].cd}`);
  }
  for (const [id, c] of Object.entries(CARDS.zombie)) {
    if (zombieCost && zombieCost[id] && zombieCost[id].cost !== Math.round(c.cost))
      errors.push(`zombie.${id}: cost 99=${c.cost} vs 22=${zombieCost[id].cost}`);
    if (zombieCd && zombieCd[id] && zombieCd[id].cd !== c.cd)
      errors.push(`zombie.${id}: cd 99=${c.cd} vs 22=${zombieCd[id].cd}`);
  }
  for (const [id, [cost, cd]] of Object.entries(LOCKED)) {
    if (CARDS.plant[id].cost !== cost) errors.push(`ash ${id}: 99 cost ${CARDS.plant[id].cost} != locked ${cost}`);
    if (CARDS.plant[id].cd !== cd) errors.push(`ash ${id}: 99 cd ${CARDS.plant[id].cd} != locked ${cd}`);
    if (plantCost && plantCost[id] && plantCost[id].cost !== cost) errors.push(`ash ${id}: 22 cost ${plantCost[id].cost} != locked ${cost}`);
  }

  if (errors.length) {
    console.error('VERSUS CONFIG CONSISTENCY FAIL:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log('VERSUS CONFIG CONSISTENCY PASS (22 <-> 99 synced for all Versus cards)');
})();
