# S7 多文件版代码结构详解

## 1. 为什么采用“有序经典脚本”

原 S7 单文件的运行代码被一个闭包包裹，内部存在大量跨领域的 `const`、`let`、函数和状态引用。若直接强制改成 ES Module，必须同时解决大量循环依赖、导入顺序和初始化时机问题，风险会远高于本次“拆包并提升可维护性”的目标。

因此本版本采用与传统 JSPVZ 更接近的组织方式：

- 多个普通 `<script>` 文件按固定顺序加载；
- 文件之间共享浏览器全局词法环境；
- 每个文件启用严格模式；
- 不新增 monkey patch 或末尾覆写层；
- 后续可在模块边界稳定后，再逐步迁移到 namespace 或 ES Module。

这是一种**结构拆分**，不是规则重写。

## 2. 运行入口

`index.html` 是唯一开发入口，加载顺序如下：

```text
main.css
00_asset_paths.js
00_bootstrap.js
10_animation_core.js
11_animation_plants.js
12_animation_zombies.js
13_projectiles_effects.js
20_config_rules.js
21_entity_registry.js
30_state_geometry.js
31_query_collision.js
40_projectiles_helpers.js
50_plant_simulation.js
51_damage_combat.js
60_zombie_simulation.js
70_rendering.js
80_ui_quad.js
90_s7_progression.js
91_s7_elements_shooting.js
92_s7_plant_actions.js
93_s7_special_systems.js
94_s7_blind_commands_main.js
```

脚本顺序同时记录在 `config/script-order.json`。不要只改 `index.html` 而不更新该文件。

## 3. JavaScript 模块职责

### `00_asset_paths.js`

开发版资源路径适配器。单文件发布版会用构建器替换为 Base64 内嵌资源解析器。

### `00_bootstrap.js`

负责：

- 设备、iOS、移动端和横竖屏识别；
- Canvas 和 DPR；
- 固定帧常量；
- 全局 UI 状态；
- 多宫格启动参数；
- 通用数值保护函数。

多文件版增加了 `QUAD_DOCUMENT_BASE`。多宫格使用 `srcdoc` 或 Blob 复制页面时，借助 `<base href>` 继续正确加载外部脚本、样式和资源。

### `10_animation_core.js`

负责：

- `S7_SPRITES` 资源注册和延迟解码；
- `S7_ANIM` 动画 clip、layer、track 和 event；
- 25Hz 确定性动画时钟；
- Canvas 动画姿态应用。

动画只负责视觉时间轴，不应成为战斗伤害的唯一真值。

### `11_animation_plants.js`

植物动画接入层：

- JSPVZ 植物动画；
- 视频提取的待机/技能双片段；
- UserGrid 4×2 精灵图接口；
- 玉米投手和特殊植物动画。

### `12_animation_zombies.js`

僵尸动画接入层：

- 普通僵尸和装备分层；
- JSPVZ 特殊僵尸；
- 用户补充动画包；
- 植物头僵尸共用身体 + 独立头部；
- 僵尸尺寸归一化。

### `13_projectiles_effects.js`

视觉弹体和效果：

- `S7_B06_PROJECTILE_MANIFEST`；
- `S7_PROJECTILE_SPRITES`；
- 机枪射手视频攻击动画；
- 大喷菇、忧郁菇等素材包特效；
- 子弹按运动切线朝向，不使用自转状态机。

### `20_config_rules.js`

集中存放：

- 速度和时间常量；
- 植物规则基础配置；
- 僵尸规则基础配置；
- 生成距离和速度 profile。

数值修改应优先放在这里，不散落魔法数字。

### `21_entity_registry.js`

负责：

- `PLANTS` / `ZOMBIES` 注册；
- `makePlant()` / `makeZombie()`；
- 盲盒实体工厂；
- 新局状态 `newState()`；
- 装备和 HP 初始化。

### `30_state_geometry.js`

负责：

- 棋盘坐标；
- 网格效果；
- 行列换算；
- 基础植物查询；
- 潜水、出水等几何辅助。

### `31_query_collision.js`

负责：

- 敌我目标判断；
- 最近/最左/本行目标；
- 飞行、潜地、气球状态；
- 碰撞和保护判定。

### `40_projectiles_helpers.js`

负责：

- `addBullet()` / `addPultBullet()`；
- `S7_PLANT_RELEASE_SOCKETS`；
- `s7PlantReleaseSocket()`；
- 直射枪口和投手篮位置；
- 子弹、效果数量裁剪；
- 小伞、投掷小鬼等实体辅助。

### `50_plant_simulation.js`

负责：

- 植物被动；
- 植物事件队列；
- 植物 update；
- 植物移除和冷却；
- 部分范围辅助。

### `51_damage_combat.js`

核心战斗结算：

- `damageZombie()`；
- 击杀、经验、元素命中；
- 子弹命中；
- 火焰、冰冻、溅射；
- 巨人投掷状态机；
- 车辆/地刺交互。

### `60_zombie_simulation.js`

僵尸逻辑：

- 移动、攻击、啃食；
- 啃食判定点；
- 当前速度；
- 巨人砸击；
- 投篮车；
- 蹦极、舞王、矿工、梯子等特殊状态。

### `70_rendering.js`

全部 Canvas 绘制：

- 棋盘；
- 植物；
- 僵尸；
- 子弹；
- 特效；
- HP、经验、阶数和文字标记。

原则：绘制函数读取状态，但不得偷偷修改核心战斗规则。

### `80_ui_quad.js`

负责：

- 卡牌面板；
- 鼠标、触摸和键盘；
- V 模式；
- 多宫格；
- Worker / MessageChannel 调度；
- iframe 子平面通信。

### `90_s7_progression.js`

负责：

- `PLANT_RULES` 使用；
- 等级和经验；
- 配置刷新；
- 队伍组合；
- 死亡经验分配。

### `91_s7_elements_shooting.js`

负责：

- 元素层数；
- 元素衰减；
- `s7Shoot()`；
- 统一直射出弹点；
- 特殊弹道和延迟射击。

### `92_s7_plant_actions.js`

主要植物主动动作：

- 大喷菇、忧郁菇；
- 向日葵；
- 机枪；
- 三叶草；
- 大嘴花；
- 窝瓜；
- 大麦等。

### `93_s7_special_systems.js`

负责：

- 三线大招；
- S7 推车；
- 炮塔；
- 持续性场上系统。

### `94_s7_blind_commands_main.js`

最后加载：

- 盲盒结果；
- 指令僵尸；
- 站位校验；
- `S7Final` 自检；
- `wire()` 事件绑定和启动。

这个文件是启动终点，不应成为“所有临时补丁都放这里”的垃圾桶。

## 4. 状态与帧模型

核心状态为 `state`，固定逻辑帧：

```javascript
FIXED_FRAME_DT = 0.04
```

即每秒 25 个逻辑帧。性能优化可以降低 DPR、减少视觉粒子、延迟图片解码，但不得改变这个规则时钟。

## 5. 关键注册表

- `PLANTS`：植物基础定义。
- `ZOMBIES`：僵尸基础定义。
- `PLANT_RULES`：S7 等级和特性参数。
- `S7_SPRITES`：图片资源注册。
- `S7_ANIM`：动画 clip 注册。
- `S7_B06_PROJECTILE_MANIFEST`：弹体视觉。
- `S7_FINAL_ZOMBIE_MANIFEST`：仅补充 JSPVZ 没有正式动画的僵尸。
- `S7_PLANT_HEAD_ZOMBIES`：植物头僵尸映射。
- `S7_PLANT_RELEASE_SOCKETS`：枪口/投掷篮坐标。

## 6. 资源结构

`assets/` 保留原运行路径，避免在拆包时再次大规模重命名导致注册表断裂。完整资源索引位于：

```text
config/asset-manifest.json
```

每个条目包含路径、MIME、大小和拆包时 SHA-256。

## 7. 设计约束

- 不在后加载文件重复声明同名 `const` / `let`。
- 不通过“保存旧函数再包装”的方式修规则。
- 不在渲染层制造伤害或经验。
- 不用动画 frame 代替逻辑定时器。
- 同一配置只保留一个权威表。
