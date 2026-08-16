# S7 开发指南

## 1. 修改现有规则

1. 在 `docs/ARCHITECTURE.md` 找到职责模块。
2. 搜索原函数定义，而不是在后面追加同名函数。
3. 修改完成后执行：

```bash
python3 tools/verify_project.py
```

4. 启动开发服务器，至少测试普通渲染和 V 时间轴渲染。

## 2. 新增植物

1. 在 `21_entity_registry.js` 注册基础实体。
2. 在 `90_s7_progression.js` 对应规则表中维护等级参数。
3. 将贴图放入合适的 `assets/plants_*` 目录。
4. 在 `11_animation_plants.js` 注册资源和 clip。
5. 在植物动画 resolver 中映射状态。
6. 射手在 `40_projectiles_helpers.js` 的 `S7_PLANT_RELEASE_SOCKETS` 中维护枪口坐标。
7. 主动技能落在 `92_s7_plant_actions.js`，不要写进绘制函数。

## 3. 新增僵尸

1. 在 `21_entity_registry.js` 的 `ZOMBIES` 中注册属性。
2. 先检查 JSPVZ 和既有动画是否已有正式资源。
3. 只有原先完全缺动画的类型才加入 `S7_FINAL_ZOMBIE_MANIFEST`。
4. 在 `12_animation_zombies.js` 映射视觉状态。
5. 在 `60_zombie_simulation.js` 实现特殊行为。
6. 尺寸遵循：普通人形统一；车辆略大；巨人更大；巨大化巨人最大。

## 4. 新增子弹

1. 将 atlas 放入 `assets/projectiles_b06/`。
2. 更新 `13_projectiles_effects.js` 中的 manifest。
3. 在 `s7ProjectileRegistryKey()` 中维护 `bullet.kind` 映射。
4. 运动方向使用 `renderDx/renderDy`，禁止恢复无意义自转。
5. 出弹点必须走 `s7PlantReleaseSocket()`。

## 5. 动画精灵图规范

- 同一单位不同 clip 共用固定根锚点。
- 不按特效或投射物 alpha bbox 自动居中。
- atlas 的 `frameWidth`、`frameHeight`、`columns`、`frameCount` 必须与实际图片一致。
- 动画时间轴只表现状态，不独立决定伤害发生。

## 6. 调试命令

浏览器控制台：

```javascript
S7Final.selfTest()
S7Final.loadVisualAssets()
S7Final.assetStatus()
S7Final.visualSmokeTest()
```

## 7. 文件命名

脚本文件前缀代表加载阶段：

- `00`：启动
- `10`：动画
- `20`：配置和注册
- `30`：状态和查询
- `40`：子弹辅助
- `50`：植物和伤害
- `60`：僵尸
- `70`：渲染
- `80`：UI
- `90`：S7 特性

新增文件应放在正确阶段，并同步更新 `config/script-order.json` 和 `index.html`。
