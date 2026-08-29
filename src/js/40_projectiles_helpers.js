"use strict";

    // -----------------------------------------------------------------------------

    // 实体助手 / addBullet

    // [原源码行 3647] ENTITY HELPERS: bullets, effects, performance guards

    // -----------------------------------------------------------------------------

    function addBullet(b) {
      const nb = {
        id: uid++,
        x: b.x,
        y: b.y,
        row: b.row,
        dx: b.dx ?? 5,
        dy: b.dy ?? 0,
        damage: b.damage ?? 20,
        kind: b.kind || "pea",
        slow: b.slow || 0,
        stun: b.stun || 0,
        freeze: b.freeze || 0,
        ignore2: !!b.ignore2,
        throw: !!b.throw,
        ash: !!b.ash,
        aoe: b.aoe || 0,
        airOk: !!b.airOk,
        torchable: b.kind === "spore" ? false : b.torchable !== false,
        target: b.target || null,
        targetId: b.target?.id || b.targetId || null,
        homing: !!b.homing || !!b.target,
        life: b.life || 8,
        from: b.from || null,
        dir: b.dir || 1,
        delay: b.delay || 0,
        arc: !!b.arc,
        arcT: 0,
        arcTime: b.arcTime || 0,
        arcStartX: b.arcStartX ?? b.x,
        arcStartY: b.arcStartY ?? b.y,
        arcEndX: b.arcEndX ?? null,
        arcEndY: b.arcEndY ?? null
      };
      for (const k of ["coldLayers", "fireLayers", "poisonLayers", "lumenLayers", "darkLayers", "smallBurst",
          "smallPierce", "splitMini", "ignoreZombieId", "bounce", "pierce", "pierceAll", "blackFire", "bigStar", "bigStarSplash", "bigStarColdLayers", "ghostVolleyId", "cattailSmall",
          "s7Text", "vuln", "vulnAdd", "vulnCap", "cactusSpear", "cactusGold", "iceLance", "iceLanceExpires", "freezeOnHit",
          "waveAmp", "waveFreq", "originX", "originY", "starTurnAfter", "starTargetId", "starTravel", "starStored",
          "starTurned", "starHold", "starMagicDrift", "starNoTurn", "starOriginalDx", "starOriginalDy",
          "starFreeDx", "starFreeDy", "storedIndex", "allowStored", "pultBounceLeft", "firelotusAoe", "giftBox", "arcHeight",
          "directPult", "zombieBullet", "catapultBasketball", "knockback", "oneHitOnly", "fumeLevelAtFire",
          "sniperBullet", "rowSpan", "hitRowMin", "hitRowMax", "targetPlantId", "splashBonus", "winterColdChance",
          "winterColdLayers", "winterFullAoe", "winterImpactLabel", "fullAoeDamage", "goldenMelon", "goldenHitIds",
          "melonGrowthCount", "melonCannon", "explodenutBowling", "strictRow", "fullscreenHit", "iceFireConverted", "iceFireStage",
          "fireAttribute", "torchStage", "torchLevel", "blackFirePersist", "poisonFire", "darkPierceScale", "starDirName", "umbrellaRebound", "umbrellaReboundStartX", "umbrellaReboundDistance", "hitRadiusBonus", "kernelCob", "kernelBigButter", "kernelCellAll", "onlyFlyingBalloon", "groundOnly", "homingSpeed", "arcTimeMultiplier"
        ])
        if (b[k] != null) nb[k] = b[k];
      if (b.emoji) nb.emoji = b.emoji;
      if (nb.waveAmp != null) {
        nb.originX = nb.originX ?? nb.x;
        nb.originY = nb.originY ?? nb.y;
        nb.waveFreq = nb.waveFreq || 1
      }
      state.bullets.push(nb);
      return nb
    }

    // -----------------------------------------------------------------------------

    // 实体助手 / addPultBullet

    // [原源码行 3654] 速度分量允许显式为0。杨桃“上/下”两颗星必须保持纯竖直起飞，

    // [原源码行 3655] 不能被默认值错误改成向右飞。

    // -----------------------------------------------------------------------------

    const S7_PLANT_RELEASE_SOCKETS = Object.freeze({
      peashooter:{x:.73,y:.39},snowpea:{x:.73,y:.39},repeater:{x:.74,y:.39},gatling:{x:.79,y:.405},threepeater:{x:.74,y:.40},
      splitpea:{x:.73,y:.40,backX:.27},sniper:{x:.80,y:.385},cactus:{x:.70,y:.38},puff:{x:.68,y:.42},scaredy:{x:.68,y:.42},
      seashroom:{x:.67,y:.43},ghost:{x:.73,y:.405},cattail:{x:.68,y:.35},starfruit:{x:.55,y:.40},firelotus:{x:.69,y:.37},
      cabbage:{x:.25,y:.255},kernel:{x:.27,y:.265},melon:{x:.25,y:.245},winter:{x:.25,y:.245}
    });
    function s7PlantReleaseSocket(p, sourceRow, dx=5) {
      const key=String(p?.key||'');
      const socket=S7_PLANT_RELEASE_SOCKETS[key];
      const row=Math.max(0,Math.min(ROWS-1,Math.round(sourceRow??p?.row??0)));
      if (!socket) return {x:finiteNumber(p?.col,0)+.55,y:row+.5,key:'default'};
      const rx=dx<0 && socket.backX!=null ? socket.backX : socket.x;
      return {x:finiteNumber(p?.col,0)+finiteNumber(rx,.55),y:row+finiteNumber(socket.y,.5),key};
    }
    function s7PultReleaseSocket(p, sourceRow) { return s7PlantReleaseSocket(p,sourceRow,5) }

    function addPultBullet(p, z, damage, opt = {}) {
      const sourceRow = Math.max(0, Math.min(ROWS - 1, Math.round(opt.row ?? p.row)));
      const release=s7PultReleaseSocket(p,sourceRow);
      const sx = opt.startX ?? release.x,
        sy = opt.startY ?? release.y;
      const tx = z.x,
        ty = sourceRow + .5;
      const dist = Math.max(0, tx - sx);
      const direct = dist <= .22;
      const atm = finiteNumber(opt.arcTimeMultiplier, 1);
      return addBullet({
        x: sx,
        y: sy,
        row: sourceRow,
        strictRow: true,
        damage: damage,
        kind: opt.kind || "pult",
        ignore2: true,
        throw: true,
        aoe: opt.aoe || 0,
        slow: opt.slow || 0,
        stun: opt.stun || 0,
        target: z,
        from: p,
        torchable: false,
        airOk: !!opt.airOk,
        arc: true,
        directPult: direct,
        arcTime: direct ? .1 : clamp((.35 + Math.abs(tx - sx) * .08) * atm, .32 * atm, .95 * atm),
        arcStartX: sx,
        arcStartY: sy,
        arcEndX: tx,
        arcEndY: ty,
        arcHeight: opt.arcHeight ?? (direct ? 0 : clamp(.42 + Math.abs(tx - sx) * .055, .42, .85)),
        lastTargetX: tx,
        lastTargetRow: z.row,
        life: 1.5,
        delay: opt.delay || 0,
        fireLayers: opt.fire || 0,
        coldLayers: opt.cold || 0,
        poisonLayers: opt.poison || 0,
        lumenLayers: opt.lumen || 0,
        darkLayers: opt.dark || 0,
        pultBounceLeft: opt.pultBounceLeft || 0,
        firelotusAoe: opt.firelotusAoe || 0,
        knockback: opt.knockback || 0,
        splashBonus: opt.splashBonus || 0,
        winterColdChance: opt.winterColdChance,
        winterColdLayers: opt.winterColdLayers,
        winterFullAoe: !!opt.winterFullAoe,
        winterImpactLabel: opt.winterImpactLabel,
        fullAoeDamage: !!opt.fullAoeDamage,
        goldenMelon: !!opt.goldenMelon,
        goldenHitIds: Array.isArray(opt.goldenHitIds) ? opt.goldenHitIds.slice() : undefined,
        melonGrowthCount: opt.melonGrowthCount || 0,
        melonCannon: !!opt.melonCannon,
        kernelCob: !!opt.kernelCob,
        kernelBigButter: !!opt.kernelBigButter,
        kernelCellAll: !!opt.kernelCellAll,
        emoji: opt.emoji
      })
    }

    function s7IsCabbageBounceBullet(b) {
      return !!(b && b.throw && b.arc && b.from && b.from.key === "cabbage" && Math.floor(b.pultBounceLeft || 0) > 0)
    }

    function s7CabbageBounceNextZombie(row, fromX, excludeId = null) {
      if (!state) return null;
      row = Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(row, 0))));
      fromX = finiteNumber(fromX, 0);
      return state.zombies.filter(q => q && !q.dead && !q.dying && !q.friendly && q.row === row && q.id !== excludeId &&
        isDamageableZombie(q) && q.x > fromX + .12).sort((a, b) => finiteNumber(a.x, 999) - finiteNumber(b.x, 999))[0] ||
        null
    }

    function s7LaunchCabbageBounce(b, fromX, fromY, excludeId = null, reason = "hit") {
      if (!s7IsCabbageBounceBullet(b) || !state) return false;
      const row = Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(b.row, 0))));
      const sx = finiteNumber(fromX, b.x);
      const sy = finiteNumber(fromY, row + .5);
      const next = s7CabbageBounceNextZombie(row, sx, excludeId);
      const fallbackX = Math.min(COLS - .5, Math.max(.25, sx + 1));
      const target = next || {
        x: fallbackX,
        row: row,
        id: null,
        dead: false,
        friendly: false
      };
      addPultBullet(b.from || {
        row: row,
        col: Math.max(0, Math.min(PLANT_COLS - 1, Math.floor(sx)))
      }, target, b.damage, {
        row: row,
        kind: b.kind || "pult",
        startX: sx,
        startY: sy,
        pultBounceLeft: Math.max(0, Math.floor(b.pultBounceLeft || 0) - 1),
        ignoreZombieId: excludeId || b.ignoreZombieId,
        fire: b.fireLayers || 0,
        cold: b.coldLayers || 0,
        poison: b.poisonLayers || 0,
        lumen: b.lumenLayers || 0,
        dark: b.darkLayers || 0,
        arcHeight: b.arcHeight
      });
      addEffect(row, sx, next ? "卷心菜弹射" : reason === "ground" ? "卷心菜落地后弹" : "卷心菜后弹一格", "#bbf7d0", .45);
      return true
    }

    function s7HandleCabbageGroundBounce(b) {
      if (!s7IsCabbageBounceBullet(b) || !b.arc || b.arcT < 1 || b._cabbageGroundResolved) return false;
      b._cabbageGroundResolved = true;
      const launched = s7LaunchCabbageBounce(b, b.x, b.row + .5, null, "ground");
      if (launched) {
        b.dead = true;
        return true
      }
      return false
    }

    function addEffect(row, x, text, color = "#fde047", ttl = .7) {
      if (!state) return;
      row = finiteNumber(row, 0);
      x = finiteNumber(x, .5);
      ttl = finitePositive(ttl, .4);
      if (!renderSafeRow(row) || !renderSafeX(x)) return;
      state.effects = finiteArray(state.effects);
      state.effects.push({
        row: row,
        x: x,
        text: String(text ?? ""),
        color: color,
        ttl: ttl,
        max: ttl
      });
      if (state.effects.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS)
    }

    function s7AddSpriteEffect(kind, row, x, ttl = .5, opt = {}) {
      if (!state || !S7_BILIBILI_EFFECT_MANIFEST[kind]) return null;
      row = finiteNumber(row, 0);
      x = finiteNumber(x, .5);
      ttl = finitePositive(ttl, .4);
      if (!renderSafeRow(row) || !renderSafeX(x)) return null;
      state.effects = finiteArray(state.effects);
      const effect = {
        row, x, ttl, max:ttl, spriteKind:kind,
        rangeCells:Math.max(.25, finiteNumber(opt.rangeCells, 1)),
        scale:Math.max(.1, finiteNumber(opt.scale, 1)),
        opacity:clamp(finiteNumber(opt.opacity, 1), 0, 1),
        frameOffset:Math.max(0, Math.floor(finiteNumber(opt.frameOffset, 0)))
      };
      state.effects.push(effect);
      if (state.effects.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS);
      return effect
    }

    function addBigStarVisual(p, hitCount = 0, label = "大星星") {
      if (!state || !p) return;
      const ttl = .9;
      state.effects = finiteArray(state.effects);
      state.effects.push({
        row: p.row,
        x: p.col + .5,
        text: "🌟",
        color: "#fde047",
        ttl: ttl,
        max: ttl,
        bigStarVisual: true,
        hitCount: Math.max(0, Math.floor(hitCount || 0)),
        label: String(label || "大星星")
      });
      if (state.effects.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS)
    }

    function addPotatoMineMarker(row, x, label, ttl = 1) {
      if (!state) return;
      row = finiteNumber(row, 0);
      x = finiteNumber(x, .5);
      ttl = finitePositive(ttl, 1);
      if (!renderSafeRow(row) || !renderSafeX(x)) return;
      state.effects = finiteArray(state.effects);
      state.effects.push({
        row: row,
        x: x,
        text: "🥔",
        color: "#fde68a",
        ttl: ttl,
        max: ttl,
        potatoMarker: true,
        label: String(label || "土豆雷")
      });
      if (state.effects.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS)
    }

    function activeZombieCount(row = null) {
      if (!state) return 0;
      let n = 0;
      for (const z of finiteArray(state.zombies)) {
        if (!z || z.dead) continue;
        if (row !== null && z.row !== row) continue;
        n++
      }
      return n
    }

    function canAddZombie(row, extra = 1) {
      if (!state) return false;
      return activeZombieCount(null) + extra <= PERF.MAX_ZOMBIES
    }

    function safePushZombie(z, reason = "spawn") {
      if (!state || !z) return null;
      if (!Number.isFinite(z.x) || !Number.isFinite(z.row)) return null;
      z.row = Math.max(0, Math.min(ROWS - 1, Math.round(z.row)));
      if (!canAddZombie(z.row, 1)) {
        if (!state.s7) state.s7 = {};
        const now = state.time || 0;
        if (!state.s7.lastPerfDrop || now - state.s7.lastPerfDrop > 4) {
          state.s7.lastPerfDrop = now;
          addEffect(z.row, Math.min(DAMAGE_BOUNDARY_X, Math.max(0, z.x || 0)), "性能保护：跳过出怪", "#fca5a5", .8);
          log("性能保护：当前实体过多，已临时跳过部分召唤/出怪，避免页面卡死。")
        }
        return null
      }
      state.zombies.push(z);
      // 所有实体入场路径统一从这里触发指令僵尸的“一次性出场召唤”。
      // 这样手动卡牌、盲盒开出以及其他合法生成路径不会再出现有的召唤、有的不召唤。
      s7TriggerCommandSpawnOnce(z, reason);
      return z
    }

    function applyImpLandingStun(z, label = "小鬼落地眩晕") {
      if (!z || z.dead || z.type !== "imp") return false;
      if (!z.friendly && s7KillZombieByUmbrella(z, "保护伞秒杀小鬼落下")) return true;
      z.flyingImp = false;
      z.air = false;
      z.airTimer = 0;
      z.impLandingPending = false;
      const cold = s7Elem(z).cold || 0;
      const chillFactor = cold > 0 ? 1 / Math.max(1 - S7_RULES.elements.coldSlowCap, 1 - S7_RULES.elements
        .coldSlowPerLayer * cold) : 1;
      z.landingInvuln = IMP_LANDING_INVULN * chillFactor;
      z.stun = Math.max(z.stun || 0, (IMP_LANDING_INVULN + IMP_LANDING_STUN) * chillFactor);
      z.attackCd = Math.max(z.attackCd || 0, z.stun);
      addEffect(z.row, z.x, label, "#fda4af");
      return false
    }

    // -----------------------------------------------------------------------------

    // 实体助手 / markThrownImp

    // [原源码行 3908] 在清除飞行标记之前先做一次最终落点判定，防止小鬼在同一逻辑帧内

    // [原源码行 3909] 从“飞行”直接切成“落地”而绕过保护伞秒杀。

    // [原源码行 3916] 寒意延长：巨人cold层数越高，落地停滞越长

    // -----------------------------------------------------------------------------

    function markThrownImp(imp, airTime = .8) {
      if (!imp || imp.type !== "imp") return imp;
      imp.flyingImp = true;
      imp.air = true;
      imp.airTimer = Math.max(.04, airTime || .8);
      imp.impLandingPending = true;
      imp.impLandingCell = s7UmbrellaCellForX(imp.x);
      return imp
    }
    const S7_UMBRELLA_LEAP_KILL_TYPES = new Set(["polecmd", "pole", "pogo", "dolphin", "imp", "bungee", "balloon"]);
    const S7_SMALL_UMBRELLA_HP = 20;

    // -----------------------------------------------------------------------------
    // 小伞统一模型
    //
    // 框架约束：小伞是独立的、固定锚定在生成格的20HP保护实体，而不是把宿主植物
    // 临时改成“拥有1×3无敌范围”。所有小伞能力只允许从下列三个入口结算：
    //   1. s7BasketballProtectorForPlant：本格无限挡篮球，不消耗小伞；
    //   2. s7SmallUmbrellaBlocksPea / damagePlant：第一次豌豆或普通啃咬消耗小伞；
    //   3. s7AirUmbrellaForCell：仅五阶小伞可在锚点1×3内弹飞一次浮空僵尸。
    // 其他伤害、其他僵尸子弹、砸击、碾压、爆炸和元素均不得被小伞拦截。
    // -----------------------------------------------------------------------------

    function s7UmbrellaCellForX(x) {
      return Math.floor(clamp(finiteNumber(x, 0), 0, PLANT_COLS - .001))
    }

    function s7SmallUmbrellaState(owner) {
      if (!owner || owner.dead || owner.key === "umbrella") return null;
      const umbrella = owner.s7SmallUmbrella;
      if (!umbrella || !(finiteNumber(umbrella.hp, 0) > 0)) return null;
      return umbrella
    }

    function s7SmallUmbrellaActive(owner) {
      return !!s7SmallUmbrellaState(owner)
    }

    function s7SmallUmbrellaAnchor(owner) {
      const umbrella = s7SmallUmbrellaState(owner);
      if (!umbrella) return null;
      return {
        row: Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(umbrella.anchorRow, owner.row)))),
        col: Math.max(0, Math.min(PLANT_COLS - 1, Math.round(finiteNumber(umbrella.anchorCol, owner.col))))
      }
    }

    function s7GrantSmallUmbrella(owner, airReady = false, sourceUmbrella = null) {
      if (!owner || owner.dead || owner.key === "umbrella") return false;
      const active = s7SmallUmbrellaState(owner);
      if (active) {
        // 小伞不可叠加，也不因普通刷新恢复耐久；五阶来源只负责把现有小伞升级为空中拦截型。
        if (airReady) active.airReady = true;
        if (sourceUmbrella?.id != null) active.sourceUmbrellaId = sourceUmbrella.id;
        return false
      }
      owner.s7SmallUmbrella = {
        hp: S7_SMALL_UMBRELLA_HP,
        maxHp: S7_SMALL_UMBRELLA_HP,
        airReady: !!airReady,
        anchorRow: owner.row,
        anchorCol: owner.col,
        sourceUmbrellaId: sourceUmbrella?.id ?? null,
        sourceLevel: sourceUmbrella?.s7?.level || 0
      };
      return true
    }

    function s7ConsumeSmallUmbrella(owner, label = "小伞消失") {
      const umbrella = s7SmallUmbrellaState(owner);
      if (!umbrella) return false;
      const anchor = s7SmallUmbrellaAnchor(owner) || { row: owner.row, col: owner.col };
      umbrella.hp = 0;
      umbrella.airReady = false;
      addEffect(anchor.row, anchor.col + .5, label, "#bae6fd", .55);
      return true
    }

    function s7PlantCurrentCell(p) {
      if (!p) return null;
      if (p.key === "squash" && p.s7?.squashAway) {
        return s7UmbrellaCellForX(plantProjectileX(p))
      }
      return Math.max(0, Math.min(PLANT_COLS - 1, Math.round(finiteNumber(p.col, 0))))
    }

    function s7SmallUmbrellaForCell(row, col, opt = {}) {
      if (!state || !Number.isFinite(row) || !Number.isFinite(col)) return null;
      const radius = Math.max(0, finiteNumber(opt.radius, 0));
      const requireAir = !!opt.requireAir;
      const preferredOwner = opt.preferredOwner || null;
      const candidates = [];
      for (const owner of state.plants) {
        const umbrella = s7SmallUmbrellaState(owner);
        if (!umbrella || requireAir && !umbrella.airReady) continue;
        const anchor = s7SmallUmbrellaAnchor(owner);
        if (!anchor || anchor.row !== row || Math.abs(anchor.col - col) > radius) continue;
        candidates.push(owner)
      }
      if (!candidates.length) return null;
      if (preferredOwner && candidates.includes(preferredOwner)) return preferredOwner;
      candidates.sort((a, b) => {
        const aa = s7SmallUmbrellaAnchor(a);
        const bb = s7SmallUmbrellaAnchor(b);
        return Math.abs(aa.col - col) - Math.abs(bb.col - col) || (a.id || 0) - (b.id || 0)
      });
      return candidates[0]
    }

    function s7SmallUmbrellaForPlant(p) {
      if (!p || p.dead) return null;
      const currentCell = s7PlantCurrentCell(p);
      if (currentCell == null) return null;
      return s7SmallUmbrellaForCell(p.row, currentCell, {
        radius: 0,
        preferredOwner: p
      })
    }

    function s7MainUmbrellaForCell(row, col, minLevel = 0) {
      if (!state || !Number.isFinite(row) || !Number.isFinite(col)) return null;
      return state.plants.find(u => !u.dead && u.key === "umbrella" && u.row === row && (u.s7?.level || 0) >= minLevel &&
        Math.abs(Math.round(finiteNumber(u.col, 0)) - col) <= 1) || null
    }

    function s7BasketballProtectorForPlant(p) {
      if (!state || !p || p.dead) return null;
      const targetCell = s7PlantCurrentCell(p);
      if (targetCell == null) return null;
      // 本体保护伞保持原来的1×3篮球区；小伞严格只有锚定本格1×1篮球区。
      return s7MainUmbrellaForCell(p.row, targetCell) || s7SmallUmbrellaForCell(p.row, targetCell, {
        radius: 0,
        preferredOwner: p
      })
    }

    function s7SmallUmbrellaBlocksPea(p, bullet) {
      if (!p || p.dead || !bullet || !bullet.zombieBullet || bullet.catapultBasketball || !isPeaLikeBullet(bullet)) {
        return false
      }
      const owner = s7SmallUmbrellaForPlant(p);
      if (!owner) return false;
      s7ConsumeSmallUmbrella(owner, "小伞承受豌豆20");
      return true
    }

    function s7PlantHasUmbrellaAirBlock(p) {
      const small = s7SmallUmbrellaState(p);
      return !!(p && !p.dead && (p.key === "umbrella" || small?.airReady))
    }

    function s7IsOrdinaryBiteSource(src) {
      return !!(src && !src.dead && !src.friendly && !src._isBullet && src.type !== "catapult" && !src.flags?.garg && !
        src.vehicle && !src.flags?.squash && !src.flags?.jalapeno && !src.flags?.jack && !src.underground)
    }

    function s7UmbrellaAirborneZombie(z) {
      if (!z || z.dead || z.friendly || !S7_UMBRELLA_LEAP_KILL_TYPES.has(z.type)) return false;
      if (z.type === "balloon") return isBalloonAir(z) || !z.air; // 飞行与落地的气球都可被保护伞弹飞
      if (z.type === "imp") return !!z.flyingImp || !!z.air || (z.airTimer || 0) > 0 || !!z.impLandingPending;
      if (z.type === "pogo") return (z.pogoAirTimer || 0) > 0;
      if (z.type === "bungee") return true;
      if (["pole", "polecmd", "dolphin"].includes(z.type)) return !!z.jumping || (z.jumpMove || 0) > 0;
      return false
    }

    function s7UmbrellaTakeoffZombie(z) {
      if (s7UmbrellaAirborneZombie(z)) return true;
      if (!z || z.dead || z.friendly) return false;
      if (z.type === "pogo") return hasPogo(z);
      if (["pole", "polecmd", "dolphin"].includes(z.type)) return !!(z.flags?.pole || z.flags?.dolphin) && !z.jumped;
      return false
    }

    function s7AirUmbrellaForCell(row, col) {
      // 本体与五阶小伞的浮空拦截范围均为本行、中心格及左右一格；本体优先，避免误耗小伞。
      return s7MainUmbrellaForCell(row, col) || s7SmallUmbrellaForCell(row, col, {
        radius: 1,
        requireAir: true
      })
    }

    function s7AirUmbrellaForZombieCell(z, xOverride = null) {
      if (!z || z.dead || z.friendly) return null;
      const x = finiteNumber(xOverride ?? z.x, z.x);
      const cell = z.type === "imp" && xOverride == null && Number.isFinite(z.impLandingCell) ? z.impLandingCell :
        s7UmbrellaCellForX(x);
      let protector = s7AirUmbrellaForCell(z.row, cell);
      if (protector) return protector;
      // 伞弹飞按“进入覆盖范围”判定，而不是只看中心点落在哪一格；
      // 额外检查左右边缘，避免因贴图/判定偏移导致已经进范围却没被弹飞。
      const edgeCells = new Set([
        s7UmbrellaCellForX(x - .35),
        s7UmbrellaCellForX(x + .35)
      ]);
      for (const edgeCell of edgeCells) {
        protector = s7AirUmbrellaForCell(z.row, edgeCell);
        if (protector) return protector
      }
      return null
    }

    function s7KillZombieByUmbrella(z, label = "保护伞弹飞") {
      if (!s7UmbrellaAirborneZombie(z)) return false;
      const protector = s7AirUmbrellaForZombieCell(z);
      if (!protector) return false;
      const killed = killZombie(z, {
        source: protector,
        noCritical: true,
        noTransform: true,
        balloonAirBypass: true
      });
      if (!killed || !z.dead) return false;
      addEffect(z.row, z.x, label, "#bae6fd", .65);
      if (protector.key !== "umbrella") s7ConsumeSmallUmbrella(protector, "五阶小伞弹飞后消失");
      return true
    }

    function s7KillIfUmbrellaProtectedPlantContact(z, p, label = "保护伞弹飞起跳单位") {
      if (!p || p.dead || !s7UmbrellaTakeoffZombie(z)) return false;
      const protector = s7AirUmbrellaForCell(p.row, Math.round(finiteNumber(p.col, 0)));
      if (!protector) return false;
      const killed = killZombie(z, {
        source: protector,
        noCritical: true,
        noTransform: true,
        balloonAirBypass: true
      });
      if (!killed || !z.dead) return false;
      addEffect(z.row, z.x, label, "#bae6fd", .65);
      if (protector.key !== "umbrella") s7ConsumeSmallUmbrella(protector, "五阶小伞弹飞后消失");
      return true
    }

    function updateUmbrellaImpKill(rowFilter = null) {
      if (!state) return;
      const hasUmbrella = state.plants.some(p => !p.dead && p.key === "umbrella" && (rowFilter === null || p.row === rowFilter));
      if (!hasUmbrella) return;
      const zArr = state.zombies;
      const zLen = zArr.length;
      for (let zi = 0; zi < zLen; zi++) {
        const z = zArr[zi];
        if (!z || z.dead || z.friendly) continue;
        if (rowFilter !== null && z.row !== rowFilter) continue;
        if (z.type === "imp") {
          const src = s7MainUmbrellaForCell(z.row, s7UmbrellaCellForX(z.x));
          const killed = killZombie(z, {
            source: src || state.plants.find(p => !p.dead && p.key === "umbrella" && p.row === z.row),
            noCritical: true,
            noTransform: true
          });
          if (killed && z.dead) addEffect(z.row, z.x, "保护伞秒杀小鬼", "#bae6fd", .65);
          continue
        }
        if (!s7UmbrellaAirborneZombie(z)) continue;
        s7KillZombieByUmbrella(z, "保护伞弹飞浮空单位")
      }
    }

    // -----------------------------------------------------------------------------

    // 性能保护 / trimBulletsForPerformance
    // v10.3：停驻星属于杨桃（含百变大麦变成杨桃时）的正式库存，不能在达到子弹上限时
    // 被作为最低优先级首先删除。容量保护只决定“超上限时保留谁”，并保持保留对象原有更新顺序。

    function s7BulletRetentionPriority(b) {
      if (!b) return -Infinity;
      let priority = 0;
      if (b.starStored) priority += 100;
      if (b.sniperBullet) priority += 40;
      if (b.zombieBullet) priority += 30;
      if (b.catapultBasketball) priority += 10;
      return priority
    }

    function trimBulletsForPerformance() {
      if (!state) return;
      state.bullets = finiteArray(state.bullets);
      if (state.bullets.length <= PERF.MAX_BULLETS) return;
      const ranked = [...state.bullets].sort((a, b) => s7BulletRetentionPriority(b) - s7BulletRetentionPriority(a) ||
        finiteNumber(b.id, 0) - finiteNumber(a.id, 0));
      const keep = new Set(ranked.slice(0, PERF.MAX_BULLETS));
      state.bullets = state.bullets.filter(b => keep.has(b))
    }

    function s7PerformanceCleanup(force = false) {
      if (!state) return;
      const frame = Math.max(0, Math.floor(finiteNumber(state.frame, 0)));
      const overCapacity = finiteArray(state.zombies).length > PERF.MAX_ZOMBIES ||
        finiteArray(state.bullets).length > PERF.MAX_BULLETS ||
        finiteArray(state.effects).length > PERF.MAX_EFFECTS ||
        finiteArray(state.gridEffects).length > PERF.MAX_GRID_EFFECTS ||
        finiteArray(state.iceTrails).length > PERF.MAX_ICE_TRAILS ||
        finiteArray(state.poisonPits).length > PERF.MAX_POISON_PITS ||
        finiteArray(state.s7?.turrets).length > PERF.MAX_TURRETS ||
        finiteArray(state.s7?.summons).length > PERF.MAX_SUMMONS ||
        finiteArray(state.s7?.sunflowerSuns).length > PERF.MAX_SUNFLOWER_SUNS;
      if (!force && !overCapacity && frame % PERF.FULL_CLEANUP_INTERVAL_FRAMES !== 0) return;

      state.zombies = compactArrayInPlace(finiteArray(state.zombies), z => z && !z.dead && Number.isFinite(z.x) &&
        Number.isFinite(z.row) && z.row >= 0 && z.row < ROWS && z.x > -2.5 && z.x < COLS + 3);
      if (state.zombies.length > PERF.MAX_ZOMBIES) {
        state.zombies.sort((a, b) => {
          const sa = (a.s7?.command ? 50 : 0) + (a.flags?.garg ? 25 : 0) + (a.threat || 0) * 2 + (a.friendly ? a.x :
            DAMAGE_BOUNDARY_X - a.x);
          const sb = (b.s7?.command ? 50 : 0) + (b.flags?.garg ? 25 : 0) + (b.threat || 0) * 2 + (b.friendly ? b.x :
            DAMAGE_BOUNDARY_X - b.x);
          return sb - sa
        });
        state.zombies.length = PERF.MAX_ZOMBIES
      }
      state.bullets = compactArrayInPlace(finiteArray(state.bullets), b => {
        if (!b || b.dead) return false;
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
        if (b.life <= 0) return false;
        return !(b.x < -2 || b.x > COLS + 3 || b.y < -2 || b.y > ROWS + 2)
      });
      trimBulletsForPerformance();
      if (state.effects?.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS);
      if (state.gridEffects?.length > PERF.MAX_GRID_EFFECTS) state.gridEffects.splice(0, state.gridEffects.length - PERF.MAX_GRID_EFFECTS);
      if (state.iceTrails?.length > PERF.MAX_ICE_TRAILS) state.iceTrails.splice(0, state.iceTrails.length - PERF.MAX_ICE_TRAILS);
      if (state.poisonPits?.length > PERF.MAX_POISON_PITS) state.poisonPits.splice(0, state.poisonPits.length - PERF.MAX_POISON_PITS);
      if (state.s7?.turrets?.length > PERF.MAX_TURRETS) state.s7.turrets.splice(0, state.s7.turrets.length - PERF.MAX_TURRETS);
      if (state.s7?.summons?.length > PERF.MAX_SUMMONS) state.s7.summons.splice(0, state.s7.summons.length - PERF.MAX_SUMMONS);
      if (state.s7?.sunflowerSuns?.length > PERF.MAX_SUNFLOWER_SUNS) state.s7.sunflowerSuns.splice(0,
        state.s7.sunflowerSuns.length - PERF.MAX_SUNFLOWER_SUNS)
    }

    function isMushroomAsleep(p) {
      return p.asleep && !p.wake && !(state && state.night)
    }

    function hasPotentialTarget(p) {
      return !!(state && state.battle && p && !p.dead && !p.s7?.fakeDeath && !isMushroomAsleep(p))
    }

