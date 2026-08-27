"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const fakePlants = {};
for (let i = 0; i < 20; i++) fakePlants[`p${i}`] = { name: `植物${i}`, emoji: "🌿" };
fakePlants.sunflower = { name: "向日葵", emoji: "🌻" };
fakePlants.sunshroom = { name: "阳光菇", emoji: "🍄" };
fakePlants.twinSunflower = { name: "双子向日葵", emoji: "🌻" };
const fakeZombies = {};
for (let i = 0; i < 20; i++) fakeZombies[`z${i}`] = { name: `僵尸${i}`, emoji: "🧟", threat: 1 };

const storage = new Map();
const ctx = {
  console,
  PLANTS: fakePlants,
  ZOMBIES: fakeZombies,
  ZOMBIE_KEYS: Object.keys(fakeZombies),
  localStorage: {
    getItem(k){ return storage.has(k) ? storage.get(k) : null; },
    setItem(k,v){ storage.set(k,String(v)); }
  }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("src/js/22_versus_feature_profiles.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("src/js/24_versus_bp_draft.js", "utf8"), ctx);

const BP = ctx.S7VersusBP;
assert(BP, "S7VersusBP missing");
const defaultDraft = BP.createDraft();
assert(defaultDraft.plantPool.includes("sunflower"), "向日葵必须作为普通战斗/辅助卡参与 BP");
assert(defaultDraft.plantPool.includes("sunshroom"), "阳光菇必须作为普通战斗/辅助卡参与 BP");
assert(!defaultDraft.plantPool.includes("twinSunflower"), "双子向日葵是固定经济核心，不得进入 BP");

function signature(phases){ return phases.map(p => `${p.actor[0]}${p.action[0]}${p.targetSide[0]}`).join(" "); }
const expected6 = [
  "zbp","pbz","zbp","pbz",
  "zpz","ppp","zpz","ppp","zpz","ppp",
  "zbp","pbz","zbp","pbz","zbp","pbz",
  "zpz","ppp","zpz","ppp"
].join(" ");
assert.strictEqual(signature(BP.buildPhases(false)), expected6, "6-slot exact BP order mismatch");
assert.strictEqual(BP.buildPhases(false).length, 20);
assert.strictEqual(BP.buildPhases(true).length, 22);
assert.strictEqual(signature(BP.buildPhases(true)).slice(0, expected6.length), expected6);
assert.strictEqual(signature(BP.buildPhases(true)).split(" ").slice(-2).join(" "), "zpz ppp");

let d = BP.createDraft({ extraSlot:false, plantPool:Object.keys(fakePlants).filter(x=>x !== "twinSunflower"), zombiePool:Object.keys(fakeZombies) });
assert.strictEqual(d.totalSlots, 6);
assert.strictEqual(d.draftedCombatSlots, 5);
while(!d.complete){
  const legal = BP.legalCards(d);
  assert(legal.length > 0);
  const r = BP.applyAction(d, legal[0]);
  assert(r.ok);
}
let r = BP.result(d);
assert.strictEqual(r.plant.combatCards.length, 5);
assert.strictEqual(r.zombie.combatCards.length, 5);
assert.strictEqual(r.plant.bannedCards.length, 5);
assert.strictEqual(r.zombie.bannedCards.length, 5);
assert.strictEqual(r.plant.economyCore, "twinSunflower");
assert.strictEqual(r.zombie.economyCore, "zombieGravestone");

let d7 = BP.createDraft({ extraSlot:true, plantPool:Object.keys(fakePlants).filter(x=>x !== "twinSunflower"), zombiePool:Object.keys(fakeZombies) });
while(!d7.complete) assert(BP.applyAction(d7, BP.legalCards(d7)[0]).ok);
let r7 = BP.result(d7);
assert.strictEqual(r7.totalSlots, 7);
assert.strictEqual(r7.plant.combatCards.length, 6);
assert.strictEqual(r7.zombie.combatCards.length, 6);

BP.setBpEnabled(true);
BP.setExtraSlot(true);
assert.strictEqual(BP.getSettings().bpEnabled, true);
assert.strictEqual(BP.getSettings().totalSlots, 7);
assert(storage.size > 0, "settings not persisted");

const saved = BP.serialize(d7);
const restored = BP.restore(saved);
assert.deepStrictEqual(JSON.parse(JSON.stringify(BP.result(restored))), JSON.parse(JSON.stringify(BP.result(d7))));

console.log("Versus BP draft tests: PASS");
console.log("6-slot phases: 20 | picks 5/side | bans 5/side + 1 reserved economy slot");
console.log("7-slot phases: 22 | picks 6/side | bans 5/side + 1 reserved economy slot");
