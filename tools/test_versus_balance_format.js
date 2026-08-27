"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const PLANTS = { twinSunflower:{}, sunflower:{}, sunshroom:{} };
for (let i=0;i<12;i++) PLANTS[`p${i}`] = {};
const ZOMBIES = {};
for (let i=0;i<12;i++) ZOMBIES[`z${i}`] = { threat:1 };

const ctx = { console, PLANTS, ZOMBIES, ZOMBIE_KEYS:Object.keys(ZOMBIES) };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["src/js/22_versus_feature_profiles.js", "src/js/25_versus_balance_format.js"]) {
  vm.runInContext(fs.readFileSync(f,"utf8"), ctx);
}
const F = ctx.S7VersusBalanceFormat;
assert(F, "S7VersusBalanceFormat missing");
assert.strictEqual(F.FORMAT_ID, "versus-nobp-6slot-zfirst-v1");
const phases = F.buildPhases();
assert.strictEqual(phases.length, 10);
for (let i=0;i<5;i++) {
  assert.strictEqual(phases[i*2].actor, "zombie");
  assert.strictEqual(phases[i*2+1].actor, "plant");
}
const d = F.createDraft();
assert(d.plantPool.includes("sunflower"));
assert(d.plantPool.includes("sunshroom"));
assert(!d.plantPool.includes("twinSunflower"));
while (!d.complete) {
  const cards = F.legalCards(d);
  assert(cards.length > 0);
  assert(F.applyAction(d, cards[0]).ok);
}
const r = F.result(d);
assert.strictEqual(r.totalSlots, 6);
assert.strictEqual(r.combatSlots, 5);
assert.strictEqual(r.firstPicker, "zombie");
assert.strictEqual(r.plant.economyCore, "twinSunflower");
assert.strictEqual(r.zombie.economyCore, "zombieGravestone");
assert.strictEqual(r.plant.combatCards.length, 5);
assert.strictEqual(r.zombie.combatCards.length, 5);
assert(F.isBalanceEligibleMatch(r));
assert.strictEqual(F.telemetryClass(r), "strength_truth");
assert.strictEqual(F.telemetryClass({bpEnabled:true,totalSlots:6}), "bp_resilience");
assert.strictEqual(F.telemetryClass({bpEnabled:false,totalSlots:7,combatSlots:6,firstPicker:"zombie",alternating:true}), "excluded_other_format");
const split = F.splitTelemetry([{meta:r},{meta:{bpEnabled:true}},{meta:{bpEnabled:false,totalSlots:7}}]);
assert.strictEqual(split.strength_truth.length,1);
assert.strictEqual(split.bp_resilience.length,1);
assert.strictEqual(split.excluded_other_format.length,1);
const restored = F.restore(F.serialize(d));
assert.deepStrictEqual(JSON.parse(JSON.stringify(F.result(restored))), JSON.parse(JSON.stringify(r)));
console.log("Versus balance baseline format tests: PASS");
console.log("Truth format: No-BP / 6 slots / fixed Twin Sunflower + Gravestone / Z first / 5 alternating picks");
