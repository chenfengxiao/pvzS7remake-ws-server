# S丐 v1.5.8 联机核心加固（2026-08-16）

## 架构约束

本次明确不加入战斗过程的持续/实时同步。

联机战斗保持：

1. 开战前同步房间、路线、BP、阵型、seed、速度等必要输入；
2. `battleStart` 后各客户端继续本地独立模拟；
3. 服务器不广播僵尸位置、生命值、植物状态、子弹、时间轴等战斗过程快照；
4. 战斗结束后才允许上报/广播结算类数据。

短暂掉线恢复只恢复 WebSocket 会话身份，不恢复或追帧战斗状态。

## 本次修复

- 新增 sessionToken，会话断线后 120 秒内可恢复原 playerId / roomId / lane / ready / formation 等房间身份。
- 修复“在房间中断线后客户端不自动重连”的问题。
- 修复 joinRoom 在密码校验前清理同昵称玩家的问题；错误密码不再能影响房间内玩家。
- 同昵称普通 join 不再替换旧玩家；断线恢复必须使用 sessionToken。
- 观战者不再计入房间 maxPlayers / playerCount。
- 没有正式玩家时房间自动关闭，观战者不能继承房主。
- 准备阶段玩家真正离开时，选路/BP 会回到 lobby 重置，避免残留 playerId 把流程卡死。
- 同时制 BP 当前阶段未 reveal 前，服务器按每个接收者生成视图；对手当前选择不会下发到客户端。
- 修复同时制 BP 第二个 Ban/Pick 阶段被历史累计数量错误阻塞的问题。
- BP action 强制校验 action 与当前 phase.type 一致。
- assign 目标由服务器计算，客户端不能伪造 targetPlayerId。
- 服务端白名单校验 plantKey。
- BP 完成后服务器保存应得的 5 株植物，uploadFormation 只能重排，不能偷换。
- 普通阵型也校验合法植物与 legacy ban。
- 观战者不能提交 battleResult；结算只等待正式玩家。
- battleResult 只接受 lane0..lane4 的有限非负数值。
- 修复 finished 后旧的房间删除 timer 在 rematch 后仍然生效的问题。
- WebSocket maxPayload 限制为 64 KiB。
- 观战连接也纳入心跳，避免僵尸观战连接无限残留。
- 修复一个 ban 显示昵称未 escape 的 HTML 注入入口。

## 未做的事情

- 没有加入战斗中的实时状态同步。
- 没有把 rooms/conns 迁移到 Redis；仍建议 Railway 保持单 Replica。
- 没有把排行榜改为服务端权威统计；现有 uploadStats 仍属于客户端声明式数据。
- 没有重构全局 Math.random 的战斗 RNG；这是后续值得单独处理的确定性风险。

## 本地验证

`python3 tools/verify_project.py`：349 assets / 22 scripts / 0 errors / 0 warnings。

`node tools/test_multiplayer_hardening.mjs` 已通过：

- auth-order-and-nick
- session-resume
- blind-bp-privacy-and-multiphase
- bp-formation-validation
- spectator-finish
- rematch-timer

HTTP `/health` 与 WebSocket 本地同端口启动验证通过。
