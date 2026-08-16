# S丐 v1.5.8 Battle RNG 隔离重构（2026-08-16）

## 目标

联机战斗继续采用“同种子 + 本地独立模拟”，**不增加任何战斗过程实时同步、状态快照同步或追帧同步协议**。

本次只重构随机数域：

- 所有会改变战斗状态/结果的随机行为统一走一条 `Battle RNG`。
- UI、视觉、自检、联机大厅、浏览器 ID 等继续走普通 `Math.random()`。
- 禁止通过 `Math.random = ...` 全局覆写来实现联机确定性。

## 结构

公共接口位于 `src/js/00_bootstrap.js`：

- `s7SetBattleSeed(seed)`：设置/清除联机战斗种子。
- `s7BattleRandom()`：战斗 [0,1) 随机数。
- `s7BattleRnd(a,b)`：战斗区间随机数。
- `s7BattleIrnd(a,b)`：战斗整数随机数。
- `s7BattleChoose(array)`：战斗随机选项。
- `s7BattleRngInfo()`：只读诊断信息（seed、调用次数等）。

未设置 Battle seed 时，上述战斗 API 回退到普通 `Math.random()`，因此普通单机玩法保持原随机行为。

联机战斗开始后，若 `_mpBattleActive === true` 但 Battle RNG 没有 seed，`s7BattleRandom()` 会直接抛错。这样宁可明确暴露框架错误，也不允许静默切回 `Math.random()` 后造成双方悄悄失步。

## 迁移范围

以下战斗状态模块中的直接 `Math.random()`、`rnd()`、`irnd()`、`choose()` 已全部迁移到 Battle RNG：

- `20_config_rules.js`
- `21_entity_registry.js`
- `31_query_collision.js`
- `50_plant_simulation.js`
- `51_damage_combat.js`
- `60_zombie_simulation.js`
- `90_s7_progression.js`
- `91_s7_elements_shooting.js`
- `92_s7_plant_actions.js`
- `93_s7_special_systems.js`
- `94_s7_blind_commands_main.js`

`96_battle_mode.js` 删除旧的 `Math.random` monkey-patch，只在 `_setupBattle()` 中调用 `s7SetBattleSeed(seed)`。

## 维护硬规则

后续新增任何**会改变战斗状态或战斗结果**的随机逻辑，不得直接调用：

```js
Math.random()
rnd(...)
irnd(...)
choose(...)
```

必须使用 Battle RNG API。

纯视觉/UI/大厅/ID/自检随机禁止使用 Battle RNG，以免无意义地消费确定性序列。

战斗延迟机制仍应进入逻辑帧/事件队列，不要用 `setTimeout`/`Promise` 来异步修改 battle state。

## 验证

`tools/test_battle_rng_isolation.mjs` 会验证：

1. 新 Battle RNG 与原来的 mulberry32 数值序列完全兼容。
2. 普通 `Math.random()` 无论调用多少次都不会推进 Battle RNG。
3. 设置种子不会修改 `Math.random` 函数本身。
4. Battle RNG helper 每次只消费一次随机数。
5. 联机战斗缺失 seed 会明确报错。
6. 战斗状态模块中不允许重新出现直接 `Math.random/rnd/irnd/choose`。
7. `96_battle_mode.js` 不允许重新出现 `Math.random = ...` monkey-patch。
8. 战斗状态模块不允许出现 `async/await/setTimeout/setInterval/Promise`；延迟战斗行为继续走固定逻辑 Tick / 事件队列。
