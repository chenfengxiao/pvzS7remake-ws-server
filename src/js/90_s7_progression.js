"use strict";

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7Cfg

    // [原源码行 9872] srcdoc 已通过 window.name 在首帧完成同一批初始化时，仅补做尺寸同步，

    // [原源码行 9873] 避免 load 事件的确认消息让战斗无故重开一次。

    // [原源码行 9903] The iframe owns keyboard focus after the user clicks a sub-map. Previously

    // [原源码行 9904] quad-child mode returned before registering any key listener, so the first

    // [原源码行 9905] physical key was silently lost until an outer HTML button regained focus.

    // [原源码行 10072] S7 主逻辑：飞升、元素、盲盒递归、出怪、植物/僵尸特性

    // [原源码行 10081] S7 RULES: leveling, elements, plant actions

    // -----------------------------------------------------------------------------

    function s7Cfg(pOrKey) {
      const k = typeof pOrKey === "string" ? pOrKey : pOrKey.key;
      return PLANT_RULES[k] || null
    }

    function s7Thresholds(key) {
      const c = s7Cfg(key);
      return c ? EXP_GROUPS[c.group] || EXP_GROUPS.main : EXP_GROUPS.main
    }

    function s7LevelFromExp(key, exp) {
      const th = s7Thresholds(key);
      let lv = 0;
      for (let i = 0; i < th.length; i++)
        if (exp >= th[i]) lv = i;
      return clamp(lv, 0, 5)
    }

    function s7CanReceiveExp(p) {
      if (!p || p.dead || !PLANT_RULES[p.key]) return false;
      if (PLANTS[p.key]?.expEligible === false || p.s7?.barleyOriginal || p.s7?.isClone) return false;
      if (p.key === "starfruit" && (p.s7?.level || 0) >= 5) return true;
      return (p.s7?.level || 0) < 5
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7MaxExp

    // v10.9.9：五阶杨桃继续收取经验；溢出达到1437时至多挂起一次大星，释放后经验回到五阶最低值并清空全部溢出。

    // -----------------------------------------------------------------------------

    function s7MaxExp(key) {
      const th = s7Thresholds(key);
      return th[th.length - 1]
    }

    function s7MaxHp(p) {
      const c = s7Cfg(p);
      const base = c ? c.hp[p.s7?.level || 0] ?? c.hp[0] ?? PLANTS[p.key].hp : p.maxHp;
      if (p?.key === "chomper") return base + Math.min(s7ChomperLevelCap(p), p.s7?.eaten || 0) * 150;
      return base
    }

    function s7LaneThreatNorm(row) {
      if (!state) return 0;
      const arr = state.zombies.filter(z => !z.dead && !z.dying && !z.friendly && z.row === row && isDamageableZombie(
        z));
      if (!arr.length) return -1;
      let best = 0;
      for (const z of arr) {
        const hpFactor = Math.min(3, totalHp(z) / 600);
        const homeFactor = clamp((DAMAGE_BOUNDARY_X - z.x + 4) / 4, .5, 2);
        best = Math.max(best, (z.threat || 1) * hpFactor * homeFactor)
      }
      return clamp((best - 5) / 7, -1, 1)
    }

    function s7Cd(p) {
      if (p?.s7?.nextCdOverride != null) {
        const v = p.s7.nextCdOverride;
        delete p.s7.nextCdOverride;
        return Math.max(.08, v)
      }
      const c = s7Cfg(p);
      let cd = c ? c.cd[p.s7?.level || 0] ?? c.cd[0] ?? PLANTS[p.key].cd : PLANTS[p.key].cd || 1;
      const lv = p.s7?.level || 0;
      if (p.key === "scaredy") cd = p.s7?.scaredyInterval || 1.5;
      if (p.key === "puff") {
        const q = s7Nearest(p.row, p.col, {
          range: 8,
          source: p
        });
        if (q) {
          const dist = Math.max(0, Math.abs(q.x - (p.col + .5)));
          cd = Math.max(.5, 1.5 - Math.max(0, 8 - dist) * .25)
        } else cd = 1.5
      }
      if (p.key === "squash") cd = 3;
      if (p.key === "threepeater" && lv >= 3) cd = Math.max(1.3, cd - Math.max(0, p.s7?.threepeaterCdReduction || 0));
      if (p.key === "sniper" && lv >= 3) {
        const maxThreat = finiteNumber(p.s7?.sniperMaxThreat, 0);
        cd += s7SniperIntervalAdjustment(maxThreat, 7)
      }
      if (p.key === "iceshroom" && lv >= 5) {
        const lostHp = Math.max(0, (p.maxHp || 0) - (p.hp || 0));
        cd = Math.max(2, 7 - lostHp * .01)
      }
      if (p.key === "kernel") cd = s7KernelCurrentCd(p, cd);
      if (p.buff > 0) cd *= .5;
      if (p.s7?.wind > 0) cd /= 1.25;
      if (p.s7?.shine > 0) cd /= S7_SUNFLOWER_RULE.illuminateAttackSpeedMultiplier;
      if (p.s7?.focus > 0) cd = Math.min(cd, .5);
      if (p.s7?.fertilizer > 0) cd *= .5;
      return Math.max(p.key === "kernel" && (p.s7?.level || 0) >= 5 ? .5 : p.key === "kernel" ? 1 : .08, cd)
    }

    function s7InitPlant(p, keepExp = false) {
      const c = s7Cfg(p);
      if (!c) return p;
      if (!p.s7) p.s7 = {};
      if (!keepExp) p.s7.exp = p.s7.exp || 0;
      p.s7.level = s7LevelFromExp(p.key, p.s7.exp || 0);
      p.s7.lastLevel = p.s7.level;
      if (p.s7.upgradeHealedThrough == null) p.s7.upgradeHealedThrough = clamp(p.s7.level || 0, 0, 5);
      p.s7.maxExp = s7MaxExp(p.key);
      p.s7.kill = 0;
      p.s7.attack = 0;
      p.s7.orbit = 0;
      p.s7.orbitStars = p.key === "starfruit" && p.s7.level >= 5 ? 5 : 0;
      p.s7.orbitRecharge = 1;
      p.s7.orbitFire = 0;
      if (p.key === "starfruit") {
        p.s7.starExpAccum = Math.max(0, finiteNumber(p.s7.starExpAccum, 0));
        p.s7.starBigCd = Math.max(0, finiteNumber(p.s7.starBigCd, 0));
        p.s7.starBigQueue = Math.min(1, Math.max(0, Math.floor(finiteNumber(p.s7.starBigQueue, 0))))
      } else {
        delete p.s7.starExpAccum;
        delete p.s7.starBigCd;
        delete p.s7.starBigQueue
      }
      p.s7.special = 0;
      p.s7.spawn = 0;
      p.s7.souls = 0;
      p.s7.clones = 0;
      p.s7.cloneCd = 0;
      p.s7.gold = false;
      p.s7.binds = [];
      if (p.key === "scaredy") {
        p.s7.scaredyInterval = finitePositive(p.s7.scaredyInterval, S7_SCAREDY_RULE.baseInterval);
        p.s7.scaredyIdleTime = Math.max(0, finiteNumber(p.s7.scaredyIdleTime, 0));
        p.s7.darkBonus = Math.max(0, finiteNumber(p.s7.darkBonus, 0));
        p.s7.darkFiveKills = Math.max(0, Math.floor(finiteNumber(p.s7.darkFiveKills, 0)));
        p.s7.darkKillBonus = Math.max(0, finiteNumber(p.s7.darkKillBonus, 0));
        p.s7.hiding = false;
        p.s7.scaredyThreatId = null;
        p.s7.hideAnim = 0
      }
      if (p.key === "hypno") p.s7.charms = p.s7.level >= 1 ? 10 : 5;
      if (p.key === "firelotus") {
        p.s7.fireKills = Math.max(0, Math.floor(finiteNumber(p.s7.fireKills, 0))) % 3;
        p.s7.fertilizer = Math.max(0, finiteNumber(p.s7.fertilizer, 0))
      }
      if (p.key === "kelp") {
        const initialCooldown = Math.max(0, finiteNumber(p.cd, 0));
        p.s7.kelpSlots = Array.from({
          length: s7KelpSlotCount(p)
        }, (_, index) => ({
          index: index,
          targetId: null,
          cooldown: initialCooldown
        }));
        p.cd = 0
      }
      if (p.key === "gatling") p.s7.gatlingStars = clamp(p.s7.gatlingStars || 0, 0, 3);
      if (p.key === "sniper") {
        p.s7.sniperAmmo = Math.max(0, Math.floor(p.s7.sniperAmmo || 0));
        p.s7.sniperLoadCd = finitePositive(p.s7.sniperLoadCd, 7.5);
        p.s7.sniperShotCd = Math.max(0, finiteNumber(p.s7.sniperShotCd, 0))
      }
      if (p.key === "barley") {
        p.s7.barleyOriginal = true;
        p.s7.barleyPhase = p.s7.barleyPhase || "windup";
        // 首次变身前摇5~15秒随机（设计文档）。
        if (p.s7.barleyTransformCd == null) p.s7.barleyTransformCd = 5 + s7BattleRandom() * 10;
        p.s7.barleyPepperDormant = false;
        p.cd = 999
      } else if (p.key !== "gatling") {
        delete p.s7.gatlingStars
      }
      p.maxHp = s7MaxHp(p);
      p.hp = Math.min(p.maxHp, p.hp || p.maxHp);
      p.cd = Math.min(p.cd || 0, s7Cd(p));
      p.asleep = !!PLANTS[p.key].mushroom;
      return p
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7RefreshPlant

    // [原源码行 10187] 记录已经结算过升级回血的最高阶数。初始化/读档时从当前阶数起算，

    // [原源码行 10188] 防止状态刷新把既有阶数再次当作“刚升级”而重复回血。

    // -----------------------------------------------------------------------------

    function s7RefreshPlant(p) {
      const c = s7Cfg(p);
      if (!c || !p.s7) return;
      if (p.s7.isClone) return;
      const oldLv = p.s7.level || 0,
        oldMax = p.maxHp || PLANTS[p.key].hp;
      p.s7.level = s7LevelFromExp(p.key, p.s7.exp || 0);
      p.s7.maxExp = s7MaxExp(p.key);
      let nm = s7MaxHp(p);
      if (p.s7.reviveHpMult && p.s7.reviveHpMult < 1) nm = Math.max(30, Math.round(nm * p.s7.reviveHpMult));
      if (nm !== oldMax) {
        p.maxHp = nm;
        p.hp = Math.min(nm, (p.hp || 0) + Math.max(0, nm - oldMax))
      } else {
        p.maxHp = nm
      }
      if (p.s7.level > oldLv) {
        addEffect(p.row, p.col + .5, `${p.s7.level}阶${p.s7.level===3?"觉醒":p.s7.level===5?"飞升":""}`, "#fef08a", 1.1);
        const healedThrough = clamp(p.s7.upgradeHealedThrough == null ? oldLv : p.s7.upgradeHealedThrough, 0, 5);
        const healableLevel = clamp(p.s7.level || 0, 0, 5);
        const newlyHealedLevels = Math.max(0, healableLevel - healedThrough);
        if (newlyHealedLevels > 0) {
          const heal = Math.max(1, Math.round((p.maxHp || nm || 1) * .2 * newlyHealedLevels));
          p.hp = Math.min(p.maxHp || nm, (p.hp || 0) + heal);
          p.s7.upgradeHealedThrough = healableLevel;
          addEffect(p.row, p.col + .5, `升级回血+${heal}`, "#86efac", 1);
          log(`${TEAM_NAMES[p.row]}：${PLANTS[p.key].name} 升至 ${p.s7.level} 阶，回复 ${heal} 血。`)
        } else {
          p.s7.upgradeHealedThrough = Math.max(healedThrough, healableLevel)
        }
        if (p.key === "threepeater") s7ThreepeaterUlt(p, true);
        if (p.key === "hypno") p.s7.charms = p.s7.level >= 1 ? 10 : 5;
        if (p.key === "starfruit" && oldLv < 5 && p.s7.level >= 5) p.s7.orbitStars = 5;
        if (p.key === "explodenut" && oldLv < 5 && p.s7.level >= 5) p.cd = PLANT_RULES.explodenut.cd[5];
        if (p.key === "firelotus" && oldLv < 3 && p.s7.level >= 3) {
          p.s7.fireKills = 0;
          p.s7.fertilizer = 0
        }
        if (p.key === "sunflower") {
          const nextInterval = PLANT_RULES.sunflower.cd[p.s7.level] ?? 6;
          p.cd = Math.min(Math.max(0, finiteNumber(p.cd, nextInterval)), nextInterval)
        }
        if (p.key === "kelp") s7KelpEnsureSlots(p)
      } else if ((p.s7.level || 0) >= 5) {
        p.s7.upgradeHealedThrough = 5
      }
      p.s7.lastLevel = p.s7.level
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7LanePlants

    // [原源码行 10289] 最大生命变化时先保留原有缺血量，避免升级升血上限反而显得掉血。

    // [原源码行 10295] 升级表现和升级特效仍按实际跨越的阶数触发。

    // [原源码行 10304] 升级回血只允许每个阶数结算一次，且最多结算到5阶。

    // [原源码行 10305] 5阶后的溢出经验、杨桃满阶继续积累经验、重复刷新状态，均不得再次回血。

    // [原源码行 10335] 3阶解锁后从0开始统计击杀，低阶时期的击杀不得预存肥料进度。

    // [原源码行 10340] 升级降低生产间隔时，当前剩余时间不能继续超过新等级的生产间隔。

    // [原源码行 10341] 已经接近完成的本轮生产则保留其剩余进度，不会被升级重置。

    // [原源码行 10347] 满阶状态刷新时强制锁定，杜绝任何满阶后的升级回血回流。

    // -----------------------------------------------------------------------------

    function s7LanePlants(row) {
      return state.plants.filter(p => !p.dead && p.row === row && PLANT_RULES[p.key])
    }

    function s7LaneExperienceMultiplier(row) {
      if (!state || !Array.isArray(state.plants)) return 1;
      let goldMagnetCount = 0;
      for (const pp of state.plants) {
        if (pp && !pp.dead && pp.row === row && pp.key === "goldmagnet") goldMagnetCount++
      }
      return Math.pow(1.25, goldMagnetCount)
    }

    function s7GrantPlantExp(p, amt, laneMultiplier = null) {
      if (!p || p.versusCore === "twin" || !PLANT_RULES[p.key] || amt <= 0 || !s7CanReceiveExp(p)) return;
      if (!p.s7) s7InitPlant(p, true);
      // 经验倍率按“接收经验的本路”计算；每株存活吸金磁独立乘1.25，不再要求达到3阶。
      // 批量分配时由调用者传入同一路已计算的倍率，避免每株植物重复扫描整张植物表。
      const mult = laneMultiplier == null ? s7LaneExperienceMultiplier(p.row) : Math.max(0, finiteNumber(laneMultiplier, 1));
      const gained = amt * mult;
      const oldExp = Math.max(0, finiteNumber(p.s7.exp, 0));
      const maxExp = s7MaxExp(p.key);
      p.s7.exp = oldExp + gained;
      if (p.key !== "starfruit") {
        p.s7.exp = Math.min(p.s7.exp, maxExp)
      } else {
        const postMaxGain = Math.max(0, p.s7.exp - Math.max(oldExp, maxExp));
        if (postMaxGain > 0) p.s7.starExpAccum = Math.max(0, finiteNumber(p.s7.starExpAccum, 0)) + postMaxGain
      }
      s7RefreshPlant(p);
      if (p.key === "starfruit" && (p.s7?.level || 0) >= 5) s7DrainStarExpToQueue(p)
    }

    function s7QueueStarBig(p, count = 1) {
      if (!p || p.dead || p.key !== "starfruit") return 0;
      if (!p.s7) s7InitPlant(p, true);
      const add = Math.max(0, Math.floor(finiteNumber(count, 0)));
      if (add <= 0 || (p.s7.starBigQueue || 0) >= 1) return 0;
      p.s7.starBigQueue = 1;
      return 1
    }

    function s7DrainStarExpToQueue(p) {
      if (!p || p.dead || p.key !== "starfruit" || (p.s7?.level || 0) < 5) return 0;
      p.s7.starExpAccum = Math.max(0, finiteNumber(p.s7.starExpAccum, 0));
      if (p.s7.starExpAccum < 1437) return 0;
      return s7QueueStarBig(p, 1)
    }

    function s7ResetStarOverflowAfterBigStar(p) {
      if (!p || p.key !== "starfruit" || (p.s7?.level || 0) < 5) return;
      const fiveStageMinExp = s7MaxExp("starfruit");
      p.s7.exp = fiveStageMinExp;
      p.s7.starExpAccum = 0;
      p.s7.starBigQueue = 0;
      p.s7.level = 5;
      p.s7.maxExp = fiveStageMinExp
    }

    function s7TryFireQueuedBigStar(p, label = "储存大星") {
      if (!p || p.dead || p.key !== "starfruit" || (p.s7?.level || 0) < 3) return false;
      p.s7.starBigQueue = Math.min(1, Math.max(0, Math.floor(finiteNumber(p.s7.starBigQueue, 0))));
      if (p.s7.starBigQueue <= 0 || (p.s7.starBigCd || 0) > 0) return false;
      const fired = s7BigStar(p, label);
      if (fired > 0) {
        p.s7.starBigCd = 1;
        if ((p.s7?.level || 0) >= 5) s7ResetStarOverflowAfterBigStar(p);
        else p.s7.starBigQueue = 0;
        return true
      }
      return false
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7SplitExp

    // v10.9.9：5阶杨桃继续参与经验分配；只有超过五阶最低经验的部分计入1437触发阈值。

    // 单次或冷却期间获得任意倍数的1437经验都只挂起1次大星；成功释放后全部溢出经验归零。

    // -----------------------------------------------------------------------------

    function s7SplitExp(row, amt, exclude = null, laneMultiplier = null) {
      const arr = s7LanePlants(row).filter(p => p !== exclude && s7CanReceiveExp(p));
      if (!arr.length || !(amt > 0)) return 0;
      const mult = laneMultiplier == null ? s7LaneExperienceMultiplier(row) : laneMultiplier;
      const each = amt / arr.length;
      for (const p of arr) s7GrantPlantExp(p, each, mult);
      return arr.length
    }

    function s7GoldMagnetById(id) {
      if (!state || id == null) return null;
      return state.plants.find(p => !p.dead && p.id === id && p.key === "goldmagnet") || null
    }

    function s7GoldMagnetsInLane(row) {
      if (!state) return [];
      return state.plants.filter(p => !p.dead && p.row === row && p.key === "goldmagnet").sort((a, b) => (b.s7?.level ||
        0) - (a.s7?.level || 0) || a.col - b.col || a.id - b.id)
    }

    function s7GoldCoinMultiplier(z) {
      // 附金死亡掉落2倍经验钱币；5阶吸金磁（本路全满阶发射态）钱币携带经验翻倍。
      const launcher = z ? s7GoldCoinLauncher(z.row) : null;
      return launcher ? 4 : 2
    }

    function s7GoldCoinTier(carriedXp) {
      const xp = Math.max(0, finiteNumber(carriedXp, 0));
      if (xp >= 6e4) return Object.freeze({
        name: "钻石",
        emoji: "💎",
        damage: 1200
      });
      if (xp >= 1e4) return Object.freeze({
        name: "金币",
        emoji: "🪙",
        damage: 800
      });
      return Object.freeze({
        name: "银币",
        emoji: "🪙",
        damage: 400
      })
    }

    function s7LaneAllPlantsMax(row) {
      const lanePlants = s7LanePlants(row);
      return lanePlants.length > 0 && lanePlants.every(p => (p.s7?.level || 0) >= 5)
    }

    function s7GoldCoinAbsorber(row, preferredId = null) {
      const preferred = s7GoldMagnetById(preferredId);
      if (preferred && preferred.row === row) return preferred;
      return s7GoldMagnetsInLane(row)[0] || null
    }

    function s7GoldCoinLauncher(row) {
      if (!s7LaneAllPlantsMax(row)) return null;
      return s7GoldMagnetsInLane(row).find(p => (p.s7?.level || 0) >= 5) || null
    }

    function s7GrantGoldCoinXp(row, amount) {
      const arr = s7LanePlants(row).filter(s7CanReceiveExp);
      if (!arr.length) return 0;
      const each = amount / arr.length;
      const mult = s7LaneExperienceMultiplier(row);
      for (const p of arr) s7GrantPlantExp(p, each, mult);
      return arr.length
    }

    function s7FireGoldCoin(magnet, target, coin = {}) {
      if (!magnet || !target) return false;
      s7Shoot(magnet, target, coin.damage || 400, {
        kind: "coin",
        homing: true,
        torchable: false,
        airOk: true,
        emoji: coin.emoji || "🪙"
      });
      return true
    }

    function s7ResolveGildedDeath(z) {
      if (!z?.s7?.gilded || z.s7.gildedXpSettled) return false;
      z.s7.gildedXpSettled = true;
      const baseXp = Math.max(1, Math.round(z.s7Xp || z.maxHp || totalHp(z) || 270));
      const multiplier = s7GoldCoinMultiplier(z);
      const carriedXp = baseXp * multiplier;
      const tier = s7GoldCoinTier(carriedXp);
      const launcher = s7GoldCoinLauncher(z.row);
      if (launcher) {
        const target = s7Nearest(z.row, launcher.col, {
          range: 9,
          source: launcher
        });
        if (target) {
          s7FireGoldCoin(launcher, target, tier);
          addEffect(z.row, z.x, `${tier.name}·经验${Math.round(carriedXp)}`, "#fde047", .65)
        } else {
          addEffect(z.row, z.x, `${tier.name}无目标`, "#fde047", .65)
        }
        return true
      }
      const absorber = s7GoldCoinAbsorber(z.row, z.s7.gildedBy);
      if (!absorber) {
        addEffect(z.row, z.x, `${tier.name}无人吸取`, "#a3a3a3", .8);
        return true
      }
      const receivers = s7GrantGoldCoinXp(z.row, carriedXp);
      addEffect(z.row, z.x, `${tier.name} EXP ${Math.round(carriedXp)}`, "#facc15", .75);
      addEffect(absorber.row, absorber.col + .5, receivers > 0 ? `吸收${tier.name}·全路+${Math.round(carriedXp)}` :
        `吸收${tier.name}`, "#fde047", .75);
      return true
    }

    function s7ZombieExperienceValue(z) {
      if (!z || s7SuppressKillXpForZombie(z)) return 0;
      const cached = finiteNumber(z.s7Xp, NaN);
      if (Number.isFinite(cached) && cached >= 0) return cached;
      const bodyMax = Math.max(0, finiteNumber(z.maxHp, 0));
      let armorMax = 0;
      for (const a of finiteArray(z.armors)) {
        if (!a || (a.cls !== 1 && a.cls !== 2)) continue;
        armorMax += Math.max(0, finiteNumber(a.max, a.hp || 0))
      }
      return bodyMax + armorMax
    }

    function s7GrantKillXp(z, killer) {
      const base = s7ZombieExperienceValue(z);
      if (!(base > 0)) return;
      if (!killer || killer.dead || !PLANT_RULES[killer.key]) {
        const victimLaneMult = s7LaneExperienceMultiplier(z.row);
        s7SplitExp(z.row, base, null, victimLaneMult);
        return
      }
      if (killer.row === z.row) {
        const laneMult = s7LaneExperienceMultiplier(killer.row);
        if (s7CanReceiveExp(killer)) s7GrantPlantExp(killer, base * S7_RULES.experience.sameLaneKillerShare, laneMult);
        // 60%是击杀者固定份额；即使击杀者当前不可收经验，也不把这部分回流给其他植物。
        s7SplitExp(killer.row, base * (1 - S7_RULES.experience.sameLaneKillerShare), killer, laneMult);
        return
      }
      const killerLaneMult = s7LaneExperienceMultiplier(killer.row);
      const victimLaneMult = s7LaneExperienceMultiplier(z.row);
      if (s7CanReceiveExp(killer)) s7GrantPlantExp(killer, base * S7_RULES.experience.crossLaneKillerShare, killerLaneMult);
      s7SplitExp(killer.row, base * S7_RULES.experience.crossLaneKillerLaneOtherShare, killer, killerLaneMult);
      s7SplitExp(z.row, base * S7_RULES.experience.crossLaneVictimLaneShare, null, victimLaneMult)
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7GrantDeathXp

    // [原源码行 10517] 无来源伤害：僵尸所在行所有可分配植物均分全部经验。

    // [原源码行 10523] 同行击杀：击杀者60%，其余同行可分配植物均分40%。

    // [v10.8.4] 跨行击杀按文档重构：击杀者固定30%，击杀者同行其它植物均分20%，

    // [v10.8.4] 被击杀僵尸所在行可分配经验植物均分50%。

    // -----------------------------------------------------------------------------

    function s7GrantDeathXp(p) {
      if (!p || !p.s7 || !p.s7.exp) return 0;
      const amt = Math.max(0, finiteNumber(p.s7.exp, 0)) * S7_RULES.experience.plantDeathSharePerReceiver;
      if (!(amt > 0)) return 0;
      const arr = s7LanePlants(p.row).filter(pp => pp !== p && s7CanReceiveExp(pp));
      const mult = s7LaneExperienceMultiplier(p.row);
      for (const pp of arr) s7GrantPlantExp(pp, amt, mult);
      return arr.length
    }

    // --- Zombie row bucketing cache ---
    // Most plant targeting is same-row. Rebuild 5 row buckets once per logical
    // frame instead of scanning all zombies for every s7Nearest/s7Targets call.
    // Cache invalidates on state ref / frame / array length / mid-frame row change.
    var _zombieRowVersion = 0; // incremented when a zombie changes row mid-frame
    let _zRowBuckets = null;
    let _zRowBucketsState = null;
    let _zRowBucketsFrame = -1;
    let _zRowBucketsLen = -1;
    let _zRowBucketsVer = -1;
    function zombieRowBucket(row) {
      const zombies = finiteArray(state.zombies);
      const frame = Math.floor(finiteNumber(state.frame, 0));
      if (_zRowBucketsState !== state || _zRowBucketsFrame !== frame || _zRowBucketsLen !== zombies.length ||
        _zRowBucketsVer !== _zombieRowVersion) {
        _zRowBuckets = [null, null, null, null, null];
        for (let i = 0; i < zombies.length; i++) {
          const z = zombies[i];
          if (!z) continue;
          const r = z.row | 0;
          if (r < 0 || r >= ROWS) continue;
          const bucket = _zRowBuckets[r] || (_zRowBuckets[r] = []);
          bucket.push(z)
        }
        _zRowBucketsState = state;
        _zRowBucketsFrame = frame;
        _zRowBucketsLen = zombies.length;
        _zRowBucketsVer = _zombieRowVersion
      }
      const b = row >= 0 && row < 5 ? _zRowBuckets[row] : null;
      return b || []
    }

    function s7Nearest(row, col, opt = {}) {
      const targetRow = opt.anyRow ? null : row;
      const queryOpt = {
        ...opt,
        row: targetRow,
        canHitAir: !!(opt.canAir || opt.canHitAir || opt.balloon),
        canHitUnderground: !!(opt.canUnderground || opt.canHitUnderground),
        canHitDiving: !!(opt.canDiving || opt.canHitDiving),
        source: opt.source || opt.plant || opt.sourceKey
      };
      const centerX = col + .5;
      const candidates = targetRow == null ? state.zombies : zombieRowBucket(targetRow);
      let best = null;
      for (let i = 0; i < candidates.length; i++) {
        const z = candidates[i];
        if (!canPlantTargetZombie(z, queryOpt)) continue;
        if (opt.range != null && Math.abs(z.x - centerX) > opt.range) continue;
        if (opt.front !== false && z.x < col - .2) continue;
        if (opt.back && z.x >= col + .2) continue;
        if (opt.notBlind && z.blind) continue;
        if (!opt.canLandingInvuln && z.landingInvuln > 0) continue;
        if (opt.xMin != null && z.x < opt.xMin) continue;
        if (opt.xMax != null && z.x > opt.xMax) continue;
        if (!best || (opt.threat ? z.threat > best.threat : z.x < best.x)) best = z
      }
      return best
    }

    function s7Targets(row, col, n = 1, opt = {}) {
      const targetRow = opt.anyRow ? null : row;
      const queryOpt = {
        ...opt,
        row: targetRow,
        canHitAir: !!(opt.canAir || opt.canHitAir || opt.balloon),
        canHitUnderground: !!(opt.canUnderground || opt.canHitUnderground),
        canHitDiving: !!(opt.canDiving || opt.canHitDiving),
        source: opt.source || opt.plant || opt.sourceKey
      };
      const centerX = col + .5;
      const candidates = targetRow == null ? state.zombies : zombieRowBucket(targetRow);
      const out = [];
      for (let i = 0; i < candidates.length; i++) {
        const z = candidates[i];
        if (!canPlantTargetZombie(z, queryOpt)) continue;
        if (opt.range != null && Math.abs(z.x - centerX) > opt.range) continue;
        if (opt.front !== false && z.x < col - .2) continue;
        if (opt.notBlind && z.blind) continue;
        if (!opt.canLandingInvuln && z.landingInvuln > 0) continue;
        out.push(z)
      }
      out.sort((a, b) => opt.threat ? b.threat - a.threat : a.x - b.x);
      return out.slice(0, n)
    }

    const _zombieIdIndex = new Map();
    let _zombieIdIndexState = null;
    let _zombieIdIndexFrame = -1;
    let _zombieIdIndexLength = -1;
    function getZombieById(id) {
      if (!state || id == null) return null;
      const zombies = finiteArray(state.zombies);
      const frame = Math.floor(finiteNumber(state.frame, 0));
      if (_zombieIdIndexState !== state || _zombieIdIndexFrame !== frame || _zombieIdIndexLength !== zombies.length) {
        _zombieIdIndex.clear();
        for (let i = 0; i < zombies.length; i++) {
          const z = zombies[i];
          if (z && z.id != null) _zombieIdIndex.set(z.id, z)
        }
        _zombieIdIndexState = state;
        _zombieIdIndexFrame = frame;
        _zombieIdIndexLength = zombies.length
      }
      const z = _zombieIdIndex.get(id);
      return z && !z.dead && !z.dying && !z.friendly ? z : null
    }

    function timegrassCanTeleport(z) {
      return !!(z && !z.dead && !z.dying && !z.friendly && !PLANT_ZOMBIE_TYPES.has(z.type) && z.type !== "ducky" && z.type !==
        "catapult")
    }

    function timegrassCanBePortalTarget(z) {
      // 气球可以被已经存在的传送门吞进去，但逆时草主动建门不索敌空中气球或地下矿工。
      return timegrassCanTeleport(z) && !isBalloonAir(z) && !isUnderground(z)
    }

    function timegrassPortalDuration(lv) {
      return [5, 5.5, 6.5, 6.5, 7.5, 7.5][clamp(Math.floor(lv || 0), 0, 5)] || 5
    }

    function timegrassPortalMaxTeleports(lv) {
      return (lv || 0) >= 5 ? Number.POSITIVE_INFINITY : 4
    }

    function timegrassBaseSkillCooldown(p) {
      const c = s7Cfg(p);
      const lv = clamp(p?.s7?.level || 0, 0, 5);
      return finitePositive(c?.cd?.[lv] ?? c?.cd?.[0], 15)
    }

    function timegrassStartSkillCooldown(p) {
      if (!p || p.key !== "timegrass") return;
      p.s7 = p.s7 || {};
      p.s7.timegrassSkillCdActive = true;
      p.s7.timegrassSkillCdTotal = Math.max(.08, s7Cd(p))
    }

    function timegrassClearFinishedSkillCooldown(p) {
      if (!p || p.key !== "timegrass" || !p.s7?.timegrassSkillCdActive) return;
      if (finiteNumber(p.cd, 0) <= 0) p.s7.timegrassSkillCdActive = false
    }

    function timegrassSkillCooldownRatio(p) {
      if (!p || p.key !== "timegrass") return 1;
      if (!p.s7?.timegrassSkillCdActive) return 1;
      const total = finitePositive(p.s7.timegrassSkillCdTotal, timegrassBaseSkillCooldown(p));
      const remaining = clamp(finiteNumber(p.cd, 0), 0, total);
      return clamp(1 - remaining / total, 0, 1)
    }

    function timegrassFindLeftmostTarget(p) {
      if (!p || !state) return null;
      const frontMinX = finiteNumber(p.col, 0) - .2;
      return state.zombies.filter(q => q && q.row === p.row && q.x >= frontMinX && timegrassCanBePortalTarget(q))
        .sort((a, b) => a.x - b.x || (a.id || 0) - (b.id || 0))[0] || null
    }

    function timegrassMakePortal(p, target) {
      const lv = p.s7?.level || 0;
      const dur = timegrassPortalDuration(lv);
      const x = clamp(finiteNumber(target?.x, p.col + 1.5), -0.5, COLS - 0.5);
      const cell = clamp(Math.floor(x), 0, COLS - 1);
      return {
        duration: dur,
        remaining: dur,
        maxTeleports: timegrassPortalMaxTeleports(lv),
        teleported: 0,
        x,
        cell,
        radius: .5,
        targetId: target?.id || null
      }
    }

    function timegrassPortalTouchesZombie(portal, z) {
      if (!portal || !z || !timegrassCanTeleport(z)) return false;
      const px = finiteNumber(portal.x, (finiteNumber(portal.cell, 0) + .5));
      const radius = finitePositive(portal.radius, .5);
      if (Math.abs(z.x - px) <= radius + 1e-9) return true;
      const prev = Number.isFinite(z.s7?.timegrassPrevX) ? z.s7.timegrassPrevX : null;
      if (prev == null) return false;
      return (prev - px) * (z.x - px) <= 0 && Math.min(prev, z.x) - 1e-9 <= px && px <= Math.max(prev, z.x) + 1e-9
    }

    function timegrassTeleportZombie(p, portal, z) {
      if (!p || !portal || !z || !timegrassCanTeleport(z)) return false;
      z.s7 = z.s7 || {};
      z.s7.timegrassPrevX = COLS - .5;
      z.x = COLS - .5;
      if (z.diving && z.type === "snorkel") {
        z.diving = false;
        z.surfaced = true;
        z.underground = false
      }
      portal.teleported++;
      const px = finiteNumber(portal.x, (finiteNumber(portal.cell, 0) + .5));
      addEffect(p.row, px, "传送", "#c4b5fd");
      return true
    }

    function timegrassUpdatePortal(p, dt) {
      if (!p?.s7?.portal) return false;
      const portal = p.s7.portal;
      portal.x = finiteNumber(portal.x, finiteNumber(portal.cell, p.col + 1) + .5);
      portal.cell = clamp(Math.floor(portal.x), 0, COLS - 1);
      portal.radius = finitePositive(portal.radius, .5);
      portal.remaining -= dt;
      if (portal.teleported < portal.maxTeleports) {
        for (const q of state.zombies) {
          if (!q || q.dead || q.dying || q.row !== p.row) continue;
          if (!timegrassPortalTouchesZombie(portal, q)) continue;
          timegrassTeleportZombie(p, portal, q);
          if (portal.teleported >= portal.maxTeleports) break
        }
      }
      if (portal.remaining <= 0 || portal.teleported >= portal.maxTeleports) p.s7.portal = null;
      return true
    }

    function s7StarOrbitTarget(p) {
      if (!p || !state) return null;
      const left = p.col - 1;
      const right = p.col + 2;
      return state.zombies.filter(z => !z.dead && !z.dying && !z.friendly && z.row === p.row && z.x >= left && z.x <=
        right && isDamageableZombie(z) && canPlantTargetZombie(z, {
          row: p.row,
          source: p,
          canHitAir: false,
          canHitUnderground: false,
          canHitDiving: false
        })).sort((a, b) => Math.abs(a.x - (p.col + .5)) - Math.abs(b.x - (p.col + .5)) || a.x - b.x)[0] || null
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ComboPlants

    // [原源码行 10623] 左1格、所在格、右1格组成的近身区间；按贴图判定点近似为[p.col-1, p.col+2]。

    // -----------------------------------------------------------------------------

    function s7ComboPlants(row) {
      if (!state || !Number.isInteger(row) || row < 0 || row >= ROWS) return [];
      return state.plants.filter(p => !p.dead && p.row === row && ["winter", "starfruit", "hypno"].includes(p.key))
    }

    function s7HasIceStarHypnoCombo(row) {
      const keys = new Set(s7ComboPlants(row).map(p => p.key));
      return keys.has("winter") && keys.has("starfruit") && keys.has("hypno")
    }

    function s7GrantShineToIceStarHypno(row, duration = 7.5, label = "冰星魅照耀") {
      if (!s7HasIceStarHypnoCombo(row)) return false;
      for (const p of s7ComboPlants(row)) {
        p.s7 = p.s7 || {};
        p.s7.shine = Math.max(p.s7.shine || 0, duration);
        addEffect(p.row, p.col + .5, label, "#fef08a", .5)
      }
      return true
    }

    function s7IceStarHypnoSplashHeal(row, x, radius, source) {
      if (!source || source.key !== "winter" || source.row !== row || !s7HasIceStarHypnoCombo(row)) return false;
      const hasFriendlyInSplash = state.zombies.some(z => !z.dead && z.friendly && z.row === row && Math.abs(z.x - x) <=
        radius);
      if (!hasFriendlyInSplash) return false;
      for (const p of s7ComboPlants(row)) {
        p.hp = Math.min(p.maxHp, p.hp + 50);
        addEffect(p.row, p.col + .5, "冰星魅+50", "#bae6fd", .45)
      }
      return true
    }

    function s7UniqueTargets(row, col, n = 1, opt = {}) {
      return s7Targets(row, col, n, opt).filter((z, i, a) => z && a.findIndex(q => q.id === z.id) === i).slice(0, n)
    }

    function s7PotatoDeathExplosion(p) {
      if (!state || !p) return 0;
      const opt = {
        source: p
      };
      let hitCount = 0;
      for (const z of [...finiteArray(state.zombies)]) {
        if (!s7PotatoCanAffectZombie(z, p.row, p, true)) continue;
        // 亡语出土爆炸伤害100（设计文档：伤害100包括亡语）。
        damageZombie(z, 100, opt);
        hitCount++
      }
      for (let c = 0; c < COLS; c++) addGridEffect(p.row, c, "#ef4444", 1.5, false);
      addEffect(p.row, p.col + .5, `地雷爆炸·1×整行${hitCount?`·命中${hitCount}`:""}`, "#fb7185", .8);
      return hitCount
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7PotatoCanAffectZombie

    // [原源码行 10709] 本体死亡出土爆炸同样采用土豆雷专用的“1×整行”判定，

    // [原源码行 10710] 不受普通植物9/10列可伤边界限制。

    // -----------------------------------------------------------------------------

    function s7PotatoCanAffectZombie(z, row, source, allowBlind = true) {
      if (!z || z.dead || z.dying || z.friendly || z.row !== row) return false;
      // Versus 冻结规则：土豆雷对墓碑与 Target Zombie 造成 0 伤害（普通敌方僵尸照常）。
      if (z.versusObjective || z.versusStatic) return false;
      if (!allowBlind && z.blind) return false;
      if (z.flags?.bungee || z.landingInvuln > 0) return false;
      if (isBalloonAir(z) || isUnderground(z) || isDiving(z) || isVaulting(z) && z.type !== "dolphin") return false;
      return canAffectZombieState(z, {
        source: source
      })
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7PotatoCandidates

    // [原源码行 10732] 土豆雷是整行技能，不套用“跨过9/10列后才可被普通植物索敌”的边界。

    // -----------------------------------------------------------------------------

    function s7PotatoCandidates(row, source, allowBlind = true) {
      if (!state) return [];
      return state.zombies.filter(z => s7PotatoCanAffectZombie(z, row, source, allowBlind)).sort((a, b) => Number(!!a
        .blind) - Number(!!b.blind) || a.x - b.x || (a.id || 0) - (b.id || 0))
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7PotatoBaseDamage

    // [原源码行 10739] 土豆雷可以索敌盲盒，但盲盒只作为后备目标：

    // [原源码行 10740] 本行存在任何可攻击的非盲盒僵尸时，先选其中最左者；

    // [原源码行 10741] 只有没有非盲盒目标时，才选最左盲盒。

    // -----------------------------------------------------------------------------

    function s7PotatoBaseDamage(lv, small = false) {
      if (small) return 120;
      if (lv >= 3) return 300;
      return lv >= 2 ? 200 : lv >= 1 ? 150 : 100
    }

    function s7PotatoHitLabel(lv, small = false) {
      return small ? "小毒马铃薯" : lv >= 3 ? "毒马铃薯" : "瞬爆雷"
    }

    function s7PotatoEffectColor(lv, small = false) {
      return lv >= 3 || small ? "#a3e635" : "#d97706"
    }

    function s7PotatoAreaTargets(centerRow, centerX, source, allowBlind) {
      if (!state) return [];
      return state.zombies.filter(z => s7PotatoCanAffectZombie(z, centerRow, source, allowBlind))
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7PotatoDamageOne

    // [原源码行 10762] 所有土豆（瞬爆雷、毒马铃薯、小毒马铃薯）的爆炸范围统一为

    // [原源码行 10763] “1×整个本行”：只命中落点所在行，但横向覆盖整条道路。

    // -----------------------------------------------------------------------------

    function s7PotatoDamageOne(source, z, lv, small = false) {
      if (!z || z.dead || z.dying) return false;
      const elem = s7Elem(z);
      const poisonBefore = Math.max(0, elem.poison || 0);
      if (lv >= 3) {
        s7ApplyElement(z, "poison", 10, source, {
          ignoreTargetState: true
        })
      }
      const damage = small ? 120 : lv >= 3 ? 300 + 40 * poisonBefore : s7PotatoBaseDamage(lv, false);
      const didHit = s7DirectHit(z, damage, source, {
        ignore2: false
      });
      if (lv >= 3) {
        elem.poison = 0;
        elem.poisonT = S7_RULES.elements.poisonTick
      }
      if (didHit) addEffect(z.row, z.x, `${s7PotatoHitLabel(lv,small)}${Math.round(damage)}·清毒`, s7PotatoEffectColor(lv,
        small), .4);
      return didHit
    }

    function s7PotatoStrike(source, target, lv, small = false) {
      if (!target || target.dead || target.dying) return false;
      const hitLabel = s7PotatoHitLabel(lv, small);
      const centerRow = target.row;
      const centerX = target.x;
      addPotatoMineMarker(centerRow, centerX, hitLabel, 1);
      for (let c = 0; c < COLS; c++) addGridEffect(centerRow, c, s7PotatoEffectColor(lv, small), .8, false);
      const victims = s7PotatoAreaTargets(centerRow, centerX, source, true);
      let hitCount = 0;
      for (const z of victims)
        if (s7PotatoDamageOne(source, z, lv, small)) hitCount++;
      if (hitCount > 0) addEffect(centerRow, centerX, `${hitLabel}·1×整行×${hitCount}`, s7PotatoEffectColor(lv, small),
        .55);
      return hitCount > 0
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7PotatoCast

    // [原源码行 10785] 盲盒并非免疫土豆雷。所有等级的瞬爆雷/毒马铃薯/小毒马铃薯

    // [原源码行 10786] 都按1×整行命中盲盒；区别只在“索敌时不优先选盲盒”。

    // -----------------------------------------------------------------------------

    function s7PotatoCast(p) {
      if (!p || p.dead) return false;
      const lv = clamp(Math.floor(p.s7?.level || 0), 0, 5);
      const target = s7PotatoCandidates(p.row, p, true)[0];
      if (!target) return false;
      const count = lv >= 5 ? 3 : 1;
      let hit = false;
      for (let i = 0; i < count; i++) hit = s7PotatoStrike(p, target, lv, lv >= 5) || hit;
      if (hit) addEffect(p.row, p.col + .5, lv >= 5 ? "小毒马铃薯×3" : lv >= 3 ? "毒马铃薯" : "瞬爆雷", lv >= 3 ? "#a3e635" :
        "#d97706", .5);
      return hit
    }

    function s7KernelNearestTarget(p) {
      if (!p || !state) return null;
      return s7Nearest(p.row, p.col, {
        range: 9,
        source: p,
        canHitDiving: true
      })
    }

    function s7KernelFrontNear(p) {
      if (!p || !state) return false;
      return state.zombies.some(q => !q.dead && !q.dying && !q.friendly && q.row === p.row && isDamageableZombie(q) && !
        isUnderground(q) && !isBalloonAir(q) && q.x >= p.col + .2 && q.x <= p.col + 2.5)
    }

    function s7KernelProximityRatio(dist) {
      return clamp((8 - dist) / 7, 0, 1)
    }

    function s7KernelButterMaxRate(lv) {
      return lv >= 4 ? .5 : lv >= 2 ? .4 : .3
    }

    function s7KernelBounceCount(lv) {
      return lv >= 4 ? 2 : lv >= 2 ? 1 : 0
    }

    function s7KernelCurrentCd(p, baseCd) {
      if (!p) return baseCd;
      const lv = clamp(Math.floor(p.s7?.level || 0), 0, 5);
      let cd = baseCd;
      const z = s7KernelNearestTarget(p);
      if (lv >= 3 && z) {
        const dist = Math.max(1, z.x - (p.col + .5));
        cd = Math.max(1, baseCd - Math.max(0, 8 - dist) * .25)
      }
      if (lv >= 5) cd = Math.max(.5, cd - Math.max(0, p.s7?.kernelCloseReduction || 0));
      return cd
    }

    function s7KernelButterChance(lv, dist) {
      return s7KernelButterMaxRate(lv) * s7KernelProximityRatio(dist)
    }

    function s7KernelCellTargets(z, allAtFive = false) {
      if (!z || !state) return [];
      const cell = Math.floor(clamp(z.x, 0, COLS - .001));
      const targets = state.zombies.filter(q => !q.dead && !q.dying && !q.friendly && q.row === z.row &&
        isDamageableZombie(q) && Math.floor(clamp(q.x, 0, COLS - .001)) === cell).sort((a, b) => Math.abs(a.x - z.x) -
        Math.abs(b.x - z.x));
      return allAtFive ? targets : targets.slice(0, 3)
    }

    function s7KernelChooseThrow(p) {
      if (!p || p.dead) return null;
      const lv = clamp(Math.floor(p.s7?.level || 0), 0, 5);
      const z = s7KernelNearestTarget(p);
      if (!z) return null;
      const dist = Math.max(.05, z.x - (p.col + .5));
      const butterChance = s7KernelButterChance(lv, dist);
      let kind = "kernel";
      if (s7BattleRandom() < .005) kind = "cob";
      else {
        const isButter = s7BattleRandom() < butterChance;
        if (isButter && lv >= 3 && s7BattleRandom() < .15) kind = "bigButter";
        else if (isButter) kind = "butter"
      }
      return {
        kind, targetId:z.id, targetX:z.x, targetRow:z.row, level:lv,
        bounceCount:s7KernelBounceCount(lv), createdFrame:state?.frame || 0
      }
    }

    function s7KernelStartThrow(p, slowFactor = (p?.slow > 0 ? .5 : 1)) {
      if (!p || p.dead) return false;
      p.s7 = p.s7 || {};
      if (p.s7.kernelThrowPending) return true;
      const lockedRate = s7PlantAnimationRate(p);
      const pending = s7KernelChooseThrow(p);
      if (!pending) return false;
      p.s7.kernelThrowPending = pending;
      p.s7.kernelThrowReleased = false;
      p.s7.kernelThrowRate = Math.max(.001, finiteNumber(lockedRate, 1));
      p.s7.kernelThrowSlowFactor = Math.max(0, finiteNumber(slowFactor, 1));
      p.s7.kernelThrowStartedFrame = state?.frame || 0;
      p.s7.kernelAnimStats = p.s7.kernelAnimStats || {starts:0,events:0,projectiles:0};
      p.s7.kernelAnimStats.starts++;
      const clipId = `plant.kernel.throw.${pending.kind}`;
      window.S7Animation?.request?.(p, `kernel_throw_${pending.kind}`, clipId);
      // Restart is important when two consecutive throws choose the same projectile kind.
      S7_ANIM.setState("plant", p, `kernel_throw_${pending.kind}`, clipId, {restart:true});
      return true
    }

    function s7KernelResolvePendingTarget(p, pending) {
      if (!state || !pending) return null;
      const live = state.zombies.find(q => q && !q.dead && !q.dying && !q.friendly && q.id === pending.targetId && q.row === p.row && isDamageableZombie(q));
      if (live) return live;
      return s7KernelNearestTarget(p) || {
        id:null, dead:false, friendly:false, row:p.row, x:finiteNumber(pending.targetX, p.col + 4)
      }
    }

    function s7KernelReleasePending(p, eventValue = {}) {
      if (!p || p.dead || !p.s7?.kernelThrowPending || p.s7.kernelThrowReleased) return false;
      const pending = p.s7.kernelThrowPending;
      if (eventValue.kind && pending.kind !== eventValue.kind) return false;
      const z = s7KernelResolvePendingTarget(p, pending);
      if (!z) return false;
      p.s7.kernelThrowReleased = true;
      p.s7.kernelAnimStats = p.s7.kernelAnimStats || {starts:0,events:0,projectiles:0};
      p.s7.kernelAnimStats.events++;
      let projectile = null;
      if (pending.kind === "cob") {
        projectile = addPultBullet(p, z, 0, {
          kind:"kernelCob", emoji:"🌽💥", arcHeight:.75, kernelCob:true
        })
      } else if (pending.kind === "bigButter") {
        projectile = addPultBullet(p, z, 80, {
          kind:"bigButter", stun:isAbnormalImmuneZombie(z) ? 0 : pending.level >= 5 ? 5 : 4,
          kernelBigButter:true, kernelCellAll:pending.level >= 5
        })
      } else if (pending.kind === "butter") {
        projectile = addPultBullet(p, z, 40, {
          kind:"butter", stun:isAbnormalImmuneZombie(z) ? 0 : pending.level >= 3 ? 5 : 4,
          pultBounceLeft:pending.bounceCount
        })
      } else {
        projectile = addPultBullet(p, z, 20, {kind:"kernel",stun:0,pultBounceLeft:pending.bounceCount})
      }
      if (projectile) p.s7.kernelAnimStats.projectiles++;
      // Cooldown starts on the release event. This keeps animation rate and action timing bound together.
      p.cd = s7Cd(p);
      return !!projectile
    }

    function s7KernelCompleteThrow(p) {
      if (!p?.s7) return false;
      delete p.s7.kernelThrowPending;
      delete p.s7.kernelThrowReleased;
      delete p.s7.kernelThrowRate;
      delete p.s7.kernelThrowSlowFactor;
      delete p.s7.kernelThrowStartedFrame;
      window.S7Animation?.clearRequest?.(p);
      return true
    }

    // Legacy direct helper retained for recovery/debugging. B02A gameplay path uses EventTrack above.
    function s7KernelCast(p) {
      if (!p || p.dead) return false;
      const row = p.row;
      const col = p.col;
      const lv = clamp(Math.floor(p.s7?.level || 0), 0, 5);
      const z = s7KernelNearestTarget(p);
      if (!z) return false;
      const dist = Math.max(.05, z.x - (col + .5));
      const butterChance = s7KernelButterChance(lv, dist);
      const bounceCount = s7KernelBounceCount(lv);
      if (s7BattleRandom() < .005) {
        explode(row, z.x, 1.5, ASH, {
          ash: true,
          source: p
        });
        addEffect(row, z.x, "玉米炮", "#facc15");
        return true
      }
      const isButter = s7BattleRandom() < butterChance;
      if (isButter && lv >= 3 && s7BattleRandom() < .15) {
        const targets = s7KernelCellTargets(z, lv >= 5);
        for (const q of targets) {
          const didButterHit = s7DirectHit(q, 80, p, {
            ignore2: true
          });
          if (didButterHit && !isAbnormalImmuneZombie(q)) q.stun = Math.max(q.stun || 0, lv >= 5 ? 5 : 4)
        }
        addEffect(z.row, z.x, lv >= 5 ? "大黄油80全格" : "大黄油80·直击+同格2", "#facc15");
        return true
      }
      if (isButter) {
        addPultBullet(p, z, 40, {
          kind: "butter",
          stun: isAbnormalImmuneZombie(z) ? 0 : lv >= 3 ? 5 : 4,
          pultBounceLeft: bounceCount
        })
      } else {
        addPultBullet(p, z, 20, {
          kind: "kernel",
          stun: 0,
          pultBounceLeft: bounceCount
        })
      }
      return true
    }

    S7_ANIM.on("newspaper_defense_sync", payload => {
      const z=payload?.entity;
      if (!z || z._s7SelfTest || z.type!=="newspaper" || !["paper_break","transition"].includes(z.s7?.newspaperRagePhase)) return;
      z.s7=z.s7||{}; z.s7.newspaperDefenseSyncedByEvent=true
    });

    S7_ANIM.on("newspaper_detach", payload => {
      const z=payload?.entity; if (!z || z._s7SelfTest || z.type!=="newspaper") return;
      s7SpawnNewspaperDetached(z,"newspaper")
    });
    S7_ANIM.on("newspaper_break_complete", payload => {
      const z=payload?.entity; if (!z || z._s7SelfTest || z.type!=="newspaper" || z.s7?.newspaperRagePhase!=="paper_break") return;
      z.s7.newspaperRagePhase="transition"
    });
    S7_ANIM.on("newspaper_rage_begin", payload => {
      const z=payload?.entity; if (!z || z._s7SelfTest || z.type!=="newspaper") return;
      z.s7=z.s7||{}; z.s7.newspaperRagePhase="sprinting"; z.s7.newspaperRageDefense=null;
      addEffect(z.row,z.x,"暴走·5倍速","#f87171",.8)
    });
    S7_ANIM.on("newspaper_drop_arm", payload => { const z=payload?.entity; if (z && !z._s7SelfTest) s7NewspaperDropArm(z) });
    S7_ANIM.on("newspaper_drop_head", payload => { const z=payload?.entity; if (z && !z._s7SelfTest) s7NewspaperDropHead(z) });
    S7_ANIM.on("newspaper_bite", payload => {
      const z=payload?.entity;
      if (!z || z._s7SelfTest || z.type!=="newspaper" || z.dead || z.dying || z.friendly) return;
      if (typeof zombieIsHardControlled === "function" && zombieIsHardControlled(z)) return;
      if (["paper_break","transition"].includes(z.s7?.newspaperRagePhase)) return;
      const targetId=z.s7?.newspaperAttackTargetId;
      let p=finiteArray(state?.plants).find(q=>q && !q.dead && q.id===targetId);
      if (!p) p=typeof frontPlantForZombie==="function"?frontPlantForZombie(z):null;
      if (!p || !s7PlantStillBlocksZombie(p,z)) return;
      damagePlant(p,8,z)
    });

    S7_ANIM.on("projectile_spawn", payload => {
      const p = payload?.entity;
      const value = payload?.event?.value || {};
      if (!p || p._s7SelfTest || value.plantKey !== "kernel" || p.key !== "kernel") return;
      s7KernelReleasePending(p, value)
    });

    S7_ANIM.on("kernel_throw_complete", payload => {
      const p = payload?.entity;
      if (!p || p._s7SelfTest || p.key !== "kernel") return;
      s7KernelCompleteThrow(p)
    });

    S7_ANIM.on("sound", payload => {
      const entity = payload?.entity;
      if (entity?._s7SelfTest) return;
      const soundId = payload?.event?.value;
      if (soundId) S7_AUDIO.play(soundId)
    });

    const S7_SNIPER_THREAT_RULE = Object.freeze({
      pivot: 800,
      fullReductionThreat: 5000
    });

    function s7SniperIntervalAdjustment(threat, maxSeconds) {
      const t = Math.max(0, finiteNumber(threat, 0));
      const cap = Math.max(0, finiteNumber(maxSeconds, 0));
      const pivot = S7_SNIPER_THREAT_RULE.pivot;
      // 按规则原文：t<800 时“增加量随 t 线性增加”；达到800后切换为
      // 减少区间，并在5000威胁度达到最大减幅。
      if (t < pivot) return cap * t / pivot;
      return -cap * clamp((t - pivot) / (S7_SNIPER_THREAT_RULE.fullReductionThreat - pivot), 0, 1)
    }

    function s7SniperIsOrdinaryBlind(z) {
      if (!z?.blind) return false;
      return !z.s7Box && !z.s7ForcedType && !z.s7?.forcedCategory && !z.s7?.forcedType && !z.s7?.command
    }

    function s7SniperIsSpecialBlind(z) {
      return !!(z?.blind && !s7SniperIsOrdinaryBlind(z))
    }

    function s7SniperIsOrdinarySpecies(z) {
      if (!z || z.blind || z.s7Box || z.s7?.variant) return false;
      return !z.s7?.command && !z.s7ForcedCategory && !z.s7ForcedType &&
        !z.s7?.forcedCategory && !z.s7?.forcedType
    }

    function s7SniperThreat(z, sniperCol) {
      if (!z) return 0;
      let t = 0;

      // 第一层：只计算植物右侧距离，不把已越过植物的僵尸误判为“右边近身”。
      const rightDistancePx = (finiteNumber(z.x, 0) - finiteNumber(sniperCol, 0)) * finitePositive(layout?.cell, 80);
      if (rightDistancePx >= 0 && rightDistancePx <= 100) t += 6000;
      else if (rightDistancePx > 100 && rightDistancePx <= 210) t += 3000;

      // 第二层：种类威胁。
      if (["zomboni", "catapult", "digger", "peaz", "balloon"].includes(z.type)) t += 3000;
      else if (z.type === "gatlingz") t += 6000;
      else if (z.type === "jalapenoz" && finiteNumber(z.jalapenoCd, Infinity) < 5) t += 15000;

      // 第三层：当前动作状态。每只僵尸在本层只进入一个最高匹配档位。
      const impAirborne = z.type === "imp" && (z.flyingImp || z.impLandingPending || z.air ||
        finiteNumber(z.airTimer, 0) > 0 || finiteNumber(z.landingInvuln, 0) > 0);
      const poleAirborne = !!z.flags?.pole && (finiteNumber(z.jumpMove, 0) > 0 || !!z.jumping);
      const ladderPlacing = !!z.flags?.ladder && finiteNumber(z.s7?.ladderPlaceUntil, 0) > finiteNumber(state?.time, 0);
      const squashFalling = !!z.flags?.squash && !!z.s7?.squashZWindup;
      const jackOpening = !!z.flags?.jack && !z.s7?.boxStolen && finiteNumber(z.jackCd, Infinity) <= .9;
      const gargThrowing = !!z.flags?.garg && z.s7?.gargThrowPhase === "windup";
      const diggerLeft = !!z.flags?.digger && !!z.underground;
      const dancerSummoning = !!z.flags?.dancer && finiteNumber(z.s7?.dancerSummonUntil, 0) > finiteNumber(state?.time, 0);
      const dancerSliding = !!z.flags?.dancer && !!z.s7?.variant && !dancerSummoning;
      const ladderWalking = !!z.flags?.ladder && !ladderPlacing && finiteArray(z.armors).some(a => a?.name === "扶梯" && finiteNumber(a.hp, 0) > 0);
      const squashWalking = !!z.flags?.squash && !squashFalling;
      const newspaperSprinting = z.type === "newspaper" && z.enraged && z.s7?.newspaperRagePhase === "sprinting";
      const poleRunning = !!z.flags?.pole && !z.jumped && !poleAirborne;
      if (impAirborne) t += 6000;
      else if (poleAirborne || diggerLeft || jackOpening || gargThrowing || ladderPlacing || squashFalling) t += 3500;
      else if (dancerSummoning || dancerSliding || ladderWalking || squashWalking || newspaperSprinting) t += 2500;
      else if (poleRunning) t += 1500;

      // 第四层：变种、普通种、召唤指令僵尸中的蹦极、特殊盲盒。
      const summonCommandBungee = z.type === "bungee" && s7HasCommand("summon", z.row);
      if (z.s7?.variant || s7SniperIsOrdinarySpecies(z) || summonCommandBungee || s7SniperIsSpecialBlind(z)) t += 6000;

      // 第五层与前四层独立叠加，不能用else-if吞掉总血量项。
      if (s7SniperIsOrdinaryBlind(z)) t -= 2000;
      else t += 3000 + Math.max(0, totalHp(z));
      return t
    }

    function s7SniperLockTarget(p) {
      if (!p || !state) return null;
      const sniperCol = p.col != null ? p.col + .5 : p.x;
      let best = null,
        bestThreat = -Infinity;
      for (const z of state.zombies) {
        if (!z || z.dead || z.dying || z.friendly || z.row !== p.row || z.bossOnly || z.x > DAMAGE_BOUNDARY_X) continue;
        if (!canPlantTargetZombie(z, { row:p.row, canHitAir:true, sourceKey:"sniper" })) continue;
        const t = s7SniperThreat(z, sniperCol);
        if (t > bestThreat || t === bestThreat && best && finiteNumber(z.x, Infinity) < finiteNumber(best.x, Infinity)) {
          bestThreat = t;
          best = z
        }
      }
      if (!p.s7) p.s7 = {};
      if (!state.s7) state.s7 = {};
      state.s7.maxSniperThreat = state.s7.maxSniperThreat || {};
      p.s7.sniperMaxThreat = Number.isFinite(bestThreat) ? bestThreat : 0;
      // 仅保留当前一次扫描结果供调试显示；禁止历史高值滞留影响观察。
      // 实际CD严格读取每株狙击豌豆自己的 sniperMaxThreat。
      state.s7.maxSniperThreat[p.row] = Math.max(0, finiteNumber(p.s7.sniperMaxThreat, 0));
      p.s7.sniperLockId = best ? best.id : null;
      return best
    }

    function s7StarRowCandidates(row) {
      if (!state) return [];
      row = Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(row, 0))));
      // 星星只把已经跨过9/10列可伤线的敌方僵尸纳入索敌；未出土矿工不诱导锁敌。
      // 未出土矿工、未露头潜水、飞行气球不诱导锁敌（星弹打不到飞行，避免锁住后一直卡弹）。
      return state.zombies.filter(z => z && !z.dead && !z.dying && !z.friendly && z.row === row && isDamageableZombie(z) && !isUnderground(z) && !isDiving(z) && !isBalloonAir(z)).sort((a, b) =>
        Number(!!a.blind) - Number(!!b.blind) || finiteNumber(a.x, 999) - finiteNumber(b.x, 999) || (a.id || 0) - (b.id || 0))
    }

    function s7StarTarget(pOrRow) {
      const row = typeof pOrRow === "number" ? pOrRow : pOrRow?.row;
      return s7StarRowCandidates(row)[0] || null
    }

    function s7StarRowHasMageEffect(row) {
      if (!state) return false;
      row = Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(row, 0))));
      // 魔法师效果只来自本路星冰魅组合：杨桃、冰瓜、魅惑菇同时存活。
      return s7HasIceStarHypnoCombo(row)
    }

    function s7StarBulletTargetValid(b, z) {
      return !!(b && z && !z.dead && !z.dying && !z.friendly && z.row === b.row && canBulletHitZombie(b, z))
    }

    function s7PrepareStarBullet(b) {
      if (!b || b.starTurnAfter == null) return;
      if (b.starOriginalDx == null) b.starOriginalDx = finiteNumber(b.dx, 0);
      if (b.starOriginalDy == null) b.starOriginalDy = finiteNumber(b.dy, 0)
    }

    function s7SetStarFreeFlight(b, opt = {}) {
      s7PrepareStarBullet(b);
      const fallbackDx = finiteNumber(b.starOriginalDx, b.dx || 0);
      const fallbackDy = finiteNumber(b.starOriginalDy, b.dy || 0);
      let nextDx = opt.preserveCurrent ? finiteNumber(b.dx, fallbackDx) : fallbackDx;
      let nextDy = opt.preserveCurrent ? finiteNumber(b.dy, fallbackDy) : fallbackDy;
      if (Math.hypot(nextDx, nextDy) < .001) {
        nextDx = finiteNumber(b.starFreeDx, fallbackDx);
        nextDy = finiteNumber(b.starFreeDy, fallbackDy)
      }
      if (Math.hypot(nextDx, nextDy) < .001) {
        nextDx = fallbackDx;
        nextDy = fallbackDy
      }
      b.starHold = false;
      b.starMagicDrift = false;
      b.starNoTurn = true;
      b.homing = false;
      b.target = null;
      b.targetId = null;
      b.starTargetId = null;
      b.dx = nextDx;
      b.dy = nextDy
    }

    function s7SetStarMagicDrift(b) {
      s7PrepareStarBullet(b);
      b.starHold = false;
      b.starMagicDrift = true;
      b.starNoTurn = false;
      b.homing = false;
      b.target = null;
      b.targetId = null;
      b.starTargetId = null;
      b.dx = -0.35;
      b.dy = 0
    }

    function s7HoldStarAtCurrentPoint(b, target) {
      if (Math.hypot(finiteNumber(b.dx, 0), finiteNumber(b.dy, 0)) >= .001) {
        b.starFreeDx = b.dx;
        b.starFreeDy = b.dy
      }
      b.starHold = true;
      b.starMagicDrift = false;
      b.starNoTurn = false;
      b.homing = false;
      b.target = target || null;
      b.targetId = target ? target.id : null;
      b.starTargetId = target ? target.id : null;
      b.dx = 0;
      b.dy = 0
    }

    function s7LockStarOntoTarget(b, target) {
      if (Math.hypot(finiteNumber(b.dx, 0), finiteNumber(b.dy, 0)) >= .001) {
        b.starFreeDx = b.dx;
        b.starFreeDy = b.dy
      }
      b.starHold = false;
      b.starMagicDrift = false;
      b.starNoTurn = false;
      b.homing = true;
      b.target = target;
      b.targetId = target.id;
      b.starTargetId = target.id
    }

    function s7RetargetStarBullet(b) {
      if (!b || b.starTurnAfter == null || !b.starTurned || b.starNoTurn) return;
      const current = getZombieById(b.starTargetId);
      const target = current && !current.dead && !current.dying && !current.friendly && current.row === b.row ? current :
        s7StarTarget(b.row);
      if (target) {
        if (s7StarBulletTargetValid(b, target)) s7LockStarOntoTarget(b, target);
        else s7HoldStarAtCurrentPoint(b, target);
        return
      }
      // 满0.5s后无索敌目标时子弹静止待机（不再继续自由直飞）。
      s7HoldStarAtCurrentPoint(b, null)
    }

