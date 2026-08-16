"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const zombie = fs.readFileSync(path.join(ROOT, "src/js/60_zombie_simulation.js"), "utf8");
const combat = fs.readFileSync(path.join(ROOT, "src/js/51_damage_combat.js"), "utf8");
const animation = fs.readFileSync(path.join(ROOT, "src/js/13_projectiles_effects.js"), "utf8");

const checks = {
  actionClock: "const actionRate = z.s7Elem?.cold > 0 ? s7ZombieColdActionRate(z) : 1;",
  ageAndNaturalSummon: "z.age += actionDt;",
  bungee: "updateBungee(z, actionDt);",
  newspaper: "updateNewspaperRageState(z, actionDt)",
  poleCommander: "updatePoleCommanderState(z, actionDt)",
  gargThrow: "s7UpdateGargThrowWindup(z, actionDt)",
  gargSmash: "s7UpdateGargSmashWindup(z, actionDt)",
  heavyContact: "tryShadowSpikeHeavyContact(z, actionDt)",
  catapult: "updateCatapult(z, dt, actionDt)",
  shooter: "updateShooterZombie(z, actionDt)",
  jack: "z.jackCd -= actionDt;",
  pogo: "z.pogoChargeTime -= actionDt;",
  airborneJump: "z.jumpMove -= jsp * actionDt;",
  squash: "z.s7.squashZWindupTimer -= actionDt;",
  specialContact: "trySpecialContact(z, p, actionDt)",
  bite: "z.attackCd -= actionDt;",
  bobsledSummon: "z.s7.sledSummonCd -= actionDt;",
  footballRun: "z.s7.footballRunTime = (z.s7.footballRunTime || 0) + actionDt",
  friendlyClock: "const actionRate = z.s7Elem?.cold > 0 ? s7ZombieColdActionRate(z) : 1;",
  friendlyVehicle: "CHARMED_VEHICLE_DPS * actionDt",
  friendlyBite: "EAT_DPS * actionDt",
  animationClock: "s7ZombieColdActionRate(z)",
};
const locations = {
  actionClock: zombie,
  ageAndNaturalSummon: zombie,
  bungee: zombie,
  newspaper: zombie,
  poleCommander: zombie,
  gargThrow: zombie,
  gargSmash: zombie,
  heavyContact: zombie,
  catapult: zombie,
  shooter: zombie,
  jack: zombie,
  pogo: zombie,
  airborneJump: zombie,
  squash: zombie,
  specialContact: zombie,
  bite: zombie,
  bobsledSummon: zombie,
  footballRun: zombie,
  friendlyClock: combat,
  friendlyVehicle: combat,
  friendlyBite: combat,
  animationClock: animation,
};
const results = {};
for (const [key, needle] of Object.entries(checks)) {
  const ok = locations[key].includes(needle);
  results[key] = ok;
  assert.ok(ok, `missing cold action clock hook: ${key}`);
}
assert.ok(combat.includes("Math.max(.12 * actionRate, currentSpeed(z, dt))"), "friendly minimum speed must retain baseline while scaling with cold");
const report = { ok: true, checks: Object.keys(results).length, results };
fs.writeFileSync(path.join(ROOT, "dist/2026-08-04_cold_action_clock_verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
