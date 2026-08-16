import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const jsDir = path.join(root, 'src', 'js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// 1) Execute only the self-contained Battle RNG block from bootstrap.
const bootstrap = read('src/js/00_bootstrap.js');
const begin = bootstrap.indexOf('// S7_BATTLE_RNG_BEGIN');
const endMarker = '// S7_BATTLE_RNG_END';
const end = bootstrap.indexOf(endMarker);
assert.ok(begin >= 0 && end > begin, 'Battle RNG block markers are missing');
const rngBlock = bootstrap.slice(begin, end + endMarker.length);

const context = {
  Math,
  Number,
  console,
  window: { _mpBattleActive: false },
  Error,
};
vm.createContext(context);
vm.runInContext(rngBlock, context, { filename: '00_bootstrap.js#BattleRNG' });

const {
  s7SetBattleSeed,
  s7BattleRandom,
  s7BattleRnd,
  s7BattleIrnd,
  s7BattleChoose,
  s7BattleRngInfo,
} = context.window;

for (const [name, fn] of Object.entries({
  s7SetBattleSeed,
  s7BattleRandom,
  s7BattleRnd,
  s7BattleIrnd,
  s7BattleChoose,
  s7BattleRngInfo,
})) {
  assert.equal(typeof fn, 'function', `${name} is not exported`);
}

function legacyMulberry32(a) {
  let s = a >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const originalMathRandom = Math.random;
const seed = 0x71A5C0DE;

// New Battle RNG must preserve the exact legacy mulberry32 sequence.
const legacy = legacyMulberry32(seed);
s7SetBattleSeed(seed);
for (let i = 0; i < 512; i++) {
  assert.equal(s7BattleRandom(), legacy(), `legacy sequence diverged at call ${i + 1}`);
}
assert.equal(Math.random, originalMathRandom, 's7SetBattleSeed must never monkey-patch Math.random');
assert.equal(s7BattleRngInfo().calls, 512, 'call counter mismatch');

// Same seed => same battle sequence.
s7SetBattleSeed(seed);
const baseline = Array.from({ length: 128 }, () => s7BattleRandom());
s7SetBattleSeed(seed);
const replay = Array.from({ length: 128 }, () => s7BattleRandom());
assert.deepEqual(replay, baseline, 'same seed did not replay the same sequence');

// Interleaving ordinary Math.random calls must not consume the battle stream.
s7SetBattleSeed(seed);
const isolated = [];
for (let i = 0; i < 128; i++) {
  for (let j = 0; j < 17; j++) Math.random();
  isolated.push(s7BattleRandom());
  for (let j = 0; j < 11; j++) Math.random();
}
assert.deepEqual(isolated, baseline, 'ordinary Math.random changed the battle sequence');
assert.equal(Math.random, originalMathRandom, 'Math.random identity changed during seeded battle');

// Helpers must consume exactly one Battle RNG draw each.
s7SetBattleSeed(12345);
const before = s7BattleRngInfo().calls;
s7BattleRnd(2, 7);
s7BattleIrnd(2, 7);
s7BattleChoose(['a', 'b', 'c']);
assert.equal(s7BattleRngInfo().calls - before, 3, 'Battle RNG helpers must consume one draw each');

// Clearing seed restores local-game fallback behavior without touching Math.random.
s7SetBattleSeed(null);
assert.equal(s7BattleRngInfo().active, false);
assert.equal(Math.random, originalMathRandom);

// Missing seed during an active multiplayer battle must fail loudly instead of silently desyncing.
context.window._mpBattleActive = true;
assert.throws(() => s7BattleRandom(), /active without a seeded battle RNG/);
context.window._mpBattleActive = false;

// 2) Static guard: battle-state modules may not use the generic/global RNG APIs.
const battleModules = [
  '20_config_rules.js',
  '21_entity_registry.js',
  '31_query_collision.js',
  '50_plant_simulation.js',
  '51_damage_combat.js',
  '60_zombie_simulation.js',
  '90_s7_progression.js',
  '91_s7_elements_shooting.js',
  '92_s7_plant_actions.js',
  '93_s7_special_systems.js',
  '94_s7_blind_commands_main.js',
];

for (const file of battleModules) {
  const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
  assert.ok(!/Math\.random\s*\(/.test(src), `${file}: direct Math.random is forbidden in battle-state code`);
  assert.ok(!/(?<![\w$])(?:rnd|irnd|choose)\s*\(/.test(src), `${file}: generic rnd/irnd/choose is forbidden in battle-state code`);
  assert.ok(!/\b(?:async|await|setTimeout|setInterval|Promise)\b/.test(src), `${file}: asynchronous battle-state execution is forbidden; use the fixed logic tick/event queue`);
}

const battleMode = read('src/js/96_battle_mode.js');
assert.ok(!/Math\.random\s*=/.test(battleMode), '96_battle_mode.js must not assign to Math.random');
assert.ok(!/_origRandom/.test(battleMode), 'legacy _origRandom monkey-patch state must be removed');
assert.ok(!/function\s+mulberry32\s*\(/.test(battleMode), 'Battle RNG implementation must have a single owner');

const directRandomFiles = [];
for (const file of fs.readdirSync(jsDir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
  if (/Math\.random\s*\(/.test(src)) directRandomFiles.push(file);
}
const allowedDirectRandom = new Set(['00_bootstrap.js', '13_projectiles_effects.js', '96_battle_mode.js']);
for (const file of directRandomFiles) {
  assert.ok(allowedDirectRandom.has(file), `${file}: unexpected direct Math.random usage escaped RNG domain audit`);
}

console.log(JSON.stringify({
  ok: true,
  deterministicCompatibilityCalls: 512,
  isolationCalls: 128,
  battleModulesAudited: battleModules.length,
  directMathRandomAllowedOnlyIn: [...allowedDirectRandom],
  mathRandomMonkeyPatchRemoved: true,
}, null, 2));
