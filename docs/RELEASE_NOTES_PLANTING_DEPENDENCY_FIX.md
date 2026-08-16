# 多文件版种植链路修复

日期：2026-08-01

## 症状

点击植物卡牌并在棋盘落点后，植物实体可能已进入 `state.plants`，但植物动画脚本在启动阶段提前终止，导致植物无法正常绘制，表象为“无法种植植物”。

## 根因

旧版单文件中的函数声明会在同一脚本内提升，因此前部动画注册代码可以调用后部声明的 `finiteArray()`。拆成多个经典脚本后，`11_animation_plants.js` 与 `12_animation_zombies.js` 先于 `13_projectiles_effects.js` 执行，后置模块中的公共函数尚未声明，动画注册因 `ReferenceError` 中断。

中断后，部分函数声明虽然仍存在，但相关 Manifest 常量未完成初始化，植物绘制会继续出现 `S7_USER_GRID_PLANT_MANIFEST` 初始化异常。

## 修复

- 将 `finiteArray()` 与 `finitePositive()` 移入 `00_bootstrap.js`，与 `finiteNumber()` 一起作为前置公共输入保护函数。
- 从 `13_projectiles_effects.js` 删除原定义，保持全工程单一定义，不增加兼容覆写层。
- 在最终运行时自检中增加模块依赖、卡牌种植和植物绘制检查。

## 验收

- 启动阶段无未捕获 JavaScript 异常。
- 点击寒冰射手卡牌后，点击空格可创建对应植物。
- `state.plants` 数量增加，落点、植物类型正确。
- 新植物可见，`state.s7.lastRenderErrorMsg` 为空。
- 多文件版与重建单文件版均通过。
