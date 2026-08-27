"use strict";

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / newState

    // [原源码行 3024] 向日葵的第一次生产也必须遵守文档中的完整生产间隔，

    // [原源码行 3025] 不能像攻击植物一样在开局0~0.25秒内立即触发。

    // -----------------------------------------------------------------------------

    function newState(random = false) {
      uid = 1;
      frameAcc = 0;
      last = performance.now();
      const night = true;
      const allowStack = document.getElementById("allowStackMode")?.checked !== false;
      state = {
        time: 0,
        frame: 0,
        running: false,
        battle: false,
        preRun: false,
        paused: false,
        // endMode: "allDead"=全部淘汰结束（默认）；"lastLane"=仅剩一路存活结束。
        endMode: "allDead",
        night: night,
        allowStack: allowStack,
        speed: 1,
        uiTick: 0,
        sun: 0,
        plants: [],
        zombies: [],
        bullets: [],
        effects: [],
        logs: [],
        teams: [],
        tool: "plant",
        gridEffects: [],
        iceTrails: [],
        rakes: [],
        pendingPlantEvents: [],
        spawnMode: "S7",
        s7: {
          season: "S7",
          turrets: [],
          summons: [],
          sunflowerSuns: [],
          validated: false,
          commands: s7EmptyCommandCounts(),
          commandsByRow: Array.from({
            length: ROWS
          }, () => s7EmptyCommandCounts()),
          lastCommandLog: 0
        }
      };
      for (let r = 0; r < ROWS; r++) {
        state.teams.push({
          row: r,
          name: TEAM_NAMES[r],
          alive: true,
          defeatAt: null,
          spawn: 5,
          blindKills: 0,
          transforms: 0,
          kills: 0,
          noCritKills: 0,
          damage: 0,
          rakes: []
        });
        const arr = random ? s7RandomRowKeys(r, 0, 5, {
          autoValid: randomAutoValid,
          basePlants: state.plants
        }) : DEFAULT_TEAMS[r];
        arr.forEach((k, c) => state.plants.push(makePlant(k, r, c)))
      }
      for (const p of state.plants) s7InitPlant(p, true);
      updateModePill();
      log("S丐版 1.0：飞升、五元素、盲盒递归、密度出怪、指令/变种僵尸与测试按键已启用。")
    }

    // -----------------------------------------------------------------------------

    // UI状态/几何 / addGridEffect

    // [原源码行 3096] UI state helpers and board geometry

    // -----------------------------------------------------------------------------

    function addGridEffect(row, col, color, duration, stacking = false) {
      if (!state) return;
      row = Math.round(finiteNumber(row, -99));
      col = Math.round(finiteNumber(col, -99));
      duration = finitePositive(duration, .2);
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      state.gridEffects = finiteArray(state.gridEffects);
      const existing = state.gridEffects.find(e => e.row === row && e.col === col && e.color === color);
      if (existing) {
        existing.intensity = Math.min((existing.intensity || .35) + (stacking ? .3 : .18), 1);
        existing.ttl = Math.max(existing.ttl, duration);
        existing.max = Math.max(existing.max, duration);
        existing.stacking = existing.stacking || stacking
      } else {
        state.gridEffects.push({
          row: row,
          col: col,
          color: color,
          ttl: duration,
          max: duration,
          intensity: stacking ? .3 : .55,
          stacking: stacking
        });
        if (state.gridEffects.length > PERF.MAX_GRID_EFFECTS) state.gridEffects.splice(0, state.gridEffects.length -
          PERF.MAX_GRID_EFFECTS)
      }
    }

    function updateGridEffects(dt) {
      state.gridEffects = finiteArray(state.gridEffects);
      for (const e of state.gridEffects) {
        e.ttl = finiteNumber(e.ttl, 0) - dt;
        e.max = finitePositive(e.max, Math.max(.1, e.ttl));
        if (e.stacking && e.ttl > 0) {
          e.intensity = Math.max(.1, finiteNumber(e.intensity, .35) * (e.ttl / e.max))
        }
      }
      state.gridEffects = state.gridEffects.filter(e => e && e.ttl > 0 && e.row >= 0 && e.row < ROWS && e.col >= 0 && e
        .col < COLS)
    }

    function updateModePill() {
      if (!state) return;
      const sb = document.getElementById("stackBtn");
      if (sb) sb.textContent = "叠种：" + (state.allowStack ? "开" : "关")
    }

    function log(msg) {
      state.logs.unshift({
        t: state.time,
        msg: msg
      });
      state.logs = state.logs.slice(0, 60)
    }

    function resize() {
      const metrics = applyRuntimeDeviceClasses();
      const vw = metrics.width;
      const vh = metrics.height;
      const portrait = MOBILE_DEVICE ? vh > vw : vw <= 900 && vh > vw;
      const safe = safeAreaInsets();
      DPR = preferredCanvasDpr();
      syncCanvasBackingStore(vw, vh, DPR);
      document.documentElement.style.setProperty("--app-width", vw + "px");
      document.documentElement.style.setProperty("--app-height", vh + "px");
      if (!QUAD_CHILD_MODE && (document.body.classList.contains("versusBattleActive") || state?.versus?.active)) {
        document.documentElement.style.removeProperty("--portrait-split");
        const topReserve = vw < 760 ? 138 : 88;
        const left = safe.left + 8;
        const availW = Math.max(220, vw - safe.left - safe.right - 16);
        const availH = Math.max(160, vh - safe.top - safe.bottom - topReserve - 8);
        const cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        layout.cell = Math.max(vw < 760 ? 24 : 38, cell);
        layout.w = layout.cell * COLS;
        layout.h = layout.cell * ROWS;
        layout.x = Math.max(left, Math.floor((vw - layout.w + safe.left - safe.right) / 2));
        layout.y = Math.max(safe.top + topReserve, Math.floor(safe.top + topReserve + (availH - layout.h) / 2));
        return
      }
      if (QUAD_CHILD_MODE) {
        const houseMargin = Math.max(10 + safe.left, Math.floor(vw * .055));
        const availW = Math.max(80, vw - houseMargin - safe.right - 4);
        const availH = Math.max(80, vh - safe.top - safe.bottom - 4);
        const cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        layout.cell = Math.max(8, cell);
        layout.w = layout.cell * COLS;
        layout.h = layout.cell * ROWS;
        layout.x = Math.max(houseMargin, Math.floor((vw - layout.w + houseMargin - safe.right) / 2));
        if (layout.x + layout.w > vw - safe.right - 2) layout.x = Math.max(safe.left + 2, vw - safe.right - layout.w - 2);
        layout.y = Math.max(safe.top + 2, Math.floor((vh - layout.h + safe.top - safe.bottom) / 2));
        return
      }
      if (portrait) {
        const split = Math.max(250, Math.floor(vh * .48));
        document.documentElement.style.setProperty("--portrait-split", split + "px");
        if (!document.body.classList.contains("opsOpen") && !document.body.classList.contains("cardsOpen") && !document.body.classList.contains("rankOpen")) document.body.classList.add("opsOpen");
        const availW = Math.max(280, vw - safe.left - safe.right - 12);
        const availH = Math.max(150, split - safe.top - 54);
        const cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        layout.cell = Math.max(24, cell);
        layout.w = layout.cell * COLS;
        layout.h = layout.cell * ROWS;
        layout.x = Math.max(safe.left + 6, Math.floor((vw - layout.w + safe.left - safe.right) / 2));
        layout.y = Math.max(safe.top + 42, Math.floor((split - layout.h + safe.top) / 2) + 8)
      } else if (MOBILE_DEVICE) {
        document.documentElement.style.removeProperty("--portrait-split");
        const sideReserve = Math.max(218, Math.min(300, vw * .31)) + safe.right;
        const left = safe.left + 6;
        const top = safe.top + 6;
        const availW = Math.max(180, vw - sideReserve - left - 12);
        const availH = Math.max(140, vh - safe.top - safe.bottom - 12);
        const cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        layout.cell = Math.max(24, cell);
        layout.w = layout.cell * COLS;
        layout.h = layout.cell * ROWS;
        layout.x = Math.max(left, Math.floor(left + (availW - layout.w) / 2));
        layout.y = Math.max(top, Math.floor(top + (availH - layout.h) / 2))
      } else {
        document.documentElement.style.removeProperty("--portrait-split");
        const panel = 430;
        const availW = vw - panel - 24;
        const availH = vh - 70;
        const cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        layout.cell = Math.max(38, cell);
        layout.w = layout.cell * COLS;
        layout.h = layout.cell * ROWS;
        layout.x = Math.max(8, Math.floor((availW - layout.w) / 2) + 8);
        layout.y = Math.max(50, Math.floor((vh - layout.h) / 2))
      }
    }

    // -----------------------------------------------------------------------------

    // UI状态/几何 / cx

    // [原源码行 3166] 多宫格中的每个子图仍使用完整5行×9可种植列（另含第10列进场区）。

    // [原源码行 3167] 子窗口很窄时允许格子继续缩小，避免最右列被裁掉。

    // [原源码行 3200] 电脑与手机横屏继续使用原来的右侧三面板布局。

    // -----------------------------------------------------------------------------

    function cx(col) {
      return layout.x + (col + .5) * layout.cell
    }

    function cy(row) {
      return layout.y + (row + .5) * layout.cell
    }

    function boardToCell(px, py) {
      const col = Math.floor((px - layout.x) / layout.cell),
        row = Math.floor((py - layout.y) / layout.cell);
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) return {
        row: row,
        col: col
      };
      return null
    }

    function plantLayer(p) {
      const d = PLANTS[p.key];
      if (d.pumpkin) return 3;
      if (d.ground) return 0;
      if (d.block) return 2;
      return 1
    }

    function plantRank(p) {
      return plantLayer(p) * 1e5 + (p.order || 0) + (p.id || 0) / 1e5
    }

    function plantStack(row, col) {
      const s = [];
      for (const p of finiteArray(state.plants)) {
        if (!p.dead && p.row === row && p.col === col) s.push(p)
      }
      s.sort((a, b) => plantRank(b) - plantRank(a));
      return s
    }

    function zombieCanTargetPlant(p) {
      return !!(p && !p.dead && !p.s7?.barleyPepperDormant && !PLANTS[p.key]?.zombieIgnore && !(p.key === "scaredy" && p
        .s7?.hiding))
    }

    // 低矮与地面植物是两个不同概念：
    // - ground 决定叠种层级与普通僵尸是否能啃到；
    // - lowProfile 只决定僵尸豌豆类远程子弹是否能索敌/碰撞。
    // 土豆地雷必须能被普通僵尸啃咬，因此不能错误地标成 ground。
    function plantHasLowProjectileProfile(p) {
      const rule = p ? PLANTS[p.key] : null;
      return !!(rule?.ground || rule?.lowProfile)
    }

    // 窝瓜运行时姿态统一入口：所有“是否落地、是否在本体格、能否被远程豆/普通啃咬”
    // 都从这里读取，禁止在植物索敌、子弹碰撞和伤害入口分别猜测动画阶段。
    function s7SquashRuntimePose(p) {
      const homeX = finiteNumber(p?.col, 0) + .5;
      const currentX = finiteNumber(p?.s7?.squashCurX, homeX);
      const yOffset = Math.max(0, finiteNumber(p?.s7?.squashYOffset, 0));
      const runtimeCol = Math.max(0, Math.min(PLANT_COLS - 1, Math.floor(clamp(currentX, 0, PLANT_COLS - .001))));
      return {
        homeX: homeX,
        currentX: currentX,
        yOffset: yOffset,
        grounded: yOffset <= 1e-9,
        atHomeCell: runtimeCol === Math.max(0, Math.min(PLANT_COLS - 1, finiteNumber(p?.col, 0)))
      }
    }

    function s7SquashProjectileVulnerable(p) {
      if (!p || p.dead || p.key !== "squash" || !p.s7?.squashAway) return false;
      const stateName = p.s7.squashState;
      // 连砸锁定阶段：窝瓜已经落地，允许僵尸豌豆等远程子弹命中。
      if (stateName === "targeting") return s7SquashRuntimePose(p).grounded;
      // 下落阶段从开始下降到触地均可被子弹命中；上升/横移阶段仍不可命中。
      if (stateName === "attacking" && p.s7.squashAttackSub === "fall") return true;
      // 攻击落地后的等待返回阶段已经在地面，允许远程子弹命中。
      return stateName === "returning" && p.s7.squashReturnSub === "wait" && s7SquashRuntimePose(p).grounded
    }

    function s7SquashBiteVulnerableAtHome(p, zombie = null) {
      if (!p || p.dead || p.key !== "squash" || !p.s7?.squashAway) return false;
      if (zombie && (!s7IsOrdinaryBiteSource(zombie) || canZombiePassPlant(zombie))) return false;
      const pose = s7SquashRuntimePose(p);
      // 只要攻击循环中的窝瓜已经在自己的原始格内落地，就恢复普通啃咬目标资格。
      // 在外格落地仍保持“只能被远程子弹命中”，不会把啃咬范围跟着窝瓜移动。
      return pose.grounded && pose.atHomeCell
    }

    function plantProjectileX(p) {
      if (p?.key === "squash" && p.s7?.squashAway && Number.isFinite(p.s7?.squashCurX)) return p.s7.squashCurX;
      return finiteNumber(p?.col, 0) + .5
    }

    function zombieProjectileCanHitPlant(p, bullet = null) {
      if (!zombieCanTargetPlant(p)) return false;
      if (bullet && isPeaLikeBullet(bullet) && plantHasLowProjectileProfile(p)) return false;
      if (p.key === "squash" && p.s7?.squashAway) return s7SquashProjectileVulnerable(p);
      return true
    }

    function zombiePeaCanTargetPlant(p) {
      // 开火前索敌与已经离手的豌豆必须使用同一套命中资格。
      // 否则僵尸会把处于窝瓜上升/横移等不可受击阶段的目标视为有效目标，
      // 虽然子弹最终会穿过，却会造成错误开火、CD消耗和表现不一致。
      return zombieProjectileCanHitPlant(p, {
        kind: "pea",
        zombieBullet: true
      })
    }

    function topPlantInCell(row, col, opts = {}) {
      let best = null,
        bestRank = -Infinity,
        laddered = false;
      const z = opts.zombie;
      for (const p of state.plants) {
        if (p.dead || p.s7?.fakeDeath > 0 || p.s7?.deathPending || p.row !== row || p.col !== col) continue;
        if (p.s7?.squashAway && !s7SquashBiteVulnerableAtHome(p, z)) continue;
        if (!zombieCanTargetPlant(p)) continue;
        if (!opts.vehicle && !opts.garg && !opts.vaultingAll && PLANTS[p.key].ground) continue;
        if (p.laddered) laddered = true;
        const rank = plantRank(p);
        if (rank > bestRank) {
          best = p;
          bestRank = rank
        }
      }
      if (laddered && z && !opts.ignoreLadderBypass && z.type !== "polecmd" && !z.vehicle && !z.flags?.garg && !z.flags
        ?.squash && !z.flags?.jalapeno) return null;
      return best
    }

    // -----------------------------------------------------------------------------

    // UI状态/几何 / firstPlantAt

    // [原源码行 3291] 缠绕水草等标记为 zombieIgnore 的植物对所有僵尸完全不可见，

    // [原源码行 3292] 包括撑杆司令、跳跳、车辆和巨人。

    // [原源码行 3302] 撑杆司令需要“看到”所有植物并触发自己的两格跳跃；架梯不能让它像普通僵尸一样直接穿过去。

    // -----------------------------------------------------------------------------

    function firstPlantAt(row, x, opts = {}) {
      const col = Math.floor(x);
      if (col < 0 || col >= PLANT_COLS) return null;
      return topPlantInCell(row, col, opts)
    }

    function snorkelBlockingPlantInCell(z, col) {
      if (!z || z.dead || z.friendly || z.type !== "snorkel") return null;
      if (z.row < 0 || z.row >= ROWS || col < 0 || col >= PLANT_COLS) return null;
      return topPlantInCell(z.row, col, {
        vehicle: false,
        garg: false,
        vaultingAll: false,
        ordinaryBiteOnly: true,
        ignoreLadderBypass: true,
        zombie: z
      })
    }

    // -----------------------------------------------------------------------------

    // UI状态/几何 / snorkelBlockingPlantCrossed

    // [原源码行 3324] 潜水僵尸（含变种）进入植物格后必须浮出并啃食。

    // [原源码行 3325] 变种潜水仅额外拥有头盔，不继承跳跃、车辆、地下、飞行或架梯穿越能力。

    // -----------------------------------------------------------------------------

    function snorkelBlockingPlantCrossed(z, oldX, nextX) {
      if (!z || z.dead || z.friendly || z.type !== "snorkel") return null;
      if (!(Number.isFinite(oldX) && Number.isFinite(nextX)) || nextX >= oldX) return null;
      let bestCol = -1;
      for (const p of finiteArray(state?.plants)) {
        if (!zombieCanTargetPlant(p) || p.row !== z.row) continue;
        if (p.s7?.fakeDeath > 0 || p.s7?.deathPending) continue;
        // 潜水僵尸的跨格扫描必须与普通啃咬查询一致：
        // 攻击中的窝瓜只有在已经落回自己的原始格且处于地面时才重新成为阻挡目标。
        if (p.s7?.squashAway && !s7SquashBiteVulnerableAtHome(p, z)) continue;
        if (PLANTS[p.key]?.ground) continue;
        const rightEdge = p.col + 1;
        const crossedRightEdge = oldX >= rightEdge - 1e-7 && nextX < rightEdge - 1e-7;
        const alreadyInside = oldX < rightEdge && oldX >= p.col && nextX < oldX;
        if ((crossedRightEdge || alreadyInside) && p.col > bestCol) bestCol = p.col
      }
      return bestCol >= 0 ? snorkelBlockingPlantInCell(z, bestCol) : null
    }

    // -----------------------------------------------------------------------------

    // UI状态/几何 / surfaceSnorkelAtPlant

    // [原源码行 3339] 扫描这一逻辑帧跨过的所有格线，选择最先接触的植物格。

    // [原源码行 3340] 即使加速、掉帧补帧或开盒位置恰好压在格线，也不能穿过植物。

    // -----------------------------------------------------------------------------

    function surfaceSnorkelAtPlant(z, p, label = "浮出水面") {
      if (!z || !p) return false;
      z.x = clamp(Math.min(z.x, p.col + .999), p.col + .001, p.col + .999);
      if (z.diving || !z.surfaced) {
        z.diving = false;
        z.surfaced = true;
        addEffect(z.row, p.col + .5, label, "#93c5fd")
      }
      return true
    }

    function frontPlantForZombie(z) {
      if (!z || z.dead || z.friendly || z.underground || isBalloonAir(z)) return null;
      // B06: the bite/contact probe is 0.25 cell left of the zombie origin so the
      // logical bite begins where the mouth visually reaches the plant.
      const biteProbeX = finiteNumber(z.x, 0) - .25;
      const col = Math.floor(biteProbeX);
      if (z.row < 0 || z.row >= ROWS || col < 0 || col >= PLANT_COLS) return null;
      if (z.type === "snorkel") return snorkelBlockingPlantInCell(z, col);
      return topPlantInCell(z.row, col, {
        vehicle: !!z.vehicle,
        garg: !!z.flags?.garg,
        vaultingAll: z.type === "polecmd",
        ordinaryBiteOnly: !canZombiePassPlant(z),
        zombie: z
      })
    }

    function leftmostPlants(row, limit = 1) {
      const maxCount = Math.max(0, Math.floor(limit || 0));
      if (!state || maxCount <= 0) return [];
      return state.plants.filter(p => zombieCanTargetPlant(p) && p.row === row && Number.isFinite(p.col) && p.col >=
        0 && p.col < PLANT_COLS).sort((a, b) => a.col - b.col || plantRank(b) - plantRank(a) || (a.id || 0) - (b.id ||
        0)).slice(0, maxCount)
    }

