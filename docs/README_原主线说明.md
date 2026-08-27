# 🌿 S丐版 1.7.1

**植物大战僵尸-时空版 S7 联机对战版** — 多人在线斗蛐蛐，7 种 BP 模式，观战系统，积分排行。

---

## 🚀 当前版本

**v1.7.1**（三服联机启动版：1服 Railway / 2服家庭反向隧道 / 3服 Secure MQTT）

- 联机 WebSocket 服务：`wss://pvzs7remake-ws-server-production.up.railway.app`（Railway 部署）
- 2服：iMac `server.js` 权威服务 + 反向 MQTT/WSS 隧道；公网 IPv6 直连仅作备用
- 3服：Secure MQTT 灾备服；不做战斗过程实时同步
- 推荐运行入口：`dist/S7_FAST_ENTRY.html`（已重新构建为 v1.7.1，外部 assets）

---

## 🎮 联机功能

### 房间系统
- 创建/加入/密码保护房间，大厅浏览
- 2-5 人联机，观战者支持（可开关）
- 房主踢人、倍速控制、结束条件切换
- 断线重连 + 僵尸检测（4 分钟超时）

### 7 种 BP 模式

| 模式 | 说明 |
|------|------|
| **532** | 随机 5 选 3 → 自由选 2（支持 Ban 选） |
| **42421** | 随机 4 选 2 → 随机 4 选 2 → 自由选 1（支持 Ban 选） |
| **51x5** | 5 轮随机 5 选 1 |
| **双人 BP（轮流）** | 随机先手，轮流 Ban/Pick，18 步序列 |
| **无先手双人 BP** | 盲选同时制，提交后揭示 |
| **多人 BP** | 3-5 人，指派+Ban+Pick |
| **带指定双人 BP** | 互指 → Ban → Pick |

### 观战系统
- 开启观战的房间可随时加入观看
- 上帝视角查看所有玩家操作（指派/Ban/Pick/阵型）
- 观战者不参与僵尸检测、不发送心跳

### 积分系统
- 2-5 人积分表（第 1 名 12 分递减）
- 本地战绩存储（localStorage），上传至服务端
- 排行榜（按积分/场次/平均分排序）
- 浏览器 ID 绑定防冒名上传

---

## 🛠️ BattleRNG 隔离（v1.6.0）

- 不再 monkey-patch `Math.random`
- 专用 API：`s7BattleRandom()` / `s7BattleRnd()` / `s7BattleIrnd()` / `s7BattleChoose()`
- 联机无 seed 时报错，防止静默失步
- 13 个战斗模块全迁移，mulberry32 序列逐项兼容

---

## 🎯 版本分界线

同组分界线的版本可互进（只警告不阻止），跨组不可互进：

| 组 | 范围 |
|----|------|
| 0 | < 1.4.2 |
| 1 | 1.4.2 — 1.5.0 |
| 2 | 1.5.1 — 1.5.4 |
| 3 | 1.5.5 — 1.5.6 |
| 4 | 1.5.7 |
| 5 | 1.5.8 |
| 6 | 1.5.9 |
| 7 | ≥ 1.6.0 |

---

## 📦 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| 1.6.1 | 2026-08-16 | 冷启动提示 |
| 1.6.0 | 2026-08-16 | BattleRNG 彻底重构 |
| 1.5.9 | 2026-08-16 | 联机核心加固 |
| 1.5.8 | 2026-08-16 | 寒意 2 层、投篮车 0.6s 前摇、高伞不挡气球、Docker 部署 |
| 1.5.7 | 2026-08-16 | 阳光菇攻击气球 |
| 1.5.6 | 2026-08-16 | 后局全员结束检测 |
| 1.5.5 | 2026-08-15 | 阵型编辑器、BP 揭示保持、多补丁修复 |
| 1.5.1 | 2026-08-14 | 4 种新 BP 模式 + 以 pick 代 ban |
| 1.4.2 | 2026-08-13 | 盲盒路障 370 血、版本分组 |
| 1.3.0 | 2026-08-12 | 积分系统 + 排行榜 |

---

## 🏗️ 项目结构

```
S丐版_临界值调整版/
├── index.html                 # 多文件入口
├── src/js/                    # 22 个 JS 源文件
│   ├── 96_battle_mode.js      # 联机客户端（大厅/房间/BP/战斗/观战）
│   ├── 92_s7_plant_actions.js # 植物行动（含阳光菇气球攻击）
│   ├── 60_zombie_simulation.js# 僵尸模拟（魅惑互啃、投篮车前摇）
│   └── ...                    # 更多核心模块
├── server/
│   ├── server.js              # Node.js WebSocket 服务端
│   ├── Dockerfile             # Railway Docker 部署
│   └── package.json           # 独立依赖
├── tools/
│   ├── build_singlefile.py    # 单文件构建工具（Python）
│   └── test_battle_rng_isolation.mjs
├── dist/                      # 构建产物
├── docs/                      # 设计文档
├── Dockerfile                 # Railway 根 Docker 部署
├── railway.json               # Railway 配置
└── package.json               # 根工程配置
```

---

## 🔧 开发

```bash
# 启动本地开发服务器
python3 start_dev.py
# http://127.0.0.1:8000/index.html

# 构建单文件版
python3 tools/build_singlefile.py
# → dist/S7_REBUILT_SINGLEFILE_v1.6.1.html

# 本地启动 WebSocket 服务端
node server/server.js
```

---

## 📡 服务端

- **平台**：Railway（Docker 部署）
- **地址**：`wss://pvzs7remake-ws-server-production.up.railway.app`
- **端口**：`process.env.PORT`（Railway 自动分配，默认 3000）
- **健康检查**：`GET /health` → 200 OK
- **GitHub**：`chenfengxiao/pvzS7remake-ws-server`

---

## 📋 维护原则

1. `config/script-order.json` 是脚本加载顺序的唯一真值
2. 不在末尾覆写同名函数；直接在职责模块内重构
3. 动画只负责表现，规则和伤害仍由战斗模块决定
4. 固定逻辑帧 0.04 秒（25 FPS），性能优化不跳过逻辑帧
5. 多文件源码上工作，修改后运行 `build_singlefile.py` 生成单文件
6. 减法重构：提取共用函数、删除死代码、无覆写层
7. BattleRNG 专用 API 替代 Math.random 用于战斗随机