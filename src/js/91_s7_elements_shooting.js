"use strict";

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7Elem

    // [原源码行 10943] 杨桃五向星只允许锁定、追踪并命中发射者所在行的敌方僵尸。

    // [原源码行 10944] 目标被大蒜等机制换行后必须立即放弃并重新索敌本行，绝不跨行追走。

    // -----------------------------------------------------------------------------

    function s7Elem(z) {
      if (!z.s7Elem) z.s7Elem = {
        cold: 0,
        coldT: S7_RULES.elements.coldDecay,
        fire: 0,
        poison: 0,
        poisonT: S7_RULES.elements.poisonTick,
        lumen: 0,
        lumenT: S7_RULES.elements.lumenDecay,
        lumenInterval: S7_RULES.elements.lumenDecay,
        dark: 0,
        iceBound: 0,
        releaseMode: null,
        lastColdMultiple: 0
      };
      return z.s7Elem
    }

    function s7SnapshotElementState(z) {
      const e = s7Elem(z);
      return {
        cold: Math.max(0, finiteNumber(e.cold, 0)),
        coldT: finitePositive(e.coldT, S7_RULES.elements.coldDecay),
        fire: Math.max(0, finiteNumber(e.fire, 0)),
        poison: Math.max(0, finiteNumber(e.poison, 0)),
        poisonT: finitePositive(e.poisonT, S7_RULES.elements.poisonTick),
        lumen: Math.max(0, finiteNumber(e.lumen, 0)),
        lumenT: finitePositive(e.lumenT, S7_RULES.elements.lumenDecay),
        lumenInterval: finitePositive(e.lumenInterval, S7_RULES.elements.lumenDecay),
        dark: Math.max(0, finiteNumber(e.dark, 0)),
        iceBound: Math.max(0, finiteNumber(e.iceBound, 0)),
        releaseMode: e.releaseMode || null,
        lastColdMultiple: Math.max(0, finiteNumber(e.lastColdMultiple, 0))
      }
    }

    function s7RestoreElementState(z, snapshot) {
      if (!z || !snapshot) return;
      const e = s7Elem(z);
      e.cold = Math.max(0, finiteNumber(snapshot.cold, 0));
      e.coldT = finitePositive(snapshot.coldT, S7_RULES.elements.coldDecay);
      e.fire = Math.max(0, finiteNumber(snapshot.fire, 0));
      e.poison = Math.max(0, finiteNumber(snapshot.poison, 0));
      e.poisonT = finitePositive(snapshot.poisonT, S7_RULES.elements.poisonTick);
      e.lumen = Math.max(0, finiteNumber(snapshot.lumen, 0));
      e.lumenT = finitePositive(snapshot.lumenT, S7_RULES.elements.lumenDecay);
      e.lumenInterval = finitePositive(snapshot.lumenInterval, S7_RULES.elements.lumenDecay);
      e.dark = Math.max(0, finiteNumber(snapshot.dark, 0));
      e.iceBound = Math.max(0, finiteNumber(snapshot.iceBound, 0));
      e.releaseMode = snapshot.releaseMode || null;
      e.lastColdMultiple = Math.max(0, finiteNumber(snapshot.lastColdMultiple, 0));
      if (e.iceBound > 0) z.freeze = Math.max(z.freeze || 0, e.iceBound)
    }

    function s7ClearAbnormalState(z) {
      if (!z) return;
      z.slow = 0;
      z.stun = 0;
      z.freeze = 0;
      delete z.s7BloverPush;
      const e = s7Elem(z);
      e.cold = 0;
      e.coldT = S7_RULES.elements.coldDecay;
      e.poison = 0;
      e.poisonT = S7_RULES.elements.poisonTick;
      e.lumen = 0;
      e.lumenT = S7_RULES.elements.lumenDecay;
      e.lumenInterval = S7_RULES.elements.lumenDecay;
      e.dark = 0;
      e.iceBound = 0;
      e.releaseMode = null;
      e.lastColdMultiple = 0
    }

    const S7_ELEMENT_LAYER_KEYS = Object.freeze(["cold", "fire", "poison", "lumen", "dark"]);

    function s7HasBlackOliveElementAura(row) {
      // 设计文档：指令黑橄榄在场时使全部僵尸受到的附加元素效果减半（全场生效，不限行）。
      return !!state?.zombies?.some(q => q && !q.dead && !q.friendly && q.type === "blackolive" && q.s7?.command)
    }

    function s7HalveExistingElementsForBlackOlive(row) {
      let changed = 0;
      for (const q of finiteArray(state?.zombies)) {
        if (!q || q.dead || q.friendly || q.row !== row) continue;
        const e = s7Elem(q);
        for (const key of S7_ELEMENT_LAYER_KEYS) {
          const before = Math.max(0, finiteNumber(e[key], 0));
          const after = Math.ceil(before / 2);
          if (after !== before) changed++;
          e[key] = after
        }
      }
      return changed
    }

    function s7ApplyElement(z, type, layers, source = null, opt = {}) {
      if (!z || z.dead) return false;
      layers = Math.max(0, finiteNumber(layers, 0));
      const isFireAttribute = type === "fire" && (layers > 0 || opt.fireAttribute);
      if (layers <= 0 && !isFireAttribute) return false;
      if (isBalloonAir(z)) {
        if (type !== "poison" && !opt.ignoreTargetState && !plantCanAffectFlyingBalloon(source)) return false;
        if (type !== "poison" && !opt.balloonAirBypass) return false
      }
      // 地下状态仍阻止普通寒意/燃焰/光标/暗熠等元素附着；剧毒是唯一例外。
      // 剧毒一旦附着，就按统一0.17秒 Tick 对地下矿工造成无来源伤害。
      if (isUnderground(z) && type !== "poison" && !opt.undergroundBypass) return false;
      if (isAbnormalImmuneZombie(z) && type !== "fire") return false;
      if (!opt.includeBobsled && z.type === "bobsledSled" && z.flags?.riders) return false;
      if (!z.friendly && s7HasBlackOliveElementAura(z.row)) layers = Math.ceil(layers / 2);
      const e = s7Elem(z);
      if (type === "cold") {
        if (z.type === "yeti") return false;
        if (e.fire > 0) {
          const fireBefore = e.fire;
          e.fire = 0;
          damageZombie(z, fireBefore, {
            source: source,
            ignore2: true,
            pierceAll: true,
            element: true,
            noLumenChain: false
          });
          addEffect(z.row, z.x, `寒灭燃焰${Math.round(fireBefore)}`, "#bae6fd", .35)
        }
        const before = e.cold;
        e.cold += layers;
        const interval = s7ColdDecayIntervalForRow(z.row);
        if (before <= 0) e.coldT = interval;
        const firstCrossedThreshold = (Math.floor(before / 5) + 1) * 5;
        const highestCrossedThreshold = firstCrossedThreshold <= e.cold ? Math.floor(e.cold / 5) * 5 : 0;
        // 最新明确口径：20层本身不触发；越过25/30/35/40触发2秒冰冻，
        // 越过45/50/55……触发4秒冰封。一次跨越多个阈值时以最高阈值为准。
        if (highestCrossedThreshold >= 25 && e.iceBound <= 0) {
          if (highestCrossedThreshold >= 45) {
            e.iceBound = S7_RULES.elements.iceBoundSeconds;
            z.freeze = Math.max(z.freeze || 0, e.iceBound);
            e.releaseMode = "bound";
            addEffect(z.row, z.x, `冰封4s·越${highestCrossedThreshold}层`, "#60a5fa", .45)
          } else {
            z.freeze = Math.max(z.freeze || 0, S7_RULES.elements.freezeSeconds);
            e.releaseMode = "freeze";
            addEffect(z.row, z.x, `冰冻2s·越${highestCrossedThreshold}层`, "#93c5fd", .45)
          }
          e.lastColdMultiple = Math.floor(highestCrossedThreshold / 5)
        }
      } else if (type === "fire") {
        // 冻结/冰封期间受到燃焰攻击不触发火融寒意：寒意层与硬控一起保留，
        // 燃焰层照常叠加，待控制结束后再由后续元素附着自然结算克制反应。
        const hardFrozen = (z.freeze || 0) > 0 || (e.iceBound || 0) > 0;
        if (e.cold > 0 && !hardFrozen) {
          const coldBefore = e.cold;
          e.cold = 0;
          e.coldT = s7ColdDecayIntervalForRow(z.row);
          damageZombie(z, coldBefore, {
            source: source,
            ignore2: true,
            pierceAll: true,
            element: true
          });
          addEffect(z.row, z.x, `火融寒意${Math.round(coldBefore)}`, "#fb923c", .35)
        }
        e.fire += layers
      } else if (type === "poison") {
        e.poison += layers;
        z.lastPoisonSource = source || z.lastPoisonSource
      } else if (type === "lumen") {
        e.lumen = Math.min(S7_RULES.elements.maxLumen, e.lumen + layers);
        const interval = s7LumenDecayIntervalForRow(z.row);
        e.lumenInterval = interval;
        e.lumenT = interval
      } else if (type === "dark") {
        if (e.dark >= S7_RULES.elements.maxDark) {
          damageZombie(z, 10 * layers, {
            source: source,
            ignore2: true,
            pierceAll: true,
            element: true
          });
          addEffect(z.row, z.x, `暗熠溢出${Math.round(10*layers)}`, "#a78bfa", .35)
        } else {
          const overflow = e.dark + layers - S7_RULES.elements.maxDark;
          e.dark = Math.min(S7_RULES.elements.maxDark, e.dark + layers);
          if (overflow > 0) {
            damageZombie(z, 10 * overflow, {
              source: source,
              ignore2: true,
              pierceAll: true,
              element: true
            });
            addEffect(z.row, z.x, `暗熠溢出${Math.round(10*overflow)}`, "#a78bfa", .35)
          }
        }
      }
      z.lastElementSource = source || z.lastElementSource;
      return true
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7UpdateElements

    // [原源码行 11024] 黑橄榄（“黑大爷”）仍免疫通常的异常状态，但绝不免疫燃焰。

    // [原源码行 11025] 其元素附着减半效果严格限定在黑橄榄所在行；新增寒意/燃焰/剧毒/光标/暗熠层数均向上取整减半。

    // -----------------------------------------------------------------------------

    function s7UpdateElements(dt, rowFilter = null) {
      for (const z of [...state.zombies]) {
        if (z.dead || rowFilter !== null && z.row !== rowFilter) continue;
        if (z.type === "blackolive") continue;
        if (z.type === "bobsledSled" && z.flags?.riders) continue;
        if (z.s7LumenMark > 0) z.s7LumenMark = Math.max(0, z.s7LumenMark - dt);
        if (z.s7KelpPoison) {
          z.s7KelpPoison.remain -= dt;
          z.s7KelpPoison.tick -= dt;
          while (z.s7KelpPoison.tick <= 0 && z.s7KelpPoison.remain > 0) {
            z.s7KelpPoison.tick += 1;
            s7ApplyElement(z, "poison", z.s7KelpPoison.layers, z.s7KelpPoison.source, {
              ignoreTargetState: true
            })
          }
          if (z.s7KelpPoison.remain <= 0) z.s7KelpPoison = null
        }
        const e = s7Elem(z);
        e.poisonT -= dt;
        while (e.poison > 0 && e.poisonT <= 0 && !z.dead) {
          e.poisonT += S7_RULES.elements.poisonTick;
          damageZombie(z, e.poison, {
            source: null,
            noSource: true,
            ignore2: true,
            pierceAll: true,
            element: true,
            poisonTick: true,
            balloonAirBypass: true,
            undergroundBypass: true
          })
        }
        const lumenInterval = s7LumenDecayIntervalForRow(z.row);
        if (!Number.isFinite(e.lumenT)) e.lumenT = lumenInterval;
        e.lumenInterval = lumenInterval;
        e.lumenT -= dt;
        while (e.lumen > 0 && e.lumenT <= 0) {
          e.lumen--;
          e.lumenT += lumenInterval
        }
        if (e.lumen <= 0) e.lumenT = lumenInterval;
        const coldInterval = s7ColdDecayIntervalForRow(z.row);
        if (!Number.isFinite(e.coldT)) e.coldT = coldInterval;
        e.coldT -= dt;
        while (e.cold > 0 && e.coldT <= 0) {
          e.cold = Math.max(0, e.cold - 1);
          e.coldT += coldInterval
        }
        if (e.cold <= 0) e.coldT = coldInterval;
        if (e.iceBound > 0) e.iceBound = Math.max(0, e.iceBound - dt);
        if (e.releaseMode && (z.freeze || 0) <= 0 && e.iceBound <= 0) {
          const mode = e.releaseMode;
          const coldNow = Math.max(0, e.cold);
          const dmg = (mode === "bound" ? .12 : .06) * Math.max(0, totalHp(z)) + (mode === "bound" ? 5 : 3) * coldNow;
          e.cold = Math.max(0, coldNow - (mode === "bound" ? 5 : 3));
          e.releaseMode = null;
          e.lastColdMultiple = Math.floor(e.cold / 5);
          if (dmg > 0 && !z.dead) damageZombie(z, dmg, {
            source: null,
            noSource: true,
            // 解冻/解封伤害是“无来源伤害”，不是穿甲或无视防具伤害。
            // 让它按统一伤害链先结算外层防具并保留70临界，避免隔着完整防具直接打空本体造成假性秒杀。
            element: true
          });
          addEffect(z.row, z.x, mode === "bound" ? "冰封解冻" : "冰冻解冻", "#bfdbfe", .35)
        }
      }
    }

    function s7VulnMultiplier(z) {
      if (z.type === "blackolive") return 1;
      const e = s7Elem(z);
      let m = Math.pow(1.15, Math.min(4, e.lumen || 0));
      if (z.s7Vuln) m *= 1 + z.s7Vuln;
      return m
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7Shoot

    // [原源码行 11153] 光标：每层15%易伤，乘算；4层约1.75倍。

    // -----------------------------------------------------------------------------

    function s7Shoot(p, target, damage, opt = {}) {
      if (!target) return null;
      const row = opt.row ?? p.row;
      const visualDx=opt.dx ?? 5;
      const release=s7PlantReleaseSocket(p,row,visualDx);
      return addBullet({
        x: opt.x ?? release.x,
        y: opt.y ?? release.y,
        row: row,
        dx: opt.dx ?? 5,
        dy: opt.dy ?? 0,
        damage: damage,
        kind: opt.kind || "pea",
        target: opt.homing ? target : null,
        targetId: target?.id,
        homing: !!opt.homing,
        airOk: !!opt.airOk,
        onlyFlyingBalloon: !!opt.onlyFlyingBalloon,
        groundOnly: !!opt.groundOnly,
        homingSpeed: opt.homingSpeed,
        from: p,
        torchable: opt.torchable !== false,
        life: opt.life || 8,
        delay: opt.delay || 0,
        coldLayers: opt.cold || 0,
        fireLayers: opt.fire || 0,
        poisonLayers: opt.poison || 0,
        lumenLayers: opt.lumen || 0,
        darkLayers: opt.dark || 0,
        smallBurst: opt.smallBurst || 0,
        bounce: !!opt.bounce,
        pierce: opt.pierce || 0,
        pierceAll: !!opt.pierceAll,
        blackFire: !!opt.blackFire,
        bigStar: !!opt.bigStar,
        bigStarSplash: opt.bigStarSplash || 30,
        bigStarColdLayers: opt.bigStar ? Math.max(0, finiteNumber(opt.bigStarColdLayers, 10)) : 0,
        ghostVolleyId: opt.ghostVolleyId,
        cattailSmall: !!opt.cattailSmall,
        emoji: opt.emoji,
        vuln: opt.vuln,
        vulnAdd: opt.vulnAdd,
        vulnCap: opt.vulnCap,
        cactusSpear: !!opt.cactusSpear,
        cactusGold: !!opt.cactusGold,
        iceLance: !!opt.iceLance,
        iceLanceExpires: !!opt.iceLanceExpires,
        freezeOnHit: opt.freezeOnHit || 0,
        fireAttribute: !!opt.fireAttribute,
        iceFireStage: opt.iceFireStage || 0,
        poisonFire: !!opt.poisonFire,
        darkPierceScale: opt.darkPierceScale || 0,
        waveAmp: opt.waveAmp,
        waveFreq: opt.waveFreq,
        originX: opt.originX,
        originY: opt.originY,
        starTurnAfter: opt.starTurnAfter,
        starTargetId: opt.starTargetId,
        starHold: !!opt.starHold,
        starMagicDrift: !!opt.starMagicDrift,
        starNoTurn: !!opt.starNoTurn,
        starOriginalDx: opt.starOriginalDx,
        starOriginalDy: opt.starOriginalDy,
        starFreeDx: opt.starFreeDx,
        starFreeDy: opt.starFreeDy,
        storedIndex: opt.storedIndex,
        smallPierce: opt.smallPierce || 0,
        ignoreZombieId: opt.ignoreZombieId,
        pultBounceLeft: opt.pultBounceLeft || 0,
        firelotusAoe: opt.firelotusAoe || 0,
        giftBox: !!opt.giftBox,
        knockback: opt.knockback || 0,
        oneHitOnly: !!opt.oneHitOnly,
        fumeLevelAtFire: opt.fumeLevelAtFire,
        sniperBullet: !!opt.sniperBullet,
        rowSpan: opt.rowSpan || 0,
        hitRowMin: opt.hitRowMin,
        hitRowMax: opt.hitRowMax,
        strictRow: !!opt.strictRow,
        fullscreenHit: !!opt.fullscreenHit,
        hitRadiusBonus: opt.hitRadiusBonus || 0
      })
    }

    function s7DirectHit(z, damage, p, opt = {}) {
      if (!z || z.dead) return false;
      const didHit = damageZombie(z, damage, {
        source: p,
        ignore2: !!opt.ignore2,
        ash: !!opt.ash,
        element: !!opt.element,
        pierceAll: !!opt.pierceAll,
        noLumenChain: !!opt.noLumenChain
      });
      if (!didHit) return false;
      if (opt.cold) s7ApplyElement(z, "cold", opt.cold, p);
      if (opt.fire) s7ApplyElement(z, "fire", opt.fire, p);
      if (opt.poison) {
        z.lastPoisonSource = p;
        s7ApplyElement(z, "poison", opt.poison, p)
      }
      if (opt.lumen) s7ApplyElement(z, "lumen", opt.lumen, p);
      if (opt.dark) s7ApplyElement(z, "dark", opt.dark, p);
      if (opt.vuln) z.s7Vuln = Math.min(opt.vuln, z.s7Vuln ? Math.max(z.s7Vuln, opt.vuln) : opt.vuln);
      return true
    }
    const S7_SCAREDY_RULE = Object.freeze({
      minInterval: .4,
      fearImmuneAtFullSpeedOnly: true,
      baseInterval: 1.5,
      maxInterval: 2,
      stepPerShot: .05,
      idleStepSeconds: 1,
      idleRecoveryPerStep: .1,
      damageByLevel: Object.freeze([20, 25, 25, 25, 30, 70]),
      darkChanceByLevel: Object.freeze([.2, .2, .5, .5, .5, .5]),
      darkChancePerKill: .02,
      darkFiveKillThreshold: 40,
      postThresholdDamagePerKill: 1
    });

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ScaredyInterval

    // [原源码行 11250] 图片补充：胆小菇缩头与大喷菇灵魂孢子的唯一规则源。

    // -----------------------------------------------------------------------------

    function s7ScaredyInterval(p) {
      return finitePositive(p?.s7?.scaredyInterval, S7_SCAREDY_RULE.baseInterval)
    }

    function s7ScaredyAtMaxAttackSpeed(p) {
      return s7ScaredyInterval(p) <= S7_SCAREDY_RULE.minInterval + 1e-6
    }

    function s7ScaredyIgnoresFear(p) {
      // 最新口径：只有真正达到满攻速（最低0.4秒间隔）才免疫缩头。
      // 0.45秒等“接近满速”状态仍会正常缩头。
      return s7ScaredyAtMaxAttackSpeed(p)
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ScaredyShotDamage

    // v10.9.21机制修复：只有最低0.4秒满攻速状态不缩头；0.45秒仍按3×3威胁正常缩头。

    // -----------------------------------------------------------------------------

    function s7ScaredyShotDamage(p) {
      const level = clamp(p?.s7?.level || 0, 0, 5);
      return S7_SCAREDY_RULE.damageByLevel[level] + Math.max(0, finiteNumber(p?.s7?.darkKillBonus, 0))
    }

    function s7ScaredyDarkChance(p) {
      const level = clamp(p?.s7?.level || 0, 0, 5);
      return clamp(S7_SCAREDY_RULE.darkChanceByLevel[level] + (level >= 3 ? Math.max(0, finiteNumber(p?.s7?.darkBonus,
        0)) : 0), 0, 1)
    }

    function s7RecordScaredyKill(p, z) {
      if (!p || p.dead || p.key !== "scaredy") return;
      const level = clamp(p.s7?.level || 0, 0, 5);
      if (level < 3) return;
      p.s7.darkBonus = Math.max(0, finiteNumber(p.s7.darkBonus, 0)) + S7_SCAREDY_RULE.darkChancePerKill;
      if (level < 5 || (s7Elem(z).dark || 0) < 5) return;
      p.s7.darkFiveKills = Math.max(0, Math.floor(finiteNumber(p.s7.darkFiveKills, 0))) + 1;
      if (p.s7.darkFiveKills > S7_SCAREDY_RULE.darkFiveKillThreshold) p.s7.darkKillBonus = Math.max(0, finiteNumber(p.s7
        .darkKillBonus, 0)) + S7_SCAREDY_RULE.postThresholdDamagePerKill
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ScaredyThreatIn3x3

    // [原源码行 11304] 3阶：每次击杀只提高2%的附暗熠概率；不存在任何斩杀判定。

    // [原源码行 11309] 5阶：累计击杀40个“死亡前持有5层暗熠”的僵尸后，

    // [原源码行 11310] 从第41个起，每次此类击杀仅令基础子弹伤害+1，伤害无上限。

    // -----------------------------------------------------------------------------

    function s7ScaredyThreatIn3x3(p) {
      if (!state || !p || p.dead) return null;
      const minRow = Math.max(0, p.row - 1);
      const maxRow = Math.min(ROWS - 1, p.row + 1);
      const minCol = p.col - 1;
      const maxCol = p.col + 1;
      return state.zombies.find(q => {
        if (!canPlantTargetZombie(q, {
            source: p
          })) return false;
        if (q.row < minRow || q.row > maxRow) return false;
        const zombieCell = Math.floor(q.x);
        return zombieCell >= minCol && zombieCell <= maxCol
      }) || null
    }
    const S7_FUME_RULE = Object.freeze({
      directDamage: 20,
      damageLossPerCell: 1,
      minDirectDamage: 1,
      soulDamage: 22,
      baseMaxSouls: 20,
      level5SoulMultiplier: 2,
      level5Knockback: .0625,
      soulShotGap: 0
    });

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7FumeSoulCap

    // [原源码行 11327] “可判定敌方僵尸”沿用胆小菇自身的正常索敌口径：

    // [原源码行 11328] 地下矿工、空中气球、潜水状态、正在跨越的跳跃单位，

    // [原源码行 11329] 以及尚未进入可伤线的僵尸都不会让胆小菇误缩头。

    // -----------------------------------------------------------------------------

    function s7FumeSoulCap() {
      return S7_FUME_RULE.baseMaxSouls
    }

    function s7FumeTargets(p) {
      return state.zombies.filter(q => canPlantTargetZombie(q, {
        row: p.row,
        source: p
      }) && !(q.landingInvuln > 0) && q.x >= p.col - .2 && q.x <= DAMAGE_BOUNDARY_X).sort((a, b) => a.x - b.x)
    }

    function s7FumeDirectDamage(p, z, level) {
      if (level >= 5) return S7_FUME_RULE.directDamage;
      const distanceCells = Math.max(0, Math.floor(Math.abs(z.x - (p.col + .5)) + 1e-9));
      return Math.max(S7_FUME_RULE.minDirectDamage, S7_FUME_RULE.directDamage - distanceCells * S7_FUME_RULE
        .damageLossPerCell)
    }

    function s7FireFumeSouls(p, target, count, level) {
      const n = Math.min(s7FumeSoulCap(level), Math.max(0, Math.floor(count || 0)));
      for (let i = 0; i < n; i++) {
        s7Shoot(p, target, S7_FUME_RULE.soulDamage, {
          kind: "soulSpore",
          torchable: false,
          knockback: level === 5 ? S7_FUME_RULE.level5Knockback : 0,
          oneHitOnly: true,
          fumeLevelAtFire: level,
          delay: i * S7_FUME_RULE.soulShotGap,
          emoji: "🟣"
        })
      }
      if (n > 0) addEffect(p.row, p.col + .5, `灵魂孢子×${n}`, "#c084fc", .45);
      return n
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7CactusGoldenPushRow

    // [原源码行 11386] 只有5阶灵魂孢子带击退；距离为旧值的一半。

    // -----------------------------------------------------------------------------

    function s7CactusGoldenPushRow(p) {
      if (!state || !p) return 0;
      addBullet({
        x: p.col + .55,
        y: p.row + .5,
        row: p.row,
        dx: 8.5,
        damage: 0,
        kind: "cactusGold",
        from: p,
        airOk: false,
        torchable: false,
        life: 8,
        pierce: Infinity,
        cactusGold: true,
        emoji: "✨🔱"
      });
      return 1
    }

    function s7ExplodenutBowlingImpact(row, hitX, source) {
      if (!state || !source) return 0;
      let hitCount = 0;
      for (const z of finiteArray(state.zombies)) {
        if (!z || z.dead || z.dying || z.friendly || z.row !== row || isS7FlyingZombie(z) || isUnderground(z)) continue;
        const dist = Math.abs(z.x - hitX);
        if (dist <= 1.5 && s7DirectHit(z, 300, source)) hitCount++
      }
      addEffect(row, hitX, `爆炸保龄300·半径1.5${hitCount?`·命中${hitCount}`:""}`, "#fbbf24", .8);
      return hitCount
    }

    function s7LaunchExplodenutBowling(p, label = "爆炸保龄球") {
      if (!state || !p || p.dead || (p.s7?.level || 0) < 5) return false;
      addBullet({
        x: p.col + .5,
        y: p.row + .5,
        row: p.row,
        dx: 3.2,
        damage: 0,
        kind: "explodenutBowling",
        from: p,
        torchable: false,
        airOk: false,
        life: 5,
        explodenutBowling: true,
        emoji: "💣🥜"
      });
      addEffect(p.row, p.col + .5, label, "#fbbf24", .55);
      return true
    }

    function s7SniperLoadInterval(p, lv, baseLoad) {
      // 只有5级装填周期真正需要威胁度；在周期开始/完成时扫描一次，
      // 不再每个逻辑帧对全场僵尸做重复索敌，也不在热循环中创建闭包。
      if (lv >= 5) s7SniperLockTarget(p);
      const maxThreat = finiteNumber(p.s7?.sniperMaxThreat, 0);
      return lv >= 5 ? Math.max(.5, baseLoad + s7SniperIntervalAdjustment(maxThreat, 1)) : baseLoad
    }

    function s7PlantPassive(p, dt) {
      const cactusInvincibleWasActive = p.key === "cactus" && (p.s7?.invincible || 0) > 0;
      if (p.s7?.invincible > 0) p.s7.invincible = Math.max(0, p.s7.invincible - dt);
      if (p.s7?.wind > 0) p.s7.wind -= dt;
      if (p.s7?.shine > 0) p.s7.shine -= dt;
      if (p.s7?.focus > 0) p.s7.focus -= dt;
      if (p.s7?.fertilizer > 0) p.s7.fertilizer -= dt;
      if (p.s7?.puffFireAnim > 0) p.s7.puffFireAnim -= dt;
      if (p.s7?.b03bFireTimer > 0) p.s7.b03bFireTimer = Math.max(0,p.s7.b03bFireTimer-dt);
      if (p.s7?.b03bGustTimer > 0) p.s7.b03bGustTimer = Math.max(0,p.s7.b03bGustTimer-dt);
      if (p.s7?.b03bUltTimer > 0) p.s7.b03bUltTimer = Math.max(0,p.s7.b03bUltTimer-dt);
      if (p.s7?.userGridActionTimer > 0) p.s7.userGridActionTimer = Math.max(0,p.s7.userGridActionTimer-dt);
      if (p.s7?.garlicDeathCd > 0) p.s7.garlicDeathCd -= dt;
      if (p.key === "garlic" && !(p.s7?.fakeDeath > 0)) p.hp = Math.min(p.maxHp, p.hp + 2 * dt);
      const lv = p.s7?.level || 0;
      if (p.key === "plantern" && lv >= 5) {
        s7PlanternTransfuse(p, dt);
        if (p.dead) return
      }
      if (p.key === "sniper") {
        const baseLoad = lv >= 4 ? 5.5 : 7.5;
        if (p.s7.sniperLoadCd == null) p.s7.sniperLoadCd = s7SniperLoadInterval(p, lv, baseLoad);
        p.s7.sniperLoadCd -= dt;
        if (p.s7.sniperLoadCd <= 0) {
          const load = s7SniperLoadInterval(p, lv, baseLoad);
          while (p.s7.sniperLoadCd <= 0) {
            p.s7.sniperAmmo = (p.s7.sniperAmmo || 0) + 1;
            p.s7.sniperLoadCd += load
          }
        }
      }
      if (p.key === "wallnut" && lv >= 3) {
        const rate = p.maxHp * (p.hp < p.maxHp * .3 ? .04 : .02);
        p.hp = Math.min(p.maxHp, p.hp + rate * dt);
        if (lv >= 5) {
          if (p.s7.shieldCd == null) p.s7.shieldCd = 0;
          p.s7.shieldCd -= dt;
          if (p.s7.shieldCd <= 0) {
            p.s7.shieldCd = 120;
            for (const teammate of s7LanePlants(p.row)) {
              teammate.shield = Math.max(teammate.shield || 0, 200);
              addEffect(teammate.row, teammate.col + .5, "全队盾200", "#fde68a")
            }
          }
        }
      }
      if (p.key === "tallnut" && lv >= 5) p.hp = Math.min(p.maxHp, p.hp + 50 * dt);
      if (p.key === "cactus") {
        if (p.s7.cactusGoldenCd > 0) p.s7.cactusGoldenCd = Math.max(0, p.s7.cactusGoldenCd - dt);
        if (p.s7.cactusHealLock > 0) p.s7.cactusHealLock = Math.max(0, p.s7.cactusHealLock - dt);
        if (cactusInvincibleWasActive && !(p.s7.invincible > 0) && p.s7.cactusRebirthPending) {
          p.s7.cactusRebirthPending = false;
          p.hp = Math.min(p.maxHp, 100);
          p.s7.cactusHealLock = 5;
          const pushed = s7CactusGoldenPushRow(p);
          addEffect(p.row, p.col + .5, `不屈结束·金刺推行${pushed}`, "#fef08a", 1)
        }
        if (!(p.s7.invincible > 0) && !(p.s7.cactusHealLock > 0)) p.hp = Math.min(p.maxHp, p.hp + 50 * dt)
      }
      if (p.key === "explodenut" && lv >= 3) p.hp = Math.min(p.maxHp, p.hp + 10 * dt);
      if (p.key === "spikerock" && lv >= 5) p.hp = Math.min(p.maxHp, p.hp + 20 * dt);
      if (p.key === "gloom" && lv >= 4) p.hp = Math.min(p.maxHp, p.hp + S7_GLOOM_RULE.passiveRegen * dt);
      if (p.key === "garlic" && p.s7?.fakeDeath > 0) {
        p.s7.fakeDeath -= dt;
        if (p.s7.fakeDeath <= 0) {
          p.s7.fakeDeath = 0;
          p.hp = p.maxHp;
          p.cd = 0;
          addEffect(p.row, p.col + .5, "大蒜复活", "#a3e635")
        }
      }
      if (p.key === "seashroom" && !p.s7?.isClone) {
        const grow = [150, 120, 100, 100, 80, 80][lv];
        const max = [2, 2, 2, 3, 3, 3][lv];
        p.s7.cloneCd = (p.s7.cloneCd || grow) - dt;
        const cloneList = state.plants.filter(q => !q.dead && q.key === "seashroom" && q.s7?.isClone && q.s7
          ?.parentId === p.id);
        for (const q of cloneList) {
          q.s7.level = lv;
          q.s7.upgradeHealedThrough = lv
        }
        const aliveClones = cloneList.length;
        if (p.s7.cloneCd <= 0 && aliveClones < max) {
          p.s7.cloneCd = grow;
          const clone = makePlant("seashroom", p.row, p.col);
          clone.hp = 300;
          clone.maxHp = 300;
          clone.s7 = clone.s7 || {};
          clone.s7.isClone = true;
          clone.s7.parentId = p.id;
          clone.s7.exp = 0;
          clone.s7.level = lv;
          clone.s7.upgradeHealedThrough = lv;
          clone.s7.cloneCd = 0;
          clone.s7.clones = 0;
          clone.maxHp = 300;
          clone.hp = 300;
          state.plants.push(clone);
          addEffect(p.row, p.col + .5, "分身生成", "#67e8f9")
        }
      }
      if (p.key === "starfruit") {
        if (lv < 5) {
          p.s7.orbitStars = 0;
          p.s7.orbitRecharge = 1;
          p.s7.orbitFire = 0
        }
        if (lv >= 5 && p.s7.starBigCd > 0) p.s7.starBigCd -= dt;
        if (lv >= 5) s7DrainStarExpToQueue(p)
        if (lv >= 5) p.s7.orbitStars = Math.min(5, p.s7.orbitStars ?? 5);
        p.s7.orbitRecharge = (p.s7.orbitRecharge ?? 1) - dt;
        while (lv >= 5 && p.s7.orbitRecharge <= 0) {
          p.s7.orbitRecharge += 1;
          p.s7.orbitStars = Math.min(5, (p.s7.orbitStars || 0) + 1)
        }
        p.s7.orbitFire = Math.max(0, (p.s7.orbitFire || 0) - dt);
        if (lv >= 5 && (p.s7.orbitStars || 0) > 0 && p.s7.orbitFire <= 0) {
          const z = s7StarOrbitTarget(p);
          if (z) {
            p.s7.orbitStars--;
            p.s7.orbitFire = .2;
            s7Shoot(p, z, 30, {
              homing: true,
              kind: "star",
              emoji: "✦",
              torchable: false,
              lumen: 1,
              airOk: false,
              x: p.col + .5,
              y: p.row + .5
            });
            addEffect(p.row, p.col + .5, "环绕小星出击", "#fde047", .24)
          }
        }
      }
      if (p.key === "kernel" && lv >= 5) {
        const close = s7KernelFrontNear(p);
        if (close) p.s7.kernelCloseReduction = Math.min(2.5, (p.s7.kernelCloseReduction || 0) + .05 * dt);
        else p.s7.kernelCloseReduction = 0
      }
      if (p.s7?.barleyOriginal) {
        const barleyState = s7UpdateBarleyLifecycle(p, dt);
        if (barleyState === "inactive") return
      }
      if (p.key === "timegrass" && lv >= 3) p.hp = Math.min(p.maxHp, p.hp + 20 * dt);
      if (p.key === "timegrass") timegrassUpdatePortal(p, dt);
      if (p.key === "scaredy") {
        const threat = s7ScaredyThreatIn3x3(p);
        const ignoresFear = s7ScaredyIgnoresFear(p);
        const nextHiding = !!threat && !ignoresFear;
        if (nextHiding !== !!p.s7.hiding) {
          if (nextHiding) {
            addEffect(p.row, p.col + .5, "😱", "#c4b5fd", .6);
            addEffect(p.row, p.col + .3, "💧", "#93c5fd", .5)
          } else {
            addEffect(p.row, p.col + .5, ignoresFear ? "高速·不缩头" : "😌", "#86efac", .5);
            if (!ignoresFear) addEffect(p.row, p.col + .7, "✨", "#fef08a", .4)
          }
          p.s7.hideAnim = .5
        }
        p.s7.hiding = nextHiding;
        p.s7.scaredyThreatId = threat ? threat.id : null;
        if (nextHiding) {
          p.s7.scaredyInterval = S7_SCAREDY_RULE.maxInterval;
          p.s7.scaredyIdleTime = 0
        } else {
          const hasTarget = !!s7Nearest(p.row, p.col, {
            range: 9,
            source: p
          });
          if (!hasTarget) {
            p.s7.scaredyIdleTime = Math.max(0, finiteNumber(p.s7.scaredyIdleTime, 0)) + dt;
            while (p.s7.scaredyIdleTime + 1e-9 >= S7_SCAREDY_RULE.idleStepSeconds) {
              p.s7.scaredyIdleTime -= S7_SCAREDY_RULE.idleStepSeconds;
              p.s7.scaredyInterval = Math.min(S7_SCAREDY_RULE.maxInterval, s7ScaredyInterval(p) + S7_SCAREDY_RULE
                .idleRecoveryPerStep)
            }
          } else {
            p.s7.scaredyIdleTime = 0
          }
        }
        if (p.s7.hideAnim > 0) p.s7.hideAnim -= dt
      }
      if (p.key === "squash") {
        const lv2 = p.s7.level || 0;
        const homeX = p.col + .5;
        p.cd = 999;
        const st = p.s7.squashState;
        if (!st) {
          p.s7.squashCurX = null;
          p.s7.squashYOffset = 0;
          p.s7.squashAway = false;
          p.s7.invincible = 0;
          const q = s7SquashTarget(p, homeX);
          if (q) {
            p.s7.squashState = "targeting";
            p.s7.squashTimer = .5;
            p.s7.squashChain = 0;
            p.s7.squashLastHitId = null
          }
        } else if (st === "targeting") {
          p.s7.squashTimer -= dt;
          if (p.s7.squashAway) p.s7.invincible = .1;
          else p.s7.invincible = 0;
          if (p.s7.squashTimer <= 0) {
            const fromX = p.s7.squashAway ? p.s7.squashCurX : homeX;
            let q = null;
            if (!p.s7.squashDeath) q = s7SquashTarget(p, fromX, true);
            const tx = p.s7.squashDeath ? p.s7.squashDeathTargetX : q ? q.x : null;
            if (tx != null) {
              p.s7.squashFromX = fromX;
              p.s7.squashTargetX = tx;
              p.s7.squashCurX = fromX;
              p.s7.squashState = "attacking"; s7MarkPlantSkillVisual(p,1.25);
              p.s7.squashAttackSub = "fly";
              p.s7.squashTimer = .1;
              p.s7.squashAway = true
            } else if (p.s7.squashAway) {
              p.s7.squashState = "returning";
              p.s7.squashReturnSub = "wait";
              p.s7.squashTimer = .5;
              p.s7.squashFromX = p.s7.squashCurX;
              p.s7.squashTargetX = homeX
            } else {
              p.s7.squashState = null;
              p.s7.squashChain = 0;
              p.s7.squashLastHitId = null
            }
          }
        } else if (st === "attacking") {
          p.s7.squashTimer -= dt;
          p.s7.invincible = .1;
          p.s7.squashAway = true;
          const sub = p.s7.squashAttackSub;
          if (sub === "fly") {
            const prog = clamp(1 - p.s7.squashTimer / .1, 0, 1);
            p.s7.squashCurX = p.s7.squashFromX + (p.s7.squashTargetX - p.s7.squashFromX) * prog;
            p.s7.squashYOffset = .5 * prog;
            if (p.s7.squashTimer <= 0) {
              p.s7.squashAttackSub = "wait";
              p.s7.squashTimer = .3;
              p.s7.squashCurX = p.s7.squashTargetX;
              p.s7.squashYOffset = .5
            }
          } else if (sub === "wait") {
            p.s7.squashCurX = p.s7.squashTargetX;
            p.s7.squashYOffset = .5;
            if (p.s7.squashTimer <= 0) {
              p.s7.squashAttackSub = "fall";
              p.s7.squashTimer = .1
            }
          } else if (sub === "fall") {
            const prog = clamp(1 - p.s7.squashTimer / .1, 0, 1);
            p.s7.squashCurX = p.s7.squashTargetX;
            p.s7.squashYOffset = .5 * (1 - prog);
            if (p.s7.squashTimer <= 0) {
              p.s7.squashYOffset = 0;
              if (p.s7.squashDeath) {
                // 亡语砸击与普通连砸、返回落地共用同一窝瓜 AOE 判定，
                // 禁止再使用独立的近似常量，避免三条路径范围漂移。
                for (const t of state.zombies)
                  if (!t.dead && !t.friendly && t.row === p.row && s7SquashAoeTouchesZombie(t, p.s7.squashTargetX))
                    damageZombie(t, 1800, {
                      source: p,
                      noTransform: true,
                      ignore2: true
                    });
                addEffect(p.row, p.s7.squashTargetX, "亡语砸1800", "#a3e635");
                p.s7.squashState = null;
                p.s7.squashCurX = null;
                p.s7.squashYOffset = 0;
                p.s7.squashAway = false;
                p.s7.invincible = 0;
                p.dead = true;
                return
              }
              // 连砸伤害+80是5级特性；0-4级连砸与首次砸击伤害一致。
              const dmg = (lv2 >= 2 ? 250 : 200) + (lv2 >= 5 ? p.s7.squashChain * 80 : 0);
              p.s7.squashLastDamage = dmg;
              let squashHitCount = 0;
              for (const t of state.zombies)
                if (!t.dead && t.row === p.row && s7SquashAoeTouchesZombie(t, p.s7.squashTargetX)) {
                  if (s7DirectHit(t, dmg, p, {
                      ignore2: true
                    })) squashHitCount++;
                  if (lv2 >= 3) s7ApplyZombieKnockback(t, lv2 >= 5 ? .06 : .03, {
                    maxX: COLS + .3,
                    reason: "窝瓜砸击击退"
                  })
                } const survivor = state.zombies.filter(t => !t.dead && t.row === p.row && s7SquashAoeTouchesZombie(t,
                p.s7.squashTargetX)).sort((a, b) => Math.abs(a.x - p.s7.squashTargetX) - Math.abs(b.x - p.s7
                .squashTargetX))[0];
              p.s7.squashLastHitId = survivor?.id ?? null;
              addEffect(p.row, p.s7.squashTargetX, "连砸" + (p.s7.squashChain + 1), "#a3e635");
              p.s7.squashChain++;
              const prob = [.6, .7, .7, .7, .8, .8][lv2];
              if (squashHitCount > 0 && s7BattleRandom() < prob) {
                p.s7.squashState = "targeting";
                p.s7.squashTimer = .5
              } else {
                p.s7.squashState = "returning";
                p.s7.squashReturnSub = "wait";
                p.s7.squashTimer = .5;
                p.s7.squashFromX = p.s7.squashCurX;
                p.s7.squashTargetX = homeX
              }
            }
          }
        } else if (st === "returning") {
          p.s7.squashTimer -= dt;
          p.s7.invincible = .1;
          p.s7.squashAway = true;
          const sub = p.s7.squashReturnSub;
          if (sub === "wait") {
            p.s7.squashYOffset = 0;
            if (p.s7.squashTimer <= 0) {
              p.s7.squashReturnSub = "fly";
              p.s7.squashTimer = 1;
              p.s7.squashFromX = p.s7.squashCurX;
              p.s7.squashTargetX = homeX
            }
          } else if (sub === "fly") {
            const prog = clamp(1 - p.s7.squashTimer / 1, 0, 1);
            p.s7.squashCurX = p.s7.squashFromX + (p.s7.squashTargetX - p.s7.squashFromX) * prog;
            p.s7.squashYOffset = .5 * Math.sin(prog * Math.PI);
            if (p.s7.squashTimer <= 0) {
              addEffect(p.row, homeX, "回到原位", "#a3e635", .35);
              p.s7.squashState = null;
              p.s7.squashCurX = null;
              p.s7.squashYOffset = 0;
              p.s7.squashAway = false;
              p.s7.invincible = 0;
              p.s7.squashChain = 0;
              p.s7.squashLastHitId = null
            }
          }
        }
      }
      if (p.key === "magnet" && p.s7?.magnetState) {
        p.cd = 999;
        const mlv = p.s7.level || 0;
        const homeX = p.col + .5;
        const homeRow = p.row;
        const baseAttackInterval = mlv >= 2 ? 1.2 : 1.5;
        const speedMultiplier = (p.buff > 0 ? 2 : 1) * (p.s7?.shine > 0 ? 2 : 1) * (p.s7?.wind > 0 ? 1.25 : 1);
        const moveTime = Math.max(.12, (baseAttackInterval / speedMultiplier - .08) / 2);
        const st = p.s7.magnetState;
        p.s7.magnetTimer -= dt;
        if (st === "pulling") {
          const prog = clamp(1 - p.s7.magnetTimer / p.s7.magnetPullTime, 0, 1);
          p.s7.magnetCurX = p.s7.magnetFromX + (homeX - p.s7.magnetFromX) * prog;
          p.s7.magnetCurRow = p.s7.magnetFromRow + (homeRow - p.s7.magnetFromRow) * prog;
          if (p.s7.magnetTimer <= 0) {
            const sz = state.zombies.find(q => q.id === p.s7.magnetSourceZombieId && !q.dead);
            if (sz) {
              if (p.s7.magnetItem.kind === "armor") {
                const ar = sz.armors.find(a => a.name === p.s7.magnetItem.armorName && a.hp > 0);
                if (ar) {
                  ar.hp = 0;
                  sz.armors = sz.armors.filter(x => x.hp > 0);
                  if (ar.name === "扶梯") {
                    if (sz.s7) sz.s7.ladderUsesRemaining = 0;
                    sz.speed = SPEEDS.ordinary;
                    setSpeedProfile(sz, "ordinary", true)
                  }
                }
              } else if (p.s7.magnetItem.kind === "pick") {
                if (!s7HasCommand("raid", sz.row)) {
                  sz.hasPick = false;
                  surfaceDigger(sz, "镐子被吸")
                }
              } else if (p.s7.magnetItem.kind === "box") {
                sz.s7 = sz.s7 || {};
                sz.s7.boxStolen = true
              }
            }
            if (p.s7.magnetItem.kind === "plant_ladder") {
              const sp = state.plants.find(q => q.id === p.s7.magnetSourcePlantId && !q.dead);
              if (sp) {
                sp.laddered = false;
                sp.ladderExpire = 0
              }
            }
            addEffect(homeRow, homeX, "吸到!", "#93c5fd");
            p.s7.magnetState = "holding";
            p.s7.magnetTimer = 0
          }
        } else if (st === "holding") {
          p.s7.magnetCurX = homeX;
          p.s7.magnetCurRow = homeRow;
          const target = state.zombies.filter(q => !q.dead && !q.dying && !q.friendly && !q.s7?.command && q.row === p
            .row && canPlantTargetZombie(q, {
              row: p.row,
              canHitAir: true,
              source: p
            })).sort((a, b) => a.x - b.x)[0];
          if (target) {
            p.s7.magnetTargetId = target.id;
            p.s7.magnetFromX = homeX;
            p.s7.magnetFromRow = homeRow;
            p.s7.magnetTargetX = target.x;
            p.s7.magnetTargetRow = target.row;
            p.s7.magnetCurX = homeX;
            p.s7.magnetCurRow = homeRow;
            p.s7.magnetState = "flying";
            p.s7.magnetTimer = moveTime;
            p.s7.magnetMoveTime = moveTime
          } else {
            p.s7.magnetState = "idle_wait";
            p.s7.magnetTimer = .2
          }
        } else if (st === "idle_wait") {
          if (p.s7.magnetTimer <= 0) p.s7.magnetState = "holding"
        } else if (st === "flying") {
          const prog = clamp(1 - p.s7.magnetTimer / p.s7.magnetMoveTime, 0, 1);
          p.s7.magnetCurX = p.s7.magnetFromX + (p.s7.magnetTargetX - p.s7.magnetFromX) * prog;
          p.s7.magnetCurRow = p.s7.magnetFromRow + (p.s7.magnetTargetRow - p.s7.magnetFromRow) * prog;
          if (p.s7.magnetTimer <= 0) {
            p.s7.magnetState = "hitting";
            p.s7.magnetTimer = .08;
            p.s7.magnetHitDone = false;
            p.s7.magnetCurX = p.s7.magnetTargetX;
            p.s7.magnetCurRow = p.s7.magnetTargetRow
          }
        } else if (st === "hitting") {
          if (!p.s7.magnetHitDone) {
            p.s7.magnetHitDone = true;
            const tz = state.zombies.find(q => q.id === p.s7.magnetTargetId && !q.dead);
            if (tz) {
              s7DirectHit(tz, 75, p, {
                ignore2: true
              });
              if (mlv >= 3) {
                s7ApplyZombieKnockback(tz, mlv >= 5 ? .2 : .1, {
                  maxX: COLS + .3,
                  reason: "磁力菇击退"
                });
                addEffect(tz.row, tz.x, mlv >= 5 ? "强击退" : "击退", "#93c5fd")
              }
              addEffect(tz.row, tz.x, "锤击75", "#93c5fd")
            }
          }
          if (p.s7.magnetTimer <= 0) {
            p.s7.magnetFromX = p.s7.magnetTargetX;
            p.s7.magnetFromRow = p.s7.magnetTargetRow;
            p.s7.magnetState = "returning";
            p.s7.magnetTimer = moveTime;
            p.s7.magnetMoveTime = moveTime
          }
        } else if (st === "returning") {
          const prog = clamp(1 - p.s7.magnetTimer / p.s7.magnetMoveTime, 0, 1);
          p.s7.magnetCurX = p.s7.magnetFromX + (homeX - p.s7.magnetFromX) * prog;
          p.s7.magnetCurRow = p.s7.magnetFromRow + (homeRow - p.s7.magnetFromRow) * prog;
          if (p.s7.magnetTimer <= 0) {
            const damageChance = mlv >= 5 ? .3 : .4;
            const item = p.s7.magnetItem;
            if (item && s7BattleRandom() < damageChance) {
              item.damageStage = Math.min(item.maxDamageStages || 3, (item.damageStage || 0) + 1);
              if (item.damageStage >= (item.maxDamageStages || 3)) {
                addEffect(homeRow, homeX, "铁器彻底损坏", "#f87171");
                p.s7.magnetState = null;
                p.s7.magnetItem = null;
                p.cd = s7Cd(p)
              } else {
                addEffect(homeRow, homeX, `铁器损坏${item.damageStage}/${item.maxDamageStages||3}`, "#fca5a5");
                p.s7.magnetState = "holding";
                p.s7.magnetTimer = 0
              }
            } else {
              p.s7.magnetState = "holding";
              p.s7.magnetTimer = 0
            }
          }
        }
      }
    }

