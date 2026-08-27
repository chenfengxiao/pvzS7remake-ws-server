"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  ZOMBIES: {
    normal: { threat: 1 }, cone: { threat: 2 }, bucket: { threat: 4 },
    football: { threat: 6 }, garg: { threat: 12 }, giga: { threat: 20 },
    testFutureZombie: { threat: 9, shooter: 2 }
  },
  ZOMBIE_KEYS: ["normal", "cone", "bucket", "football", "garg", "giga", "testFutureZombie"]
};
context.globalThis = context;
vm.createContext(context);
for (const file of ["src/js/22_versus_feature_profiles.js", "src/js/23_versus_card_cooldowns.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const P = context.S7_VERSUS_PROFILE;
const C = context.S7VersusCooldowns;
assert(P && C, "Versus profile/cooldown API missing");
assert.strictEqual(Object.keys(P.cardCooldown.plants).length, 47, "expected 47 plant cards including twin + 3 ashes");
assert(P.cardCooldown.zombies.testFutureZombie.cooldownSeconds >= 5, "future zombie must get safe derived cooldown");
assert.strictEqual(context.S7FeatureProfiles.assertIsolation(), true);

const s = { time: 0 };
C.activate(s, { nowSeconds: 0 });
assert.strictEqual(C.canUse(s, "plant", "sunflower", 0), true, "sunflower should be an immediate economy opener");
assert.strictEqual(C.canUse(s, "zombie", "normal", 0), true, "normal zombie should be an immediate opener");
assert.strictEqual(C.canUse(s, "plant", "cherrybomb", 0), false, "ash must respect opening cooldown");
assert(Math.abs(C.status(s, "plant", "cherrybomb", 0).remainingSeconds - 30) < 1e-9);

assert.strictEqual(C.commitUse(s, "plant", "sunflower", 0).ok, true);
assert.strictEqual(C.canUse(s, "plant", "sunflower", 1), false);
assert.strictEqual(C.canUse(s, "zombie", "normal", 1), true, "plant cooldown cannot contaminate zombie domain");
assert.strictEqual(C.commitUse(s, "zombie", "normal", 1).ok, true);
assert.strictEqual(C.canUse(s, "zombie", "normal", 2), false);
assert.strictEqual(C.canUse(s, "plant", "sunflower", 12), true);

// Shared ash lock: Cherry at t=30 blocks Jalapeno until t=38 even though its
// opening cooldown would have completed at t=35.
assert.strictEqual(C.commitUse(s, "plant", "cherrybomb", 30).ok, true);
let jal = C.status(s, "plant", "jalapeno", 35);
assert.strictEqual(jal.ready, false);
assert.strictEqual(jal.reason, "shared-group");
assert(Math.abs(jal.remainingSeconds - 3) < 1e-9);
assert.strictEqual(C.canUse(s, "plant", "jalapeno", 38), true);

// Variant/command forms share the base card cooldown domain.
const s2 = { time: 0 };
C.activate(s2, { nowSeconds: 0 });
assert.strictEqual(C.canonicalCardId("zombie", "var:bucket"), "bucket");
assert.strictEqual(C.commitUse(s2, "zombie", "var:bucket", 3).ok, true);
assert.strictEqual(C.canUse(s2, "zombie", "bucket", 4), false);

// Sudden Death smoothly reduces future cooldowns but never below the profile floors.
const plantLate = C.effectiveCooldown(s2, "plant", "wallnut", 600);
const zombieLate = C.effectiveCooldown(s2, "zombie", "normal", 600);
assert(Math.abs(plantLate - 12 * .85) < 1e-9);
assert(Math.abs(zombieLate - 5 * .70) < 1e-9);

// Snapshot/restore is deterministic and ready for future network/replay use,
// without implementing networking now.
const snap = C.serialize(s2);
const s3 = { time: 4 };
assert.strictEqual(C.restore(s3, snap), true);
assert.deepStrictEqual(C.serialize(s3), snap);

C.deactivate(s3);
assert.strictEqual(C.canUse(s3, "plant", "cherrybomb", 4), true, "inactive Versus must not change normal S7 behavior");

console.log("Versus cooldown tests: PASS");
