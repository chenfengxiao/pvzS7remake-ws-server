// test_versus_objectives.cjs - TV Versus rules verification
const assert = require('assert');

// Mock the global environment that 22_versus_feature_profiles.js expects
global.window = global;
global.S7_VERSUS_RULES = undefined;

// Load the rules module
require('../src/js/22_versus_feature_profiles.js');

const R = global.S7_VERSUS_RULES;
assert.ok(R, 'S7_VERSUS_RULES must be exported');

// A. Rules constants
assert.strictEqual(R.startResource, 75, 'startResource must be 75');
assert.strictEqual(R.drawAtSeconds, 2400, 'drawAtSeconds must be 2400');
assert.strictEqual(R.suddenDeathAtSeconds, 300, 'suddenDeathAtSeconds must be 300');
assert.strictEqual(R.targetCount, 5, 'targetCount must be 5');
assert.strictEqual(R.targetKillsToWin, 3, 'targetKillsToWin must be 3');
assert.strictEqual(R.targetX, 9.0, 'targetX must be 9.0');
assert.strictEqual(R.targetHp, 200, 'targetHp must be 200');
assert.deepStrictEqual([...R.targetDamageStageThresholds], [60, 100, 160], 'thresholds must be 60/100/160');
assert.strictEqual(R.skySupplyIntervalSeconds, 20, 'skySupplyInterval must be 20');
assert.strictEqual(R.skySupplyAmount, 50, 'skySupplyAmount must be 50');
assert.strictEqual(R.gravestoneHp, 400, 'gravestoneHp must be 400');
assert.strictEqual(R.gravestoneCost, 50, 'gravestoneCost must be 50');
assert.strictEqual(R.twinCost, 100, 'twinCost must be 100');
assert.strictEqual(R.twinProductionAmount, 25, 'twinProductionAmount must be 25');
assert.strictEqual(R.twinBrightenSeconds, 1.0, 'twinBrightenSeconds must be 1.0');

// B. Free cores
assert.strictEqual(R.freePlantCores.length, 2, 'must have 2 free plant cores');
assert.strictEqual(R.freeZombieCores.length, 2, 'must have 2 free zombie cores');
assert.deepStrictEqual(R.freePlantCores[0], {row:1,col:0}, 'first twin at 2-1');
assert.deepStrictEqual(R.freePlantCores[1], {row:3,col:0}, 'second twin at 4-1');

// C. Mower constants
assert.strictEqual(R.mowerHomeX, -0.5, 'mowerHomeX');
assert.strictEqual(R.mowerTriggerX, -0.35, 'mowerTriggerX');
assert.strictEqual(R.houseEntryX, -0.5, 'houseEntryX');

// D. BP
assert.strictEqual(R.bp6, 'B2-P3-B2-P2', 'bp6 sequence');
assert.strictEqual(R.bp7, 'B2-P3-B2-P3', 'bp7 sequence');

// E. Target stage function (replicated from controller logic)
function targetStageFromDamage(dmg){const t=R.targetDamageStageThresholds;return dmg>=t[2]?3:dmg>=t[1]?2:dmg>=t[0]?1:0}
assert.strictEqual(targetStageFromDamage(0), 0, 'stage 0 at 0 dmg');
assert.strictEqual(targetStageFromDamage(59), 0, 'stage 0 at 59 dmg');
assert.strictEqual(targetStageFromDamage(60), 1, 'stage 1 at 60 dmg');
assert.strictEqual(targetStageFromDamage(99), 1, 'stage 1 at 99 dmg');
assert.strictEqual(targetStageFromDamage(100), 2, 'stage 2 at 100 dmg');
assert.strictEqual(targetStageFromDamage(159), 2, 'stage 2 at 159 dmg');
assert.strictEqual(targetStageFromDamage(160), 3, 'stage 3 at 160 dmg');
assert.strictEqual(targetStageFromDamage(200), 3, 'stage 3 at 200 dmg');

// F. Profile starting resources
const profile = global.S7_VERSUS_PROFILE;
assert.strictEqual(profile.economy.startingSun, 75, 'profile startingSun must be 75');
assert.strictEqual(profile.economy.startingBrain, 75, 'profile startingBrain must be 75');

console.log('✅ All TV Versus objective tests passed (22 assertions)');
