"use strict";

    // -----------------------------------------------------------------------------

    // 查询/碰撞 / validHostile

    // [原源码行 3381] 投篮车按“植物个体”而不是按“占用格”取最靠左目标。

    // [原源码行 3382] 同一格叠种时也会依照当前可被僵尸命中的层级逐个计入，

    // [原源码行 3383] 从而保证变种投篮车锁定真正最靠左的3株植物，并各分配1颗篮球。

    // [原源码行 3403] QUERY: targeting and collision predicates

    // -----------------------------------------------------------------------------

    function validHostile(z, row = null) {
      return !!z && !z.dead && !z.dying && !z.friendly && isDamageableZombie(z) && (row == null || z.row === row)
    }

    function isUnderground(z) {
      return !!(z && z.flags?.digger && z.underground)
    }

    function isBalloonAir(z) {
      return !!(z && z.air && z.type === "balloon")
    }
    const BALLOON_AIR_ALLOWED_PLANTS = new Set(["umbrella", "sniper", "magnet", "cactus", "cattail", "blover", "sunshroom"]);
    const UNDERGROUND_DIGGER_ALLOWED_PLANTS = new Set(["magnet", "tallnut"]);

    function sourceKeyOf(source) {
      if (!source) return null;
      if (typeof source === "string") return source;
      return source.key || source.sourceKey || null
    }

    function plantCanAffectFlyingBalloon(source) {
      return BALLOON_AIR_ALLOWED_PLANTS.has(sourceKeyOf(source))
    }

    function plantCanAffectUndergroundDigger(source) {
      return UNDERGROUND_DIGGER_ALLOWED_PLANTS.has(sourceKeyOf(source))
    }

    function optCanAffectFlyingBalloon(opt = {}) {
      return !!(opt.system || opt.balloonAirBypass || opt.poisonTick || plantCanAffectFlyingBalloon(opt.source || opt.from || opt.plant ||
        opt.sourceKey))
    }

    function optCanAffectUndergroundDigger(opt = {}) {
      // 剧毒 Tick 属于已附着元素的无来源伤害，不重新参与“植物能否索敌地下矿工”的判定。
      // 其余普通攻击仍必须显式携带 undergroundBypass，或来自允许处理地下矿工的植物。
      return !!(opt.system || opt.undergroundBypass || opt.poisonTick || plantCanAffectUndergroundDigger(opt.source || opt.from || opt
        .plant || opt.sourceKey))
    }

    function bulletCanAffectFlyingBalloon(b) {
      if (!b) return false;
      if (b.sniperBullet) return true;
      if (b.melonCannon || b.kind === "melonCannon") return true;
      if (b.kind === "cactus" || b.kind === "cattail" || b.kind === "cattailSmall") return true;
      return plantCanAffectFlyingBalloon(b.from || b.source || b.sourceKey)
    }

    function bulletCanAffectUndergroundDigger(b) {
      if (!b) return false;
      return plantCanAffectUndergroundDigger(b.from || b.source || b.sourceKey)
    }

    function canAffectZombieState(z, opt = {}) {
      if (z?.s7?.immortalGraveActive) return false;
      if (z?.flags?.bungee) return false;
      if (isBalloonAir(z)) return optCanAffectFlyingBalloon(opt);
      if (isUnderground(z)) return optCanAffectUndergroundDigger(opt);
      return true
    }

    function isDiving(z) {
      return !!(z && z.diving)
    }

    function isAbnormalImmuneZombie(z) {
      return !!(z && (z.type === "blackolive" || z.type === "football" && z.s7?.variant))
    }

    function hasPogo(z) {
      return !!(z && z.type === "pogo" && z.armors && z.armors.some(a => a.name === "跳跳杆" && a.hp > 0))
    }

    function isVaulting(z) {
      return !!(z && z.jumping && (z.flags?.pole || z.flags?.dolphin))
    }

    // -----------------------------------------------------------------------------

    // 查询/碰撞 / isS7FlyingZombie

    // [原源码行 3489] S7 图片口径中的“飞行僵尸”只指实际处于空中阶段的这些单位。

    // [原源码行 3490] 投掷小鬼属于飞行僵尸，但高坚果的拦截规则会单独将其排除。

    // -----------------------------------------------------------------------------

    function isS7FlyingZombie(z) {
      if (!z || z.dead) return false;
      if (z.type === "balloon") return isBalloonAir(z);
      if (z.type === "imp") return !!z.flyingImp || !!z.air || (z.airTimer || 0) > 0;
      if (z.type === "pogo") return (z.pogoAirTimer || 0) > 0;
      if (["pole", "polecmd", "dolphin"].includes(z.type)) return !!z.jumping || (z.jumpMove || 0) > 0;
      return false
    }

    function canZombiePassPlant(z) {
      if (!z || z.dead) return false;
      if (isBalloonAir(z)) return true;
      if (z.vehicle) return true;
      if (z.flags?.garg) return true;
      if (hasPogo(z)) return true;
      if (isVaulting(z)) return true;
      if (z.flags?.squash) return true;
      if (z.flags?.jalapeno) return true;
      if ((z.flags?.pole || z.flags?.dolphin) && !z.jumped) return true;
      if (z.flags?.ladder && z.armors.some(a => a.name === "扶梯" && a.hp > 0)) return true;
      return false
    }

    function canPlantTargetZombie(z, opts = {}) {
      if (!validHostile(z, opts.row ?? null)) return false;
      if (z.flags?.bungee) return false;
      if (isUnderground(z)) {
        if (opts.airOnly) return false;
        if (!opts.canHitUnderground && !plantCanAffectUndergroundDigger(opts.source || opts.from || opts.plant || opts
            .sourceKey)) return false;
        return optCanAffectUndergroundDigger(opts)
      }
      if (isBalloonAir(z)) {
        if (!(opts.airOnly || opts.canHitAir || opts.canAir || opts.balloon)) return false;
        return optCanAffectFlyingBalloon(opts)
      }
      if (opts.airOnly) return false;
      if (z.air && !(opts.canHitAir || opts.canAir)) return false;
      if (isDiving(z) && !opts.canHitDiving) return false;
      if (isVaulting(z) && z.type !== "dolphin") return false;
      return true
    }

    function canExplosionAffectZombie(z, opt = {}) {
      if (!z || z.dead || z.friendly || !isDamageableZombie(z)) return false;
      if (z.flags?.bungee) return false;
      if (isBalloonAir(z)) return optCanAffectFlyingBalloon(opt);
      if (isUnderground(z)) return optCanAffectUndergroundDigger(opt);
      if (opt.ash) return true;
      if (isDiving(z)) return false;
      return true
    }

    function zombieIsHardControlled(z) {
      return !!z && ((z.stun || 0) > 0 || (z.freeze || 0) > 0)
    }

    function surfaceDigger(z, reason = "出土", stunOverride = null, dir = -1) {
      if (!z || !z.flags?.digger || !z.underground) return;
      z.underground = false;
      z.dir = dir;
      z.speed = SPEEDS.diggerUp;
      setSpeedProfile(z, "diggerUp", true);
      z.hasPick = false;
      if (!z.armors.some(a => a.name === "矿工帽")) {
        z.armors.push(armor("矿工帽", 100, 1, true));
        s7RecalcZombieXp(z)
      }
      const baseStunTime = stunOverride ?? (z.s7?.variant ? 2.5 : 5);
      // 矿工出土属于动作流程：寒意只延长这次出土动作，不改变普通眩晕的全局计时规则。
      const stunTime = typeof s7ZombieActionDuration === "function"
        ? s7ZombieActionDuration(z, baseStunTime)
        : baseStunTime;
      z.stun = Math.max(z.stun || 0, stunTime);
      z.attackCd = Math.max(z.attackCd || 0, stunTime);
      const shown = Math.round(stunTime * 100) / 100;
      addEffect(z.row, z.x, `${reason}·眩晕${shown}s`, "#d6d3d1")
    }

    function s7NaturalDiggerSurfaceEvent(z) {
      if (!z || !z.flags?.digger || !z.underground) return null;
      if (z.s7?.variant) {
        if (z.x <= 1.5) return {
          x: 1.5,
          reason: "2列锁定出土"
        };
        return null
      }
      // 普通矿工：4～5列区间随机出土，越过4列左侧强制出土；
      // 这是自然出土规则，同行奇袭指令不取消它，只取消坚果/地刺/磁力菇等外部逼出土。
      if (z.x <= 3.5) return {
        x: 3.5,
        reason: "4列左侧强制出土"
      };
      if (z.x <= 4.5 && s7BattleRandom() < 1 / 180) return {
        x: z.x,
        reason: "4~5列随机出土"
      };
      return null
    }

    // -----------------------------------------------------------------------------

    // 查询/碰撞 / popBalloon

    // [原源码行 3556] 所有出土路径统一使用同一眩晕口径：普通矿工5秒，变种矿工减半为2.5秒。

    // -----------------------------------------------------------------------------

    function s7NormalizeGroundedBalloon(z, resetSpeed = false) {
      if (!z || z.type !== "balloon" || z.air) return false;
      z.flags = z.flags || {};
      z.flags.air = false;
      z.dir = z.friendly ? 1 : -1;
      z.jumping = false;
      z.jumpMove = 0;
      z.airTimer = 0;
      z.pogoAirTimer = 0;
      z.flyingImp = false;
      z.impLandingPending = false;
      z.s7 = z.s7 || {};
      delete z.s7.airborne;
      delete z.s7.balloonMoveLocked;
      delete z.s7.balloonLandingLock;
      z.s7.groundedBalloon = true;
      const badSpeed = z.speedProfile !== "ordinary" || !(finiteNumber(z.speedNow, 0) > 0);
      if (resetSpeed || badSpeed) {
        z.speed = SPEEDS.ordinary;
        setSpeedProfile(z, "ordinary", true)
      }
      return true
    }

    function popBalloon(z, reason = "气球破裂") {
      if (!z || !isBalloonAir(z)) return false;
      z.air = false;
      // 从空中态切换为真正的地面态，而不是只隐藏气球贴图。
      // 这会清除遗留的空中移动锁，并保留眩晕/冻结等正常控制效果。
      s7NormalizeGroundedBalloon(z, true);
      z.attackCd = 0;
      z.armors = z.armors.filter(a => a.name !== "气球");
      addEffect(z.row, z.x, reason, "#bae6fd");
      return true
    }

    function tallnutInterceptUndergroundDigger(z, oldX = null) {
      // 坚果/地刺对地下矿工的逼出土统一交给 damageDiggerRoots()，
      // 这样才能同时处理“坚果取消挖根伤害”“地刺反伤60”和奇袭指令免逼出土。
      return false
    }

    // -----------------------------------------------------------------------------

    // 查询/碰撞 / damageDiggerRoots

    // [原源码行 3573] 地下矿工挖到坚果、高坚果或地刺类植物时立即被迫出土；

    // [原源码行 3574] 奇袭指令在场时免疫这一强制出土规则。

    // -----------------------------------------------------------------------------

    function damageDiggerRoots(z, oldX, newX) {
      if (!isUnderground(z) || zombieIsHardControlled(z)) return;
      z.diggerRootHitIds = z.diggerRootHitIds || new Set;
      const right = Math.max(oldX, newX) + .04;
      const left = Math.min(oldX, newX) - .04;
      const raidLocked = s7HasCommand("raid", z.row);
      for (const p of state.plants) {
        if (!zombieCanTargetPlant(p) || p.row !== z.row || z.diggerRootHitIds.has(p.id)) continue;
        const px = p.col + .5;
        if (px < left || px > right) continue;
        z.diggerRootHitIds.add(p.id);
        const nut = ["wallnut", "tallnut", "explodenut"].includes(p.key);
        const spike = ["spikeweed", "spikerock"].includes(p.key);
        if (nut && !raidLocked) {
          addEffect(p.row, px, "坚果免挖根", "#fde68a", .45);
          z.x = px;
          surfaceDigger(z, "坚果拦截出土");
          return
        }
        damagePlant(p, 15, z);
        addEffect(p.row, px, "挖根-15", "#a16207", .45);
        if (spike) {
          damageZombie(z, 60, {
            system: true,
            noSource: true,
            noCritical: true
          });
          addEffect(z.row, z.x, "地刺反伤60", "#c084fc", .45);
          if (z.dead) return;
          if (!raidLocked && z.underground) {
            z.x = px;
            surfaceDigger(z, "地刺逼出土");
            return
          }
        }
      }
    }

    function s7LaneTarget(row, opts = {}) {
      let best = null;
      for (const z of state.zombies) {
        if (!canPlantTargetZombie(z, { ...opts, row })) continue;
        const zAirBalloon = isBalloonAir(z);
        const bestAirBalloon = best ? isBalloonAir(best) : false;
        if (!best || opts.preferFlyingBalloon && zAirBalloon && !bestAirBalloon ||
          (!opts.preferFlyingBalloon || zAirBalloon === bestAirBalloon) && z.x < best.x) best = z
      }
      return best
    }

    // -----------------------------------------------------------------------------

    // 查询/碰撞 / s7CattailGlobalTarget

    // [原源码行 3623] 默认植物索敌限定本行。猫尾草普通大刺是明确例外：可在全屏五行中索敌。

    // [原源码行 3624] 仍按最靠近房屋（x 最小）的有效敌人优先；同行与否不参与额外加权。

    // -----------------------------------------------------------------------------

    function s7CattailGlobalTarget(p) {
      if (!p || p.dead || !state) return null;
      let best = null;
      for (const z of state.zombies) {
        if (!canPlantTargetZombie(z, {
            row: null,
            canHitAir: true,
            source: p,
            sourceKey: "cattail"
          })) continue;
        const zAirBalloon = isBalloonAir(z);
        const bestAirBalloon = best ? isBalloonAir(best) : false;
        if (!best || zAirBalloon && !bestAirBalloon || zAirBalloon === bestAirBalloon && (z.x < best.x || z.x === best.x && Math.abs(z.row - p.row) < Math.abs(best.row - p.row))) best = z
      }
      return best
    }

