"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const source = {
  progression: fs.readFileSync(path.join(ROOT, "src/js/90_s7_progression.js"), "utf8"),
  combat: fs.readFileSync(path.join(ROOT, "src/js/51_damage_combat.js"), "utf8"),
  query: fs.readFileSync(path.join(ROOT, "src/js/31_query_collision.js"), "utf8"),
  blind: fs.readFileSync(path.join(ROOT, "src/js/94_s7_blind_commands_main.js"), "utf8"),
};

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing function ${name}`);
  const open = text.indexOf("{", start);
  let depth = 0;
  let mode = "code";
  let quote = "";
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || "";
    if (mode === "code") {
      if (ch === "'" || ch === '"' || ch === "`") {
        mode = "string";
        quote = ch;
        escaped = false;
      } else if (ch === "/" && next === "/") {
        mode = "lineComment";
        i++;
      } else if (ch === "/" && next === "*") {
        mode = "blockComment";
        i++;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    } else if (mode === "string") {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) mode = "code";
    } else if (mode === "lineComment") {
      if (ch === "\n") mode = "code";
    } else if (mode === "blockComment") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i++;
      }
    }
  }
  throw new Error(`unterminated function ${name}`);
}

Object.assign(global, {
  PLANT_RULES: { peashooter: {}, sunflower: {}, goldmagnet: {}, starfruit: {} },
  PLANTS: { peashooter: {}, sunflower: {}, goldmagnet: {}, starfruit: {} },
  S7_RULES: {
    experience: {
      sameLaneKillerShare: 0.6,
      crossLaneKillerShare: 0.3,
      crossLaneKillerLaneOtherShare: 0.2,
      crossLaneVictimLaneShare: 0.5,
      plantDeathSharePerReceiver: 0.25,
    },
  },
  state: { plants: [], zombies: [] },
  finiteArray: value => Array.isArray(value) ? value : [],
  finiteNumber: (value, fallback = 0) => Number.isFinite(value) ? value : fallback,
  s7InitPlant: plant => {
    plant.s7 ||= {};
    plant.s7.exp ||= 0;
    plant.s7.level ||= 0;
  },
  s7RefreshPlant: plant => { plant.s7.level ||= 0; },
  s7MaxExp: () => 1e9,
  s7DrainStarExpToQueue: () => {},
});

const functions = [
  [source.combat, "s7SuppressKillXpForZombie"],
  [source.blind, "s7RecalcZombieXp"],
  [source.progression, "s7CanReceiveExp"],
  [source.progression, "s7LanePlants"],
  [source.progression, "s7LaneExperienceMultiplier"],
  [source.progression, "s7GrantPlantExp"],
  [source.progression, "s7SplitExp"],
  [source.progression, "s7ZombieExperienceValue"],
  [source.progression, "s7GrantKillXp"],
  [source.progression, "s7GrantDeathXp"],
].map(([text, name]) => extractFunction(text, name)).join("\n\n");
vm.runInThisContext(functions, { filename: "experience-functions-from-current-source.js" });

function plant(key, row, exp = 0, level = 0) {
  return { key, row, dead: false, s7: { exp, level } };
}
function reset(plants) {
  global.state = { plants, zombies: [] };
}
function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
}
let tests = 0;
function test(name, fn) {
  fn();
  tests++;
}

test("body plus class-1 and class-2 max hp", () => {
  const zombie = {
    maxHp: 270,
    armors: [
      { cls: 1, max: 300, hp: 0 },
      { cls: 2, max: 1100, hp: 0 },
      { cls: 3, max: 999, hp: 999 },
    ],
  };
  close(s7RecalcZombieXp(zombie), 1670, "experience basis");
  close(s7ZombieExperienceValue(zombie), 1670, "cached experience basis");
});

test("same-lane 60/40", () => {
  const killer = plant("peashooter", 0);
  const otherA = plant("sunflower", 0);
  const otherB = plant("sunflower", 0);
  reset([killer, otherA, otherB]);
  s7GrantKillXp({ row: 0, s7Xp: 1000 }, killer);
  close(killer.s7.exp, 600, "killer");
  close(otherA.s7.exp, 200, "other A");
  close(otherB.s7.exp, 200, "other B");
});

test("one gold magnet gives 1.25x", () => {
  const killer = plant("peashooter", 0);
  const magnet = plant("goldmagnet", 0);
  reset([killer, magnet]);
  s7GrantKillXp({ row: 0, s7Xp: 1000 }, killer);
  close(killer.s7.exp, 750, "killer with one magnet");
  close(magnet.s7.exp, 500, "other with one magnet");
});

test("two gold magnets multiply exponentially", () => {
  const killer = plant("peashooter", 0);
  const magnetA = plant("goldmagnet", 0);
  const magnetB = plant("goldmagnet", 0);
  reset([killer, magnetA, magnetB]);
  s7GrantKillXp({ row: 0, s7Xp: 1000 }, killer);
  close(killer.s7.exp, 937.5, "killer with two magnets");
  close(magnetA.s7.exp, 312.5, "magnet A");
  close(magnetB.s7.exp, 312.5, "magnet B");
});

test("cross-lane 30/20/50", () => {
  const killer = plant("peashooter", 0);
  const killerLaneOther = plant("sunflower", 0);
  const victimA = plant("sunflower", 1);
  const victimB = plant("sunflower", 1);
  reset([killer, killerLaneOther, victimA, victimB]);
  s7GrantKillXp({ row: 1, s7Xp: 1000 }, killer);
  close(killer.s7.exp, 300, "cross-lane killer");
  close(killerLaneOther.s7.exp, 200, "killer-lane other");
  close(victimA.s7.exp, 250, "victim lane A");
  close(victimB.s7.exp, 250, "victim lane B");
});

test("cross-lane rows use independent magnet multipliers", () => {
  const killer = plant("peashooter", 0);
  const killerMagnet = plant("goldmagnet", 0);
  const victimMagnetA = plant("goldmagnet", 1);
  const victimMagnetB = plant("goldmagnet", 1);
  reset([killer, killerMagnet, victimMagnetA, victimMagnetB]);
  s7GrantKillXp({ row: 1, s7Xp: 1000 }, killer);
  close(killer.s7.exp, 375, "cross killer multiplier");
  close(killerMagnet.s7.exp, 250, "killer lane multiplier");
  close(victimMagnetA.s7.exp, 390.625, "victim lane magnet A");
  close(victimMagnetB.s7.exp, 390.625, "victim lane magnet B");
});

test("no explicit killer splits equally in victim lane", () => {
  const plantA = plant("peashooter", 2);
  const plantB = plant("sunflower", 2);
  reset([plantA, plantB]);
  s7GrantKillXp({ row: 2, s7Xp: 1000 }, null);
  close(plantA.s7.exp, 500, "no-killer A");
  close(plantB.s7.exp, 500, "no-killer B");
});

test("blind and charmed zombies give zero", () => {
  const receiver = plant("peashooter", 0);
  reset([receiver]);
  s7GrantKillXp({ row: 0, s7Xp: 1000, friendly: true }, receiver);
  close(receiver.s7.exp, 0, "friendly zombie");
  s7GrantKillXp({ row: 0, s7Xp: 1000, blind: true }, receiver);
  close(receiver.s7.exp, 0, "blind zombie");
  s7GrantKillXp({ row: 0, s7Xp: 1000, s7CharmedByHypno: true }, receiver);
  close(receiver.s7.exp, 0, "charmed flag");
});

test("plant death grants 25% to each receiver", () => {
  const deadPlant = plant("peashooter", 3, 800);
  const receiverA = plant("sunflower", 3);
  const receiverB = plant("sunflower", 3);
  reset([deadPlant, receiverA, receiverB]);
  s7GrantDeathXp(deadPlant);
  close(receiverA.s7.exp, 200, "death receiver A");
  close(receiverB.s7.exp, 200, "death receiver B");
});

test("plant death experience gets lane magnet multiplier", () => {
  const deadPlant = plant("peashooter", 3, 800);
  const receiver = plant("sunflower", 3);
  const magnet = plant("goldmagnet", 3);
  reset([deadPlant, receiver, magnet]);
  s7GrantDeathXp(deadPlant);
  close(receiver.s7.exp, 250, "death receiver with magnet");
  close(magnet.s7.exp, 250, "death magnet receiver");
});

test("ineligible killer share does not reflow", () => {
  const maxedKiller = plant("peashooter", 0, 0, 5);
  const other = plant("sunflower", 0);
  reset([maxedKiller, other]);
  s7GrantKillXp({ row: 0, s7Xp: 1000 }, maxedKiller);
  close(maxedKiller.s7.exp, 0, "maxed killer");
  close(other.s7.exp, 400, "fixed remaining share");
});

assert.ok(source.combat.includes("else s7GrantKillXp(z, z.lastHitPlant || null)"), "missing no-killer fallback in killZombie");
assert.ok(source.combat.includes("s7RecalcZombieXp(imp);"), "thrown imp max-HP change does not refresh experience");
assert.ok(source.query.includes('z.armors.push(armor("矿工帽", 100, 1, true));\n        s7RecalcZombieXp(z)'), "digger helmet does not refresh experience");

console.log(JSON.stringify({ ok: true, tests, sourceHooks: 3 }));
