"use strict";

    // -----------------------------------------------------------------------------

    // 核心模拟 / damageZombie

    // [原源码行 4865] 普通种/宝藏种共有：每次直接受到植物攻击，反向减速伤害来源1.5s。

    // [原源码行 4871] 受推进指令影响：额外减速本行另一个随机主植物；默认效果不跨行。

    // [原源码行 4883] 原版基础行为：首次受到有效直接攻击后掉头逃跑。

    // -----------------------------------------------------------------------------

    const ZOMBIE_HIT_FLASH_DURATION = .12; // 12cs, same timing contract as the time-space edition.
    const ZOMBIE_HIT_FLASH_ALPHA = .5;

    function s7MarkZombieHitFlash(z, dealt) {
      if (!z || z.dead || !(finiteNumber(dealt, 0) > 0)) return false;
      const now = Math.max(0, finiteNumber(state?.time, 0));
      z.hitFlashUntil = Math.max(finiteNumber(z.hitFlashUntil, 0), now + ZOMBIE_HIT_FLASH_DURATION);
      return true
    }

    function s7ZombieHitFlashActive(z) {
      if (!z || z.dead) return false;
      const until = finiteNumber(z.hitFlashUntil, 0);
      return until > 0 && finiteNumber(state?.time, 0) <= until
    }

    function s7ArmorHitDamage(z, armorLayer, incoming, opt = {}) {
      let d = Math.max(0, incoming);
      if (!z || !armorLayer || d <= 0) return 0;
      const isScreenDoor = z.type === "screen" && armorLayer.name === "铁门";
      const isBombdoorDoor = z.type === "screen" && z.s7?.variant && armorLayer.name === "防爆铁门";
      if (isBombdoorDoor) {
        d = Math.min(d, finiteNumber(z.s7?.doorPerHitLimit, 30));
        d *= Math.max(0, 1 - finiteNumber(z.s7?.doorReduce, .4))
      }
      if ((isScreenDoor || isBombdoorDoor) && s7HasCommand("push", z.row)) d = Math.max(0, d - 5);
      return Math.min(d, armorLayer.hp)
    }

    function s7ForcedUnpierceableArmor(z) {
      if (!z || !Array.isArray(z.armors)) return null;
      return z.armors.find(a => a && a.hp > 0 && (z.type === "newspaper" && (a.name === "报纸" || a.name === "狂暴报纸") || z.type === "screen" && a.name === "防爆铁门")) || null
    }

    function s7ApplyFinalFlatReduce(z, amount, opt = {}) {
      let d = Math.max(0, amount);
      const r = z?.type === "zomboni" ? Math.max(0, finiteNumber(z?.s7?.flatReduce, 0)) : 0;
      if (r > 0) d = Math.max(0, d - r);
      return d
    }

    function damageZombie(z, amount, opt = {}) {
      if (!z || z.dead) return false;
      if (z.flags?.bungee) return false;
      // Versus Target: immune to instant-kill/ash/laneWipe; only take numeric damage
      if (z.versusObjective && (opt.ash || opt.instantKill || opt.laneWipe)) return false;
      if (!canAffectZombieState(z, opt)) return false;
      if (killIfBodyHpDepleted(z, opt)) return true;
      if (opt.zombieAttacker && !opt.zombieAttacker.dead) z._lastAttacker = opt.zombieAttacker;
      if (s7NewspaperRageInvincibleActive(z)) {
        s7CountNewspaperRageHit(z, opt, 0, true);
        return true
      }
      if (z.invincible > 0) return false;
      let amount2 = amount;
      if (!opt.element && !opt.ash) {
        amount2 *= s7VulnMultiplier(z);
        const e = s7Elem(z);
        if (z.s7?.command && z.type === "bombdoor") {
          const rawBombdoorDamage = amount2;
          if (z.s7.resist > 0) amount2 *= .4;
          amount2 = Math.min(amount2, 150);
          if (rawBombdoorDamage >= 50) {
            z.s7.resist = 1.5
          }
        }
        // 推进类防具减伤改在实际承伤防具上结算；避免防爆门/铁门减伤错误作用于本体或被穿透伤害。
        if (isAbnormalImmuneZombie(z)) s7ClearAbnormalState(z);
      }
      if (s7NewspaperRageReduceActive(z)) amount2 *= .25;
      if (z.type === "tallz" && !opt.ash && !opt.pierceAll) amount2 = Math.max(0, amount2 - 5);
      amount2 = s7ApplyFinalFlatReduce(z, amount2, opt);
      // “降低N点伤害”允许把小额攻击完整减为0。装甲车12点格挡也统一在最终伤害阶段结算。
      if (amount2 <= 0) return false;
      // 空中气球受致命伤害时强制爆球落地，不在空中死亡。
      if (isBalloonAir(z) && amount2 >= totalHp(z) - z.crit) {
        popBalloon(z, "空中受创落地");
        return true
      }
      // v10.9.10：空中气球受到允许命中的伤害时直接在空中按正常血量链结算。
      // 显式的吹飞、磁力、寒冰菇等非伤害击落机制仍可主动调用 popBalloon()。
      if (z.type === "dolphin" && isVaulting(z) && opt.source && !opt.noSource) {
        z.lastHitPlant = opt.source;
        s7MarkZombieHitFlash(z, amount2);
        killZombie(z, {
          source: opt.source,
          noCritical: true,
          noTransform: true
        });
        addEffect(z.row, z.x, "海豚被击落", "#93c5fd", .65);
        return true
      }
      if (opt.source) z.lastHitPlant = opt.source;
      if (opt.hitMeta) z.lastHitMeta = opt.hitMeta;
      const before = totalHp(z);
      if (opt.ash) {
        const ashBefore = before;
        let ashDealt = 0;
        if (totalHp(z) <= amount2) {
          killZombie(z, {
            source: opt.source,
            noCritical: true,
            noTransform: true
          });
          ashDealt = ashBefore
        } else {
          z.armors = [];
          z.hp -= amount2;
          killIfBodyHpDepleted(z, opt);
          ashDealt = Math.min(ashBefore, amount2)
        }
        if (opt.source) {
          const team = state.teams[opt.source.row];
          if (team) team.damage += ashDealt
        }
        s7TriggerLumenChain(z, ashDealt, opt);
        s7YetiOnDirectPlantAttack(z, ashDealt, opt);
        s7CountNewspaperRageHit(z, opt, ashDealt, false);
        s7MarkZombieHitFlash(z, ashDealt);
        return true
      }
      if (z.dying && !z.noCrit) return false;
      let left = amount2;
      while (left > 0) {
        let a = s7ForcedUnpierceableArmor(z);
        if (!a) {
          if (opt.pierceAll) a = null;
          else if (!opt.ignore2) a = z.armors.find(x => x.hp > 0);
          else a = z.armors.find(x => x.hp > 0 && x.cls !== 2)
        }
        if (a) {
          const d = s7ArmorHitDamage(z, a, left, opt);
          if (d <= 0) {
            left = 0;
            break
          }
          a.hp -= d;
          const stopsOverflow = z.type === "screen" && (a.name === "铁门" || a.name === "防爆铁门") || z.type === "newspaper" && (a.name === "报纸" || a.name === "狂暴报纸");
          left = stopsOverflow ? 0 : Math.max(0, left - d);
          if (a.hp <= 0) {
            if (z.type === "cone" && a.name === "路障") s7SpawnDetachedAsset(z,"coneArmor","zombie.b04a.detached.cone",{y:-.28,groundY:.30,pixelScale:.00345,ttl:2.3});
            if (z.type === "bucket" && a.name === "铁桶") s7SpawnDetachedAsset(z,"bucketArmor","zombie.b04c.detached.bucket",{y:-.30,groundY:.30,pixelScale:.0027,ttl:2.3});
            z.armors = z.armors.filter(x => x.hp > 0);
            if (z.blind) {
              s7MarkZombieHitFlash(z, Math.max(0, before - totalHp(z)));
              transformBlind(z);
              return true
            }
            if (z.flags.enrage) {
              beginNewspaperRage(z, opt);
              left = 0
            }
          } else break
        } else break
      }
      if (left > 0) {
        if (z.noCrit) {
          z.hp -= left;
          killIfBodyHpDepleted(z, opt)
        } else {
          if (z.hp - left <= z.crit) {
            if (z.blind) {
              s7MarkZombieHitFlash(z, Math.min(left, Math.max(0, z.hp - z.crit)));
              transformBlind(z);
              return true
            }
            z.hp = z.crit;
            z.dying = true;
            addEffect(z.row, z.x, "临界", "#a3a3a3")
          } else z.hp -= left
        }
      }
      killIfBodyHpDepleted(z, opt);
      const dealt = Math.max(0, before - totalHp(z));
      s7MarkZombieHitFlash(z, dealt);
      if (opt.source) {
        const team = state.teams[opt.source.row];
        if (team) team.damage += dealt
      }
      s7TriggerLumenChain(z, dealt, opt);
      s7YetiOnDirectPlantAttack(z, dealt, opt);
      s7CountNewspaperRageHit(z, opt, dealt, false);
      return true
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / transformBlind

    // [原源码行 4979] 报纸打掉后先进入固定1.5秒原地暴怒无敌阶段，

    // [原源码行 4980] 阶段结束才切换为相对于破报前基础速度的2倍冲刺。

    // [原源码行 4982] 破报这一击只结算到报纸层；无敌从报纸破裂的同一瞬间生效，

    // [原源码行 4983] 禁止本次攻击的溢出伤害继续穿入本体。

    // [原源码行 4995] 穿甲伤害若直接打到盲盒本体的致死线，必须立即开盒；

    // [原源码行 4996] 不能进入普通僵尸的临界死亡流程后把盲盒静默删除。

    // [原源码行 5014] 雪人受击反制、推进指令额外反制与受伤逃跑统一走单一正式入口。

    // -----------------------------------------------------------------------------

    function s7ConvertZombieToFriendly(z, reason = "魅惑") {
      if (!z || z.dead || z.friendly) return false;
      z.s7 = z.s7 || {};
      // 指令僵尸被策反后必须立刻退出敌方同行指令计数，避免继续给敌方提供光环或变种加成。
      if (z.s7.command && !z.s7.commandRemoved) {
        s7SetCommandStateForZombie(z, -1);
        z.s7.commandRemoved = true
      }
      z.s7.commandSpawnResolved = true;
      z.s7.commandSpawnPending = 0;
      z.friendly = true;
      z.dir = 1;
      z.attackCd = 0;
      z.garlicFlee = 0;
      delete z.s7KelpTargeting;
      addEffect(z.row, z.x, reason, "#c084fc", .45);
      return true
    }

    function s7TryHypnoBetrayal(victim, attacker, label = "策反击杀") {
      if (!victim || victim.s7BetrayalTriggered || !attacker || attacker.dead || attacker.friendly) return false;
      if (!s7ConvertZombieToFriendly(attacker, label)) return false;
      victim.s7BetrayalTriggered = true;
      s7GrantShineToIceStarHypno(victim.row, 7.5, label === "策反开盒" ? "开盒照耀" : "击杀照耀");
      return true
    }

    function transformBlind(z) {
      if (!z || z.dead) return null;
      const row = z.row,
        x = z.x,
        wasFriendly = !!z.friendly;
      if (z.s7CharmedBox) s7TryHypnoBetrayal(z, z._lastAttacker, "策反开盒");
      const team = state.teams[row];
      if (team) team.transforms++;
      if (z.s7Box) return s7OpenBlindTo(z, z.s7Box.type, z.s7Box.variant, z.s7Box.cat, z.s7Box.command ? "指令开盒→" : z.s7Box.variant ? "变种开盒→" :
        "开盒→", !!z.s7Box.command);
      const forcedType = z.s7ForcedType;
      if (forcedType) {
        // 指令召唤盲盒：开出同类型变种僵尸（携带指令增益效果），但本身不是指令僵尸（command=false）。
        const cmdCat = z.s7ForcedCategory || z.s7?.category;
        return s7OpenBlindTo(z, forcedType, true, cmdCat, "指令召唤变种开盒→", false)
      }
      const forced = z.s7ForcedCategory;
      if (forced && S7_ZOMBIE_CATS[forced]) {
        // 指令召唤盲盒：从该系列随机选一种僵尸，必出变种（携带指令增益效果），本身不是指令僵尸。
        const forcedPicked = s7PickForcedCategoryBoxResult(forced);
        return s7OpenBlindTo(z, forcedPicked.type, true, forcedPicked.cat, "指令召唤开盒→", false)
      }
      const picked = s7PickBoxResult(wasFriendly);
      return s7OpenBlindTo(z, picked.type, picked.variant, picked.cat, picked.command ? "指令开盒→" : picked.variant ? "变种开盒→" : "开盒→", !!picked.command)
    }

    function s7JalapenoBlastColumns(z) {
      const cell = Math.max(0, Math.min(COLS - 1, Math.floor(finiteNumber(z?.x, 0))));
      return {
        cell: cell,
        minCol: Math.max(0, cell - 3),
        maxCol: Math.min(PLANT_COLS - 1, cell)
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7ForEachPlantInJalapenoBlast

    // [原源码行 5063] 辣椒僵尸的爆炸形状固定为本行 1×4：僵尸所在格 + 左侧 3 格。

    // [原源码行 5064] 第10列是不可种植的进场格，因此僵尸在第10列爆炸时，只会命中

    // [原源码行 5065] 与这四格相交的第7～9列植物，不会错误扩展到右侧或整行。

    // -----------------------------------------------------------------------------

    function s7ForEachPlantInJalapenoBlast(z, callback) {
      if (!z || !state || typeof callback !== "function") return 0;
      const {
        minCol: minCol,
        maxCol: maxCol
      } = s7JalapenoBlastColumns(z);
      if (maxCol < minCol) return 0;
      let count = 0;
      for (const p of state.plants) {
        if (!p || p.dead || p.row !== z.row || p.col < minCol || p.col > maxCol) continue;
        callback(p);
        count++
      }
      return count
    }

    function s7DrawJalapenoBlast(z, color, ttl) {
      const {
        minCol: minCol,
        maxCol: maxCol
      } = s7JalapenoBlastColumns(z);
      for (let c = minCol; c <= maxCol; c++) addGridEffect(z.row, c, color, ttl, false)
    }

    function explodeVariantJalapeno(z, label = "易燃辣椒爆炸150") {
      if (!z || !state || z.s7?.jalapenoVariantExploded) return;
      z.s7 = z.s7 || {};
      z.s7.jalapenoVariantExploded = true;
      const hitCount = s7ForEachPlantInJalapenoBlast(z, p => damagePlant(p, 150, z));
      s7DrawJalapenoBlast(z, "#fb7185", .7);
      addEffect(z.row, z.x, `${label}·1×4${hitCount?`·命中${hitCount}`:""}`, "#ef4444")
    }

    function explodeNormalJalapenoZombie(z) {
      if (!z || !state || z.s7?.jalapenoNormalExploded) return;
      z.s7 = z.s7 || {};
      z.s7.jalapenoNormalExploded = true;
      const hitCount = s7ForEachPlantInJalapenoBlast(z, p => damagePlant(p, Math.max(0, p.hp * .5), z));
      state.iceTrails = finiteArray(state.iceTrails).filter(t => t.row !== z.row);
      s7DrawJalapenoBlast(z, "#ef4444", 1.2);
      addEffect(z.row, z.x, `辣椒半血爆炸·1×4${hitCount?`·命中${hitCount}`:""}`, "#fb923c")
    }

    // -----------------------------------------------------------------------------

    // 巨人投掷 / 1.5秒前摇状态机与唯一生成入口
    //
    // 框架约束：
    // 1. 达到半血及位置条件时，只进入前摇，不立即生成小鬼。
    // 2. 前摇严格持续 1.50 个游戏秒；期间巨人不自主移动、不砸击、不啃咬。
    // 3. 眩晕、冻结或冰封会暂停前摇计时，不允许硬控期间完成投掷。
    // 4. 小鬼只能由前摇完成路径生成；死亡函数绝不补投。
    // 5. 前摇结束前巨人死亡，状态随实体一起清理，不生成小鬼。

    const S7_GARG_THROW_WINDUP_SECONDS = 1.5;

    function s7GargThrowPositionAllowed(z) {
      if (!z) return false;
      return z.friendly ? z.x <= 5 : z.x >= 5
    }

    function s7GargCanStartThrowWindup(z) {
      if (!z || z.dead || !z.flags?.garg || z.thrown || !(z.hp < z.maxHp / 2)) {
        if (z && z.flags?.garg && z.hp < z.maxHp / 2 && !z.thrown) {
          log(`[DEBUG] ${z.name||z.type} 半血投掷被阻: dead=${z.dead} thrown=${z.thrown} hp=${z.hp}/${z.maxHp}`);
        }
        return false;
      }
      if (z.s7?.gargThrowPhase === "windup") return false;
      if (zombieIsHardControlled(z) || (s7Elem(z).iceBound || 0) > 0) {
        log(`[DEBUG] ${z.name||z.type} 半血投掷被控: stun=${z.stun} freeze=${z.freeze} iceBound=${s7Elem(z).iceBound}`);
        return false;
      }
      if (!s7GargThrowPositionAllowed(z)) {
        log(`[DEBUG] ${z.name||z.type} 半血投掷位置不足: x=${z.x?.toFixed(1)}`);
        return false;
      }
      return true
    }

    function s7StartGargThrowWindup(z) {
      if (!s7GargCanStartThrowWindup(z)) return false;
      z.s7 = z.s7 || {};
      z.s7.gargThrowPhase = "windup";
      z.s7.gargThrowWindupRemaining = S7_GARG_THROW_WINDUP_SECONDS;
      addEffect(z.row, z.x, "投小鬼前摇1.5s", "#fda4af", .8);
      return true
    }

    function s7SpawnGargImp(z, sourceTag = "garg-imp") {
      if (!z || z.dead || z.hp <= 0 || !z.flags?.garg || z.thrown || z.s7?.gargThrowPhase !== "windup") return null;
      // 防御性约束：即使未来新增调用点，也不能在1.5秒前摇尚未结束、巨人正被控制或巨人已死亡时绕过状态机提前投出小鬼。
      if (zombieIsHardControlled(z) || (s7Elem(z).iceBound || 0) > 0) return null;
      if (finiteNumber(z.s7?.gargThrowWindupRemaining, S7_GARG_THROW_WINDUP_SECONDS) > 1e-9) return null;
      z.thrown = true;
      delete z.s7.gargThrowPhase;
      delete z.s7.gargThrowWindupRemaining;
      const friendly = !!z.friendly;
      let imp;
      if (friendly) {
        imp = makeZombie("imp", z.row, COLS - 2 - s7BattleRandom() * 1.5);
        imp.friendly = true;
        imp.dir = 1
      } else {
        imp = markThrownImp(makeZombie("imp", z.row, 1.5 + s7BattleRandom() * 1.5), .8)
      }
      imp.s7 = imp.s7 || {};
      imp.s7Elem = {
        ...s7Elem(z)
      };
      if (z.s7Vuln) imp.s7Vuln = z.s7Vuln;
      if (z.s7?.hugeGarg) {
        imp.hp += 150;
        imp.maxHp += 150
      }
      if (z.s7?.superGiga) {
        imp.hp += 450;
        imp.maxHp += 450
      }
      s7RefreshZombieCriticalSplit(imp);
      s7RecalcZombieXp(imp);
      if (friendly) applyImpLandingStun(imp, "友军小鬼落地眩晕");
      const spawnedImp = safePushZombie(imp, sourceTag);
      if (spawnedImp && !spawnedImp.friendly) s7KillZombieByUmbrella(spawnedImp, "保护伞秒杀小鬼落点");
      if (spawnedImp) addEffect(z.row, spawnedImp.x, friendly ? "友军小鬼" : "投小鬼", "#fda4af");
      return spawnedImp
    }

    function s7UpdateGargThrowWindup(z, dt) {
      if (!z || z.dead || !z.flags?.garg || z.thrown) return false;
      if (z.s7?.gargThrowPhase !== "windup") {
        return s7StartGargThrowWindup(z)
      }
      // 前摇状态本身始终拦截本帧后续移动和攻击；硬控期间只暂停计时。
      if (zombieIsHardControlled(z) || (s7Elem(z).iceBound || 0) > 0) return true;
      z.s7.gargThrowWindupRemaining = Math.max(0, finiteNumber(z.s7.gargThrowWindupRemaining,
        S7_GARG_THROW_WINDUP_SECONDS) - dt);
      if (z.s7.gargThrowWindupRemaining > 1e-9) return true;
      // 只有活着且未被控制地完成整段1.5秒前摇，才允许从唯一入口生成小鬼。
      s7SpawnGargImp(z, z.friendly ? "friendly-garg-windup-imp" : "garg-windup-imp");
      return true
    }

    function s7SuppressKillXpForZombie(z) {
      // 盲盒实体和魅惑/友军僵尸的经验值恒为0。
      // 盲盒开出的敌方真实僵尸仍按自身本体与一/二类防具最大生命值正常结算。
      return !!(z && (z.blind || z.friendly || z.s7CharmedByHypno))
    }

    function killZombie(z, opt = {}) {
      if (!z || z.dead) return false;
      if (z.s7?.immortalGraveActive && !opt.system) return false;
      if (isBalloonAir(z) && !optCanAffectFlyingBalloon(opt) && !(z.dying && !opt.source)) return false;
      if (isUnderground(z) && !optCanAffectUndergroundDigger(opt) && !(z.dying && !opt.source)) return false;
      if (z.blind && !opt.noTransform) {
        transformBlind(z);
        return true
      }
      if (z.friendly) s7GrantShineToIceStarHypno(z.row, 7.5, "击杀照耀");
      if (z.type !== "blackolive" && z.s7?.reviveOnce && !z.s7.revived) {
        z.s7.revived = true;
        z.hp = z.type === "squashz" ? z.maxHp : z.maxHp * .5;
        z.dying = false;
        z.dead = false;
        addEffect(z.row, z.x, z.type === "squashz" ? "满血复活" : "复活", "#fda4af");
        return
      }
      // 巨人死亡只进入统一死亡流程；未完成的投掷前摇立即作废且不得补投小鬼。
      if (z.flags?.garg && z.s7) {
        delete z.s7.gargThrowPhase;
        delete z.s7.gargThrowWindupRemaining;
        delete z.s7.gargSmashTargetId;
        delete z.s7.gargSmashTargetKind;
        delete z.s7.gargSmashTargetRow;
        delete z.s7.gargSmashTargetCol;
        delete z.s7.gargSmashLockedX;
        delete z.s7.gargSmashInterruptedFrame
      }
      z.dead = true;
      // Versus Target death notification
      if (z.versusObjective) try { window.S7VersusBattle?.handleTargetDeath?.(z) } catch (_) {}
      if (z.s7KelpGrabbed) s7KelpReleaseTarget(z, true);
      if (z.s7?.command && !z.s7.commandRemoved) {
        const category = z.s7.category || z.s7.commandCategory;
        s7SetCommandStateForZombie(z, -1)
        z.s7.commandRemoved = true
      }
      if (z.s7CharmedByHypno) s7TryHypnoBetrayal(z, z._lastAttacker, "策反击杀");
      if (z.type === "immortal" && z.s7?.variant && !opt.noTransform && !opt.instantKill) {
        const summonVariant = s7BattleRandom() < S7_IMMORTAL_RULE.deathSummonVariantChance;
        const summonX = Math.max(S7_IMMORTAL_RULE.deathSummonMinX, finiteNumber(z.x,
          S7_IMMORTAL_RULE.deathSummonMinX) - S7_IMMORTAL_RULE.deathSummonForwardOffset);
        const nz = makeZombie("immortal", z.row, summonX, {
          variant: summonVariant,
          category: "push",
          immortalSummoned: true
        });
        safePushZombie(nz, "immortal-death-summon");
        addEffect(z.row, z.x, summonVariant ? "亡唤召唤·亡唤" : "亡唤召唤·普通", "#a8a29e")
      }
      if (z.type === "jalapenoz" && z.s7?.variant && !opt.noTransform) {
        explodeVariantJalapeno(z)
      }
      if (!s7SuppressKillXpForZombie(z)) {
        const gildedXpHandled = s7ResolveGildedDeath(z);
        if (!gildedXpHandled) {
          if (opt.noSource) s7GrantKillXp(z, null);
          else if (opt.source) s7GrantKillXp(z, opt.source);
          else s7GrantKillXp(z, z.lastHitPlant || null)
        }
      }
      if (z.lastHitPlant && z.lastHitPlant.key === "cattail") {
        const owner = z.lastHitPlant;
        const ownerAlive = !!owner && !owner.dead && finiteArray(state.plants).includes(owner);
        if (ownerAlive) {
          const lv = owner.s7?.level || 0;
          const small = !!z.lastHitMeta?.cattailSmall;
          const prob = small ? lv >= 5 ? 1 : lv >= 4 ? .95 : lv >= 3 ? .9 : 0 : 1;
          if (s7BattleRandom() < prob) s7SpawnTurret(owner)
        }
      }
      if (z.lastHitPlant && z.lastHitPlant.key === "firelotus") {
        const owner = z.lastHitPlant;
        const ownerAlive = !owner.dead && finiteArray(state.plants).includes(owner);
        const lv = owner.s7?.level || 0;
        if (ownerAlive && lv >= 3) {
          owner.s7.fireKills = (Math.max(0, Math.floor(owner.s7.fireKills || 0)) + 1) % 3;
          if (owner.s7.fireKills === 0) {
            owner.hp = Math.min(owner.maxHp, owner.hp + 50);
            const duration = lv >= 5 ? 4 : 3;
            owner.s7.fertilizer = duration;
            addEffect(owner.row, owner.col + .5, `肥料${duration}s·回血50·攻速+100%`, "#86efac", .8)
          }
        }
      }
      if (z.lastHitPlant?.key === "scaredy") s7RecordScaredyKill(z.lastHitPlant, z);
      {
        const gatlingSource = opt.source?.key === "gatling" ? opt.source : z.lastHitPlant?.key === "gatling" ? z
          .lastHitPlant : null;
        const elem = s7Elem(z);
        const frozenAtKill = (z.freeze || 0) > 0 || (elem.iceBound || 0) > 0;
        const breakDamage = Math.max(0, Math.round((elem.cold || 0) * S7_GATLING_RULE.iceBreakDamagePerCold));
        if (gatlingSource && frozenAtKill && breakDamage > 0 && !z.s7GatlingBreakSplash) {
          // 破冰溅射范围：周围1.25格（横向±1.25格，纵向±1行）。
          for (const q of state.zombies) {
            if (q === z || q.dead || q.friendly || Math.abs(q.row - z.row) > 1) continue;
            const distance = Math.abs(q.x - z.x);
            if (distance > S7_GATLING_RULE.iceBreakRadius) continue;
            q.s7GatlingBreakSplash = true;
            damageZombie(q, breakDamage, {
              source: gatlingSource,
              element: true
            });
            q.s7GatlingBreakSplash = false
          }
          addEffect(z.row, z.x, `破冰${breakDamage}`, "#bfdbfe")
        }
      }
      const team = state.teams[Math.max(0, Math.min(ROWS - 1, z.row))];
      if (team) {
        team.kills++;
        if (opt.noCritical || opt.noTransform) team.noCritKills++;
        if (z.blind) team.blindKills++
      }
      if (z.type === "yeti") {
        const sunAmount = 500;
        state.sun += sunAmount;
        addEffect(z.row, z.x, "💎+" + sunAmount, "#a5f3fc");
        log(`雪人僵尸被击杀，获得 ${sunAmount} 阳光！`)
      }
      if (z.type === "bobsledSled" && z.flags.riders) {
        const riders = spawnBobsledSquad(z.row, z.x, {
          friendly: !!z.friendly,
          variantSled: !!z.s7?.variant,
          category: z.s7?.category || "summon"
        });
        const inheritedElements = z.s7?.inheritedElementsOnDismount || null;
        if (inheritedElements)
          for (const rider of riders) s7RestoreElementState(rider, inheritedElements);
        addEffect(z.row, z.x, "雪橇散架", "#c7d2fe")
      }
      return true
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / nearestHostileForFriendly

    // [原源码行 5137] 盲盒的统一“直接击杀”语义：除非调用方明确声明 noTransform，

    // [原源码行 5138] 否则任何斩杀/秒杀都必须先开盒，而不是把盲盒实体直接删除。

    // [原源码行 5139] 特殊清盒、吞噬、灰烬等不开盒机制继续显式传 noTransform:true。

    // [原源码行 5182] 变种·易燃辣椒：被打死只造成 100 的本行 1×4 小爆炸。

    // [原源码行 5193] 无论大刺跨到哪一行击杀，炮位都固定取所属猫尾草的本格。

    // [原源码行 5194] 所属猫尾草一旦死亡或离场，既有大刺与浮游炮小刺都不得再召唤新炮。

    // [原源码行 5219] 文档规则：肥料是3阶才解锁的击杀被动。

    // [原源码行 5220] 0~2阶击杀既不累计次数，也不得回血或获得攻速增益。

    // [原源码行 5227] “不可叠加”按固定时长刷新处理，不做时长相加或倍率叠乘。

    // [原源码行 5267] 破冰伤害按图片给出的“寒意层数×5”精确结算；

    // [原源码行 5268] 不额外绕过二类防具，也不吃易伤倍率，避免实际伤害偏离标称值。

    // -----------------------------------------------------------------------------

    function nearestHostileForFriendly(f) {
      const raidCmd = s7HasCommand("raid", f.row);
      const arr = state.zombies.filter(z => canPlantTargetZombie(z, {
        row: f.row,
        canHitDiving: !raidCmd
      }));
      if (!arr.length) return null;
      arr.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
      return arr[0]
    }

    const _friendlyLaneLookup = [];
    let _friendlyLaneLookupRow = -1;
    let _friendlyLaneSourceLength = 0;
    function s7PrepareFriendlyLaneLookup(row, laneZombies = null) {
      _friendlyLaneLookup.length = 0;
      _friendlyLaneLookupRow = Number.isInteger(row) ? row : -1;
      const source = laneZombies || finiteArray(state?.zombies);
      for (let i = 0; i < source.length; i++) {
        const z = source[i];
        if (z && !z.dead && z.friendly && z.row === row && !isBalloonAir(z) && !isUnderground(z)) {
          _friendlyLaneLookup.push(z)
        }
      }
      _friendlyLaneSourceLength = finiteArray(state?.zombies).length
    }

    function nearestFriendlyAt(row, x) {
      let source;
      if (_friendlyLaneLookupRow === row) {
        // Main-pass summons are appended to state.zombies. Fold newly appended friendlies
        // into the active lane lookup without rescanning the full zombie population.
        const all = finiteArray(state?.zombies);
        for (let i = _friendlyLaneSourceLength; i < all.length; i++) {
          const z = all[i];
          if (z && !z.dead && z.friendly && z.row === row && !isBalloonAir(z) && !isUnderground(z)) {
            _friendlyLaneLookup.push(z)
          }
        }
        _friendlyLaneSourceLength = all.length;
        source = _friendlyLaneLookup
      } else source = finiteArray(state?.zombies);
      let best = null;
      let bestDistance = .48;
      for (let i = 0; i < source.length; i++) {
        const z = source[i];
        if (!z || z.dead || !z.friendly || z.row !== row || isBalloonAir(z) || isUnderground(z)) continue;
        const distance = Math.abs(finiteNumber(z.x, 999) - x);
        if (distance < bestDistance) {
          best = z;
          bestDistance = distance
        }
      }
      return best
    }

    function nearestHostileAt(row, x) {
      const source = finiteArray(state?.zombies);
      let best = null;
      let bestDistance = 0.48;
      for (let i = 0; i < source.length; i++) {
        const z = source[i];
        if (!z || z.dead || z.friendly || z.row !== row || isBalloonAir(z) || isUnderground(z)) continue;
        const distance = Math.abs(finiteNumber(z.x, 999) - x);
        if (distance < bestDistance) {
          best = z;
          bestDistance = distance;
        }
      }
      return best;
    }

    function damageFriendlyZombie(z, amount, attacker, opt = {}) {
      if (!z || z.dead) return false;
      if (attacker) z._lastAttacker = attacker;
      const markedByHypno = !!z.s7CharmedByHypno;
      const result = damageZombie(z, amount, {
        ...opt,
        noTeam: true,
        zombieAttacker: attacker || null
      });
      if (markedByHypno && (z.dead || z.dying)) s7TryHypnoBetrayal(z, attacker, "策反击杀");
      return result
    }

    function s7GargZombieHammerAoe(attacker, center, opt = {}) {
      if (!attacker || attacker.dead || !center) return 0;
      const row = center.row;
      const x = finiteNumber(center.x, attacker.x);
      const hitFriendly = !!opt.hitFriendly;
      // 普通红眼砸僵尸900、巨大化红眼1800；白眼对僵尸侧固定900。
      const aoeDmg = attacker.type === "giga" ? (attacker.s7?.superGiga ? 1800 : 900) : 900;
      let n = 0;
      const qArr = state.zombies;
      const qLen = qArr.length;
      for (let qi = 0; qi < qLen; qi++) {
        const q = qArr[qi];
        if (!q || q.dead || q === attacker) continue;
        if (q.row !== row || Math.abs(q.x - x) > 1.5) continue;
        if (hitFriendly ? !q.friendly : q.friendly) continue;
        if (q.friendly) damageFriendlyZombie(q, aoeDmg, attacker, {
          noSource: true,
          noCritical: true,
          pierceAll: true
        });
        else damageZombie(q, aoeDmg, {
          source: null,
          noSource: true,
          noCritical: true,
          pierceAll: true
        });
        n++
      }
      if (n) addEffect(row, x, `巨人对僵尸群锤${aoeDmg}×${n}`, "#f87171", .55);
      return n
    }

    function updateFriendlyZombie(z, dt) {
      const actionRate = z.s7Elem?.cold > 0 ? s7ZombieColdActionRate(z) : 1;
      const actionDt = dt * actionRate;
      if (updatePoleCommanderState(z, actionDt)) return;
      if (s7UpdateGargThrowWindup(z, actionDt)) return;
      if (s7UpdateGargSmashWindup(z, actionDt)) return;
      if (zombieIsHardControlled(z)) return;
      if (s7BackupShouldWaitForDancer(z)) return;
      if (z.flags?.dancer && !z.summoned && z.age > TIMES.dancerNaturalSummon) {
        summonDancers(z);
        z.summoned = true;
        z.speed = SPEEDS.ordinary;
        setSpeedProfile(z, "ordinary", true)
      }
      if (isUnderground(z)) {
        z.x += Math.max(.12 * actionRate, currentSpeed(z, dt)) * dt;
        if (z.x > COLS + .6) z.dead = true;
        return
      }
      if (isBalloonAir(z)) {
        z.x += Math.max(.12 * actionRate, currentSpeed(z, dt)) * dt;
        if (z.x > COLS + .6) z.dead = true;
        return
      }
      const enemy = nearestHostileForFriendly(z);
      const passer = canZombiePassPlant(z);
      if (enemy) {
        const dist = Math.abs(z.x - enemy.x);
        if (dist < .46) {
          if (z.vehicle) {
            damageZombie(enemy, CHARMED_VEHICLE_DPS * actionDt, {
              source: null,
              noCritical: true
            });
            addEffect(z.row, z.x, "车碾", "#fca5a5", .15)
          } else if (z.flags.garg) {
            // 友军巨人也必须从接触帧起立刻停下，完整走举锤→落锤→收锤；
            // 禁止因“巨人可穿过植物”的通用标记在锁定当帧继续移动。
            s7LockGargSmashTarget(z, enemy, "zombie");
            return
          } else {
            damageZombie(enemy, EAT_DPS * actionDt, {
              source: null,
              noSource: true
            })
          }
          if (!enemy.dead) {
            const enemyActionDt = dt * (enemy.s7Elem?.cold > 0 ? s7ZombieColdActionRate(enemy) : 1);
            if (enemy.vehicle) damageFriendlyZombie(z, CHARMED_VEHICLE_DPS * enemyActionDt, enemy);
            else if (enemy.flags.garg) {
              // 敌方巨人的砸击由其自身统一前摇状态机处理，禁止在友军分支瞬时反锤。
            } else damageFriendlyZombie(z, EAT_DPS * enemyActionDt, enemy)
          }
          if (!passer) return
        }
      }
      z.x += Math.max(.12 * actionRate, currentSpeed(z, dt)) * dt;
      if (z.x > COLS + .6) z.dead = true
    }

    function updateFriendlies(dt, rowFilter = null, laneZombies = null) {
      const zombies = laneZombies || state.zombies;
      const initialLength = zombies.length;
      for (let i = 0; i < initialLength; i++) {
        const z = zombies[i];
        if (!z || rowFilter !== null && z.row !== rowFilter) continue;
        if (z.dead || !z.friendly) continue;
        updateFriendlyZombie(z, dt)
      }
    }

    function updateBullets(dt, rowFilter = null, laneBullets = null) {
      const bullets = laneBullets || state.bullets;
      // This pre-pass used to scan the complete bullet array once for every lane.
      // Restrict it to the lane currently being processed.
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b || rowFilter !== null && b.row !== rowFilter) continue;
        if (b.bounce && b.x < .05) {
          b.dx = Math.abs(b.dx || 5);
          b.bounce = false;
          addEffect(Math.max(0, Math.min(ROWS - 1, Math.floor(b.y))), .2, "反弹", "#fed7aa")
        }
      }
      // Preserve snapshot semantics without allocating [...state.bullets] five times per logic frame.
      const initialLength = bullets.length;
      for (let i = 0; i < initialLength; i++) {
        const b = bullets[i];
        if (!b || rowFilter !== null && b.row !== rowFilter) continue;
        if (b.delay > 0) {
          b.delay -= dt;
          continue
        }
        b.life -= dt;
        if (b.life <= 0) {
          b.dead = true;
          continue
        }
        if (b.iceLanceTimer != null) {
          b.iceLanceTimer -= dt;
          if (b.iceLanceTimer <= 0) {
            b.dead = true;
            continue
          }
        }
        if (b.starTurnAfter != null) {
          s7PrepareStarBullet(b);
          b.life = Math.max(b.life, 8);
          if (b.starStored) {
            b.starStored = false;
            b.starTurned = true;
            s7RetargetStarBullet(b)
          }
          if (b.starTurned && !b.starNoTurn) s7RetargetStarBullet(b)
        }
        const oldX = b.x,
          oldY = b.y;
        if (b.starTurnAfter != null && !b.starTurned) {} else if (b.homing && b.targetId && !b.target) {
          b.target = getZombieById(b.targetId) || null
        }
        if (b.starTurnAfter != null && b.starTurned && !b.starNoTurn) {
          s7RetargetStarBullet(b);
          if (b.starHold) continue
        }
        if (b.homing && (b.kind === "cattail" || b.kind === "cattailSmall")) {
          const currentValid = !!(b.target && !b.target.dead && !b.target.dying && !b.target.friendly);
          const preferred = b.kind === "cattailSmall" ? s7LaneTarget(b.row, {
            canHitAir:true, source:b.from, sourceKey:"cattail", preferFlyingBalloon:true
          }) : s7CattailGlobalTarget(b.from);
          // 只把仍在空中的气球视为优先目标。原目标落地后，若场上还有空中气球，立即改锁；
          // 若已无空中气球，则允许继续追踪原来的普通地面目标。
          if (preferred && (!currentValid || isBalloonAir(preferred) && !isBalloonAir(b.target))) {
            b.target = preferred;
            b.targetId = preferred.id
          }
        }
        if (b.target && !b.target.dead && !b.target.friendly) {
          const tx = b.target.x,
            ty = b.target.row + .5;
          const vx = tx - b.x,
            vy = ty - b.y,
            len = Math.hypot(vx, vy) || 1;
          const homingSpeed = Math.max(.001, finiteNumber(b.homingSpeed, 5.5));
          b.dx = vx / len * homingSpeed;
          b.dy = vy / len * homingSpeed
        }
        if (b.arc && b.arcEndX != null) {
          b.arcT = Math.min(1, b.arcT + dt / (b.arcTime || 1));
          b.x = b.arcStartX + (b.arcEndX - b.arcStartX) * b.arcT;
          b.y = b.arcStartY + (b.arcEndY - b.arcStartY) * b.arcT - (b.arcHeight ?? 1.2) * Math.sin(Math.PI * b.arcT)
        } else {
          b.x += b.dx * dt * b.dir;
          b.y += b.dy * dt
        }
        if (b.starTurnAfter != null && !b.starTurned) {
          b.starTravel = (b.starTravel || 0) + Math.hypot(b.x - oldX, b.y - oldY);
          if (b.starTravel >= b.starTurnAfter) {
            b.starTurned = true;
            const t = s7StarTarget(b.row);
            if (t) {
              if (s7StarBulletTargetValid(b, t)) s7LockStarOntoTarget(b, t);
              else {
                s7HoldStarAtCurrentPoint(b, t);
                addEffect(b.row, b.x, "星星待机", "#fde047", .35);
                continue
              }
            } else if (s7StarRowHasMageEffect(b.row)) {
              s7SetStarMagicDrift(b);
              addEffect(b.row, b.x, "魔法星漂移", "#c084fc", .35)
            } else {
              s7SetStarFreeFlight(b)
            }
          }
        }
        if (b.waveAmp != null) {
          b.y = (b.originY ?? b.y) + (b.waveAmp || 0) * Math.sin((b.x - (b.originX ?? b.x)) * (b.waveFreq || 1))
        }
        b.renderDx=b.x-oldX;
        b.renderDy=b.y-oldY;
        if (b.torchable) applyTorch(b, oldX, b.x);
        if (b.umbrellaRebound && Math.abs(b.x - finiteNumber(b.umbrellaReboundStartX, b.x)) >= finiteNumber(b.umbrellaReboundDistance, 2.5)) {
          b.dead = true;
          continue
        }
        let hit = null;
        if (!b.zombieBullet) {
          const bRowFilter = b.strictRow || !b.homing && !b.arc && b.starTurnAfter == null;
          if (b.cactusGold) {
            const crossed = state.zombies.filter(z => {
              if (z.dead || z.friendly || !isDamageableZombie(z)) return false;
              if (z.row !== b.row || !canHitZombie(b, z)) return false;
              if (b._hitIds && b._hitIds.has(z.id)) return false;
              return projectileSweepTouchesZombie(b, z, oldX, oldY, b.x, b.y)
            }).sort((a, c) => b.dx * b.dir >= 0 ? a.x - c.x : c.x - a.x);
            for (const z of crossed) impactBullet(b, z)
          } else {
            for (const z of state.zombies) {
              if (z.dead || z.friendly || !isDamageableZombie(z)) continue;
              if (b.strictRow && z.row !== b.row) continue;
              if (b.hitRowMin != null && z.row < b.hitRowMin) continue;
              if (b.hitRowMax != null && z.row > b.hitRowMax) continue;
              if (bRowFilter && !b.fullscreenHit && Math.abs(z.row - b.row) > (b.rowSpan || 0)) continue;
              if (b.starTurnAfter != null && b.starTurned && !b.starNoTurn && b.starTargetId && z.id !== b.starTargetId) continue;
              if (!canHitZombie(b, z)) continue;
              if (b._hitIds && b._hitIds.has(z.id)) continue;
              if (projectileCanTouchZombieForHit(b, z, oldX, oldY, b.x, b.y)) {
                hit = z;
                break
              }
            }
            if (hit) {
              impactBullet(b, hit);
              if (b.blackFirePersist) {
                b.dead = false;
                b.life = Math.max(finiteNumber(b.life, 0), 8)
              } else if (b.oneHitOnly) {
                if (!b._hitIds) b._hitIds = new Set;
                b._hitIds.add(hit.id);
                b.pierce = 0;
                b.dead = true
              } else if ((b.pierce || 0) <= 0) b.dead = true
            }
          }
        }
        if (!b.dead && b.kind === "firelotus" && b.arc && b.arcT >= 1) {
          b.dead = true;
          continue
        }
        if (!b.dead && s7HandleCabbageGroundBounce(b)) continue;
        if (!b.dead && b.zombieBullet) {
          if (b.catapultBasketball) {
            if (b.arc && b.arcT < 1) continue;
            resolveCatapultBasketballImpact(b);
            continue
          }
          const umbRebound = state.plants.find(u => !u.dead && u.key === "umbrella" && (u.s7?.level || 0) >= 3 && u
            .row === b.row && Math.abs(u.col + .5 - b.x) <= 1.5 && isPeaLikeBullet(b));
          if (umbRebound) {
            b.dir = 1;
            b.dx = Math.abs(b.dx);
            b.zombieBullet = false;
            b.from = umbRebound;
            b.umbrellaRebound = true;
            b.umbrellaReboundStartX = b.x;
            b.umbrellaReboundDistance = 2.5;
            b.life = Math.max(finiteNumber(b.life, 0), 2.5 / Math.max(.001, Math.abs(finiteNumber(b.dx, 5))));
            addEffect(b.row, b.x, "保护伞反弹2.5格", "#bae6fd")
          } else {
            const plantHit = state.plants.find(p => zombieProjectileCanHitPlant(p, b) && p.row === b.row && Math.abs(
              plantProjectileX(p) - b.x) < .4);
            if (plantHit) {
              if (s7SmallUmbrellaBlocksPea(plantHit, b)) {
                b.dead = true;
                continue
              }
              impactBulletOnPlant(b, plantHit);
              b.dead = true
            }
          }
        }
        const starUsesLaunchMargin = b.starTurnAfter != null;
        if (starUsesLaunchMargin ? b.x < -2 || b.x > COLS + 3 || b.y < -2 || b.y > ROWS + 2 : b.x < -1 || b.x > COLS +
          2 || b.y < -1 || b.y > ROWS + 1) b.dead = true
      }
      state.bullets = state.bullets.filter(b => !b.dead)
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / impactBulletOnPlant

    // [原源码行 5468] 这是已经发射后停驻在场上的星星，不是“无敌人时预先存弹”。

    // [原源码行 5469] 它保持原位置，完全忽略魅惑僵尸；出现新的敌方目标后再继续追踪。

    // [原源码行 5495] 先按原方向飞出0.5秒，随后转向敌方目标；若敌方目标已不存在则停在场上。

    // [原源码行 5598] 火红莲弹只在本次抛物线落地帧进行一次碰撞判定。

    // [原源码行 5599] 若落点当帧没有命中目标，立即消失，禁止在地面残留约0.7秒后

    // [原源码行 5600] 被后来走入的僵尸再次触发范围伤害。

    // [原源码行 5607] 篮球只在锁定落点结算，飞行途中不再被其他植物或碰撞判定提前吃掉。

    // 小伞只完整承受第一枚豌豆并消失；非豌豆僵尸子弹不受小伞影响。

    // [原源码行 5653] 杨桃五向星在转向前可能短暂飞出普通棋盘边缘（尤其是最左列的“后”星、

    // [原源码行 5654] 第一/第五行的“上/下”星）。必须给它们完整的转向空间，否则会在锁定本行

    // [原源码行 5655] 目标前被通用越界清理误删，表现为五颗中有一颗直接飞走。

    // -----------------------------------------------------------------------------

    function impactBulletOnPlant(b, p) {
      const src = b.from;
      if (src) src._isBullet = true;
      damagePlant(p, b.damage, src);
      if (src) src._isBullet = false;
      if (b.slow && !p.dead) {
        if (s7PlantHasPlanternSlowImmunity(p)) {
          p.slow = 0;
          addEffect(p.row, p.col + .5, "减速免疫", "#fde68a", .35)
        } else {
          p.slow = Math.max(p.slow || 0, b.slow);
          addEffect(p.row, p.col + .5, "减速" + b.slow + "s", "#93c5fd")
        }
      }
      if (b.stun && !p.dead) p.stun = Math.max(p.stun || 0, b.stun);
      if (b.freeze && !p.dead) p.freeze = Math.max(p.freeze || 0, b.freeze);
      addEffect(p.row, plantProjectileX(p), "中弹", "#fca5a5")
    }
    const ZOMBIE_HIT_DIAMETER = .5;
    const ZOMBIE_HIT_RADIUS = ZOMBIE_HIT_DIAMETER / 2;

    // 巨人类（白眼/红眼）与车类（冰车/雪橇车/投篮车）贴图远大于普通僵尸，受击判定半径翻倍
    function zombieHitRadius(z) {
      return z && (z.flags?.garg || z.vehicle) ? ZOMBIE_HIT_RADIUS * 2 : ZOMBIE_HIT_RADIUS
    }

    // 窝瓜的攻击区域本体严格为落点左右各 0.5 格。
    // 僵尸使用半径 0.25 格的统一受击圆，因此区域相交时，
    // 僵尸中心距离落点不超过 0.5 + 0.25 = 0.75 格才会命中。
    const SQUASH_AOE_HALF_WIDTH = .5;

    function isPeaLikeBullet(b) {
      return ["pea", "ice", "icefire", "iceflame", "fire", "miniPea", "rebound", "spore"].includes(b?.kind || "pea") ||
        !!b.blackFire || !!b.fireLayers || !!b.coldLayers || !!b.poisonLayers
    }

    function projectileTouchesZombieSprite(b, z) {
      const r = zombieHitRadius(z) + (b?.hitRadiusBonus || 0);
      const dx = finiteNumber(b?.x, -999) - finiteNumber(z?.x, 999);
      const dy = finiteNumber(b?.y, -999) - (finiteNumber(z?.row, 999) + .5);
      return dx * dx + dy * dy <= (r + 1e-9) * (r + 1e-9)
    }

    function projectileSweepTouchesZombie(b, z, oldX, oldY, newX, newY) {
      const zx = finiteNumber(z?.x, 999);
      const zy = finiteNumber(z?.row, 999) + .5;
      const vx = finiteNumber(newX, oldX) - finiteNumber(oldX, 0);
      const vy = finiteNumber(newY, oldY) - finiteNumber(oldY, 0);
      const len2 = vx * vx + vy * vy;
      if (len2 <= 1e-12) return projectileTouchesZombieSprite(b, z);
      const t = clamp(((zx - oldX) * vx + (zy - oldY) * vy) / len2, 0, 1);
      const px = oldX + vx * t;
      const py = oldY + vy * t;
      const r = zombieHitRadius(z) + (b?.hitRadiusBonus || 0) + 1e-9;
      const dx = zx - px;
      const dy = zy - py;
      return dx * dx + dy * dy <= r * r
    }

    function projectileCanTouchZombieForHit(b, z, oldX, oldY, newX, newY) {
      const r = zombieHitRadius(z) + (b?.hitRadiusBonus || 0);
      if (b?.fullscreenHit) {
        const zx = finiteNumber(z?.x, 999);
        const x1 = finiteNumber(oldX, finiteNumber(b?.x, 0));
        const x2 = finiteNumber(newX, finiteNumber(b?.x, 0));
        if (Math.abs(x2 - x1) <= 1e-12) return Math.abs(zx - finiteNumber(b?.x, x2)) <= r + 1e-9;
        return zx >= Math.min(x1, x2) - r - 1e-9 && zx <= Math.max(x1, x2) + r + 1e-9
      }
      return projectileTouchesZombieSprite(b, z)
    }

    function s7SquashAoeTouchesZombie(z, centerX) {
      return !!z && Math.abs(finiteNumber(z.x, 999) - finiteNumber(centerX, -999)) <= SQUASH_AOE_HALF_WIDTH +
        zombieHitRadius(z) + 1e-9
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / canHitZombie

    // [原源码行 5704] 所有僵尸统一使用以实体中心为圆心、0.25格为半径的受击圆。

    // [原源码行 5705] 不再因巨人、车辆、盲盒或emoji贴图大小扩张成接近一整格的矩形。

    // -----------------------------------------------------------------------------

    function canHitZombie(b, z) {
      return canBulletHitZombie(b, z)
    }

    function canBulletHitZombie(b, z) {
      if (!z || z.dead || z.dying || z.friendly || !isDamageableZombie(z)) return false;
      // 扎气球模式的仙人掌尖刺只承认当前仍在空中的气球实体。
      // 气球被扎破或自然落地后立即失去资格，不能被这枚空中专用尖刺补刀。
      if (b.onlyFlyingBalloon && !isBalloonAir(z)) return false;
      if (b.groundOnly && isBalloonAir(z)) return false;
      if (b.cactusGold && (isS7FlyingZombie(z) || isUnderground(z))) return false;
      if (b.ignoreZombieId && z.id === b.ignoreZombieId) return false;
      if (isUnderground(z)) return bulletCanAffectUndergroundDigger(b);
      if (isBalloonAir(z)) return bulletCanAffectFlyingBalloon(b);
      if (z.air && !b.airOk && !b.ash) return false;
      if (isDiving(z)) return !!b.ash || !!b.throw;
      if (isVaulting(z) && z.type !== "dolphin") return false;
      if (z.landingInvuln > 0 && !b.sniperBullet) return false;
      return true
    }

    function isTorchablePeaBullet(b) {
      if (!b || b.torchable === false || b.kind === "spore") return false;
      return ["pea", "ice", "icefire", "iceflame", "fire", "miniPea"].includes(b.kind || "pea") || !!b
        .blackFire || !!b.fireLayers || !!b.coldLayers || (!!b.poisonLayers && b.kind !== "spore")
    }

    function torchwoodBonusFireLayers(level) {
      return level >= 5 ? 20 : level >= 4 ? 15 : level >= 3 ? 10 : 0
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7PeaFireStage

    // [原源码行 5749] 火炬飞升：3阶起给过火子弹额外附燃焰；4阶15层，5阶20层。

    // -----------------------------------------------------------------------------

    function s7PeaFireStage(b) {
      if (!b) return 0;
      if (b.blackFire) return 4;
      if (b.kind !== "fire") return 0;
      if ((b.damage || 0) >= 100) return (b.fireLayers || 0) >= 20 ? 4 : 3;
      if ((b.damage || 0) >= 70) return 2;
      return 1
    }

    function applyTorch(b, oldX, newX) {
      if (!isTorchablePeaBullet(b)) return;
      for (const p of state.plants) {
        if (p.dead || p.key !== "torchwood") continue;
        const tx = p.col + .5;
        const matchRow = b.waveAmp != null ? Math.abs(p.row + .5 - (b.originY ?? b.y)) < .35 : Math.abs(p.row + .5 - b
          .y) < .35;
        if (!matchRow || !(oldX < tx && newX >= tx || oldX > tx && newX <= tx)) continue;
        const lv = clamp(p.s7?.level || 0, 0, 5);
        const bonus = torchwoodBonusFireLayers(lv);
        if (b.sniperBullet) {
          b.torchLevel = Math.min(2, (b.torchLevel || 0) + 1);
          addEffect(p.row, tx, b.torchLevel >= 2 ? "狙击过双火炬" : "狙击过火炬", "#fb923c");
          continue
        }
        const iceStage = Math.max(finiteNumber(b.iceFireStage, 0), b.kind === "iceflame" ? 2 : b.kind === "icefire" ?
          1 : 0);
        if (iceStage >= 2 || b.kind === "iceflame") {
          b.kind = "iceflame";
          b.damage = 40;
          b.coldLayers = 8;
          b.fireLayers = 0;
          b.fireAttribute = false;
          b.iceFireStage = 2;
          addEffect(p.row, tx, "冰炎保持·燃0", "#a5f3fc");
          continue
        }
        if (iceStage === 1 || b.kind === "icefire") {
          // 冰火豆经过火炬加热为冰炎（40伤），附加3层寒意（全等级生效）。
          b.kind = "iceflame";
          b.damage = 40;
          b.coldLayers = 2;
          b.fireLayers = 0;
          b.fireAttribute = false;
          b.iceFireStage = 2;
          addEffect(p.row, tx, "冰火→冰炎40·寒3·燃0", "#a5f3fc")
          continue
        }
        if (b.kind === "ice" || b.coldLayers > 0 && iceStage === 0) {
          if (lv >= 3) {
            b.kind = "icefire";
            b.damage = 30;
            b.coldLayers = 5;
            b.fireLayers = 0;
            b.fireAttribute = false;
            b.iceFireStage = 1;
            addEffect(p.row, tx, "冰豆→冰火30·寒5·燃0", "#67e8f9")
          } else {
            b.kind = "pea";
            b.damage = 20;
            b.coldLayers = 0;
            b.fireLayers = 0;
            b.fireAttribute = false;
            b.iceFireStage = 0;
            addEffect(p.row, tx, "冰豆→普通豌豆", "#a5f3fc")
          }
          continue
        }
        const carriedFire = Math.max(0, finiteNumber(b.fireLayers, 0));
        const currentStage = Math.max(finiteNumber(b.torchStage, 0), s7PeaFireStage(b));
        const stage = Math.min(4, currentStage + 1);
        b.torchStage = stage;
        b.torchLevel = (b.torchLevel || 0) + 1;
        const stageDamage = [20, 40, 70, 100, 100][stage];
        if (b.smallBurst) b.damage = 10 * stage;
        else if (b.splitMini) b.damage = 5 + 5 * stage;
        else b.damage = stageDamage;
        b.kind = "fire";
        b.fireAttribute = true;
        b.fireLayers = carriedFire + bonus;
        b.blackFire = stage >= 4;
        addEffect(p.row, tx, (["过火", "火豆", "橙炎", "红炎", "黑炎"][stage] || "过火") + `·燃${Math.round(b.fireLayers)}`,
          "#fb923c")
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / applyWinterColdOnHit

    // [原源码行 5778] 狙击豌豆只记录经过的火炬数量，用于命中点120/240额外AOE。

    // [原源码行 5795] 冰炎是最终形态：继续经过任何火炬都保持40伤害、8层寒意、0层燃焰。

    // [原源码行 5807] 原生冰火豆只有经过3阶及以上火炬时才变为冰炎；低阶火炬不改变它。

    // [原源码行 5826] 普通冰豆：0~2阶火炬只化为普通豌豆；3阶及以上直接化为冰火。

    // [原源码行 5848] 普通/火系豌豆按 豌豆→火豆→橙炎→红炎→黑炎 逐级强化。

    // [原源码行 5849] 0~2阶火炬不凭空附加燃焰；只保留子弹原本携带的燃焰。

    // -----------------------------------------------------------------------------

    function applyWinterColdOnHit(z, b) {
      if (!z || z.dead || !b || !(b.winterColdLayers > 0)) return false;
      const hasNoCold = (s7Elem(z).cold || 0) <= 0;
      const chance = hasNoCold ? 1 : clamp(b.winterColdChance ?? 1, 0, 1);
      if (s7BattleRandom() < chance) {
        s7ApplyElement(z, "cold", b.winterColdLayers, b.from);
        return true
      }
      return false
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7ResolveFireProjectileSplash

    // [原源码行 5879] 图片规则：目标当前没有寒意时，本次必定叠加；已有寒意时才按阶数概率判定。

    // -----------------------------------------------------------------------------

    function s7ResolveFireProjectileSplash(b, z, targetFireBefore) {
      const bulletFire = Math.max(0, finiteNumber(b?.fireLayers, 0));
      if (!z || bulletFire <= 0) return 0;
      const root = Math.sqrt(bulletFire);
      const strength = 2 * root - 1 + Math.max(0, targetFireBefore || 0) * root / 10;
      const radiusPx = 5 + 95 / (1 + Math.exp(-.1 * (strength - 39)));
      const radius = radiusPx / 80;
      let affected = 0;
      for (const q of state.zombies) {
        if (q.dead || q.friendly || q.row !== z.row) continue;
        if (q.landingInvuln > 0 && !b.sniperBullet) continue;
        if (!canAffectZombieState(q, {
            source: b.from,
            element: true
          })) continue;
        const distance = Math.abs(q.x - z.x);
        if (distance > radius) continue;
        const effect = strength * Math.max(0, radius - distance) / Math.max(1e-4, radius);
        if (effect <= 0) continue;
        damageZombie(q, effect * .25, {
          source: b.from,
          ignore2: b.ignore2,
          element: true
        });
        if (!q.dead) s7ApplyElement(q, "fire", effect * .05, b.from);
        affected++
      }
      if (affected) addEffect(z.row, z.x, `燃焰溅射${strength.toFixed(1)}`, "#fb923c", .35);
      return affected
    }

    function s7SpawnSplitMiniPeas(b, z) {
      if (!b || !z) return 0;
      // 散弹一线展开总跨度80px（1格）：5颗均匀分布在±0.5格。
      const offsets = [-.5, -.25, 0, .25, .5];
      for (let i = 0; i < 5; i++) {
        const nb = addBullet({
          x: z.x - .2,
          y: z.row + .5 + offsets[i],
          row: z.row,
          dx: 5,
          damage: 5,
          kind: "miniPea",
          from: b.from,
          torchable: true,
          pierce: b.smallPierce || 0,
          splitMini: true,
          life: .2,
          delay: i * .02
        });
        if (nb && b.smallPierce) s7RememberBulletHit(nb, z)
      }
      addEffect(z.row, z.x, "爆裂小豌豆×5", "#bbf7d0");
      return 5
    }

    function s7RememberBulletHit(b, z) {
      if (!b || !z || z.id == null) return false;
      if (!b._hitIds) b._hitIds = new Set;
      b._hitIds.add(z.id);
      return true
    }

    function s7IsPiercingSplitMiniPea(b) {
      return !!(b && b.splitMini && ((b.pierce || 0) > 0 || b.pierceAll || b.smallPierce))
    }

    function s7ConsumePierceHit(b) {
      if (!b || !(b.pierce > 0)) return false;
      b.pierce--;
      b.dead = false;
      return true
    }

    function s7BlackFireExecuteEligible(b, z) {
      if (!b?.blackFire || !z || z.dead) return false;
      const maxTotal = Math.max(0, finiteNumber(z.maxHp, 0)) + finiteArray(z.armors).reduce((sum, a) => sum + Math.max(0,
        finiteNumber(a?.max, 0)), 0);
      return maxTotal > 0 && totalHp(z) < maxTotal * .15
    }

    function s7PreserveBlackFireAfterExecute(b, z) {
      if (!b) return false;
      b.blackFirePersist = true;
      b.life = Math.max(finiteNumber(b.life, 0), 8);
      b.delay = 0;
      b.pierce = Number.POSITIVE_INFINITY;
      b.pierceAll = true;
      b.dx = Math.abs(finiteNumber(b.dx, 5));
      b.dir = 1;
      b.bounce = false;
      b.dead = false;
      if (!b._hitIds) b._hitIds = new Set;
      if (z?.id != null) b._hitIds.add(z.id);
      if (z) addEffect(z.row, z.x, "黑炎斩杀·子弹保留", "#f97316", .45);
      return true
    }

    function impactBullet(b, z) {
      if (s7IsPiercingSplitMiniPea(b)) s7RememberBulletHit(b, z);
      if (b.kernelCob) {
        explode(z.row, z.x, 1.5, ASH, {ash:true,source:b.from});
        addEffect(z.row, z.x, "玉米炮", "#facc15");
        return
      }
      if (b.kernelBigButter) {
        const targets = s7KernelCellTargets(z, !!b.kernelCellAll);
        for (const q of targets) {
          const didButterHit = s7DirectHit(q, 80, b.from, {ignore2:true});
          if (didButterHit && !isAbnormalImmuneZombie(q)) q.stun = Math.max(q.stun || 0, b.kernelCellAll ? 5 : 4)
        }
        addEffect(z.row, z.x, b.kernelCellAll ? "大黄油80全格" : "大黄油80·直击+同格2", "#facc15");
        return
      }
      if (b.explodenutBowling) {
        s7ExplodenutBowlingImpact(z.row, z.x, b.from);
        return
      }
      if (b.goldenMelon) {
        // v0.4：金瓜继承普通西瓜80基础伤害，并改为命中点左右2格无衰减AOE。
        const goldenDmg = 80 + (b.splashBonus || 0);
        let n = 0;
        for (const q of state.zombies)
          if (q !== z && !q.dead && !q.friendly && q.row === z.row && Math.abs(q.x - z.x) <= 2 && !(q.landingInvuln >
            0) && isDamageableZombie(q)) {
            if (damageZombie(q, goldenDmg, {
                source: b.from,
                ignore2: b.ignore2
              })) n++
          }
        const zHit = damageZombie(z, goldenDmg, {
          source: b.from,
          ignore2: b.ignore2
        }) ? 1 : 0;
        addEffect(z.row, z.x, `金瓜2格AOE×${n + zHit}`, "#fbbf24", .45);
        return
      }
      if (b.giftBox) {
        const cell = Math.floor(z.x);
        const qArr = state.zombies;
        const qLen = qArr.length;
        for (let qi = 0; qi < qLen; qi++) {
          const q = qArr[qi];
          if (!q.dead && q.row === z.row && Math.floor(q.x) === cell) killZombie(q, {
            source: b.from,
            noCritical: true,
            noTransform: true
          })
        }
        addEffect(z.row, cell + .5, "空礼盒清格", "#f0abfc", .6);
        return
      }
      if (b.cactusGold) {
        s7MoveZombieByKnockback(z, Math.max(z.x, DAMAGE_BOUNDARY_X), {
          maxX: COLS + .3,
          reason: "金刺击退"
        });
        z.attackCd = Math.max(finiteNumber(z.attackCd, 0), .2);
        if (!b._hitIds) b._hitIds = new Set;
        b._hitIds.add(z.id);
        b.dead = false;
        addEffect(z.row, z.x, "金刺击退", "#fef08a", .4);
        return
      }
      if (b.firelotusAoe > 0) {
        const targetFireBefore = Math.max(0, s7Elem(z).fire || 0);
        const targets = state.zombies.filter(q => !q.dead && !q.dying && !q.friendly && q.row === z.row &&
          isDamageableZombie(q) && !graveVeilsTarget(q) && canAffectZombieState(q, {
            source: b.from,
            element: true
          }) && Math.abs(q.x - z.x) <= b.firelotusAoe && !(q.landingInvuln > 0));
        for (const q of targets) s7ApplyElement(q, "fire", b.fireLayers || 0, b.from, {
          fireAttribute: true
        });
        for (const q of targets)
          if (!q.dead) damageZombie(q, b.damage, {
            source: b.from,
            ignore2: b.ignore2
          });
        s7ResolveFireProjectileSplash(b, z, targetFireBefore);
        addEffect(z.row, z.x, "红莲：先燃焰后群伤", "#fb923c", .4);
        return
      }
      // 装甲车12点格挡已经统一进入 damageZombie 的最终伤害链；小刺不再走命中特判。
      if (b.smallBurst && !(b.damage > 0)) {
        s7SpawnSplitMiniPeas(b, z);
        return
      }
      const targetFireBefore = Math.max(0, s7Elem(z).fire || 0);
      const blackFireExecuteEligible = s7BlackFireExecuteEligible(b, z);
      const before = totalHp(z);
      const didPrimaryDamage = damageZombie(z, b.damage, {
        ignore2: b.ignore2,
        pierceAll: !!b.iceLance || !!b.pierceAll,
        source: b.from,
        hitMeta: {
          cattailSmall: !!b.cattailSmall
        },
        incomingSlow: b.slow || 0,
        incomingStun: b.stun || 0,
        incomingFreeze: b.freeze || b.freezeOnHit || 0
      });
      if (!didPrimaryDamage) {
        if (s7IsPiercingSplitMiniPea(b)) s7ConsumePierceHit(b);
        return
      }
      if (b.freezeOnHit > 0 && !z.dead && !isAbnormalImmuneZombie(z)) z.freeze = Math.max(z.freeze || 0, b.freezeOnHit);
      if (!z.dead) {
        if (isAbnormalImmuneZombie(z)) {} else {
          if (b.slow) z.slow = Math.max(z.slow, b.slow);
          if (b.stun) z.stun = Math.max(z.stun, b.stun);
          if (b.freeze) z.freeze = Math.max(z.freeze, b.freeze);
          const effectiveKnockback = b.kind === "soulSpore" && b.fumeLevelAtFire !== 5 ? 0 : Math.max(0, b.knockback ||
            0);
          if (effectiveKnockback > 0) s7ApplyZombieKnockback(z, effectiveKnockback, {
            maxX: COLS - .5,
            reason: b.kind === "soulSpore" ? "灵魂孢子击退" : "子弹击退"
          })
        }
      }
      if (b.aoe > 0) {
        if (b.kind === "winter") s7IceStarHypnoSplashHeal(z.row, z.x, b.aoe, b.from);
        const splashTargets = state.zombies.filter(q => q !== z && !q.dead && !q.friendly && q.row === z.row && Math
          .abs(q.x - z.x) <= b.aoe && !(q.landingInvuln > 0 && !b.sniperBullet) && !graveVeilsTarget(q));
        const n = splashTargets.length;
        if (n > 0) {
          if (b.fullAoeDamage) {
            for (const q of splashTargets) {
              damageZombie(q, b.damage, {
                ignore2: b.ignore2,
                source: b.from,
                balloonAirBypass: !!b.melonCannon
              })
            }
          } else if (b.winterFullAoe) {
            for (const q of splashTargets) {
              const didSplash = damageZombie(q, b.damage, {
                ignore2: b.ignore2,
                source: b.from
              });
              if (didSplash) applyWinterColdOnHit(q, b)
            }
          } else {
            const splashDmg = Math.max(5, Math.round(26 - (n - 1) * 21 / 51)) + (b.splashBonus || 0);
            for (const q of splashTargets) {
              const didSplash = damageZombie(q, splashDmg, {
                ignore2: b.ignore2,
                source: b.from
              });
              if (didSplash) {
                if (b.slow && !isAbnormalImmuneZombie(q)) q.slow = Math.max(q.slow, b.slow);
                applyWinterColdOnHit(q, b)
              }
            }
          }
        }
      }
      if (b.sniperBullet && (b.torchLevel || 0) >= 1) {
        const aoeDmg = b.torchLevel >= 2 ? 240 : 120;
        const aoeTargets = state.zombies.filter(q => !q.dead && !q.friendly && q.row === z.row && Math.abs(q.x - z.x) <=
          .625);
        for (const q of aoeTargets) damageZombie(q, aoeDmg, {
          source: b.from
        });
        addEffect(z.row, z.x, b.torchLevel >= 2 ? "狙击过炎240" : "狙击过火120", "#fb923c", .4)
      }
      if (b.smallBurst) s7SpawnSplitMiniPeas(b, z)
      if (b.pultBounceLeft > 0) {
        if (s7IsCabbageBounceBullet(b)) {
          s7LaunchCabbageBounce(b, z.x, z.row + .5, z.id, "hit")
        } else {
          const next = state.zombies.filter(q => q !== z && !q.dead && !q.friendly && q.row === z.row &&
            isDamageableZombie(q) && !graveVeilsTarget(q) && q.x > z.x + .12).sort((a, b) => a.x - b.x)[0];
          if (next) addPultBullet(b.from, next, b.damage, {
            kind: b.kind || "pult",
            startX: z.x,
            startY: z.row + .5,
            pultBounceLeft: b.pultBounceLeft - 1,
            fire: b.fireLayers || 0,
            cold: b.coldLayers || 0,
            poison: b.poisonLayers || 0,
            lumen: b.lumenLayers || 0,
            dark: b.darkLayers || 0
          })
        }
      }
      if (z.dead) {
        if ((b.fireLayers || b.fireAttribute) && !(b.kind === "icefire" || b.kind === "iceflame" || (b.iceFireStage || 0) > 0)) s7ResolveFireProjectileSplash(b, z, targetFireBefore);
        if (blackFireExecuteEligible) s7PreserveBlackFireAfterExecute(b, z);
        return
      }
      applyWinterColdOnHit(z, b);
      const torchIceFire = b.kind === "icefire" || b.kind === "iceflame" || (b.iceFireStage || 0) > 0;
      if (torchIceFire && !z.dead) {
        // 冰火豆/冰炎豆只叠加寒意，不触发火融寒意，也不携带燃焰溅射。
        if (b.coldLayers) s7ApplyElement(z, "cold", b.coldLayers, b.from)
      } else if (b.coldLayers) {
        s7ApplyElement(z, "cold", b.coldLayers, b.from)
      }
      if (b.winterImpactLabel) addEffect(z.row, z.x, b.winterImpactLabel, "#bfdbfe", .45);
      if ((b.fireLayers || b.fireAttribute) && !torchIceFire) {
        if (!z.dead) s7ApplyElement(z, "fire", Math.max(0, b.fireLayers || 0), b.from, {
          fireAttribute: !!b.fireAttribute
        });
        s7ResolveFireProjectileSplash(b, z, targetFireBefore);
        if (blackFireExecuteEligible) {
          if (!z.dead) killZombie(z, {
            source: b.from,
            noCritical: true,
            noTransform: true
          });
          // 目标也可能先被“燃焰融寒”或燃焰溅射杀死；只要本次命中满足黑炎斩杀阈值，子弹都必须保留。
          if (z.dead) s7PreserveBlackFireAfterExecute(b, z)
        }
      }
      if (torchIceFire) {
        b.fireLayers = 0
      }
      if (b.poisonLayers) {
        z.lastPoisonSource = b.from;
        s7ApplyElement(z, "poison", b.poisonLayers, b.from)
      }
      if (b.lumenLayers) s7ApplyElement(z, "lumen", b.lumenLayers, b.from);
      if (b.darkLayers) s7ApplyElement(z, "dark", b.darkLayers, b.from);
      if (b.darkPierceScale > 0 && !z.dead) {
        const darkNow = Math.max(0, s7Elem(z).dark || 0);
        if (darkNow > 0) damageZombie(z, b.darkPierceScale * darkNow, {
          source: b.from,
          ignore2: true,
          pierceAll: true,
          element: true
        })
      }
      if (b.vulnAdd > 0) {
        const cap = b.vulnCap || 1;
        let nextVuln = Math.min(cap, (z.s7Vuln || 0) + b.vulnAdd);
        if (b.cactusSpear) {
          b.cactusHitCount = (b.cactusHitCount || 0) + 1;
          if (b.cactusHitCount <= 2) {
            b.cactusVulnCarry = (b.cactusVulnCarry || 0) + nextVuln
          } else if (b.cactusHitCount === 3) {
            nextVuln = Math.min(cap, nextVuln + (b.cactusVulnCarry || 0))
          }
        }
        z.s7Vuln = nextVuln
      }
      if (b.iceLance && b.iceLanceExpires) b.iceLanceTimer = .2;
      if (b.bigStar) {
        if (b.from?.key === "starfruit") s7GrantShineToIceStarHypno(b.from.row, 7.5, "大星照耀");
        const bigStarColdLayers = Math.max(0, finiteNumber(b.bigStarColdLayers, 10));
        for (const q of state.zombies)
          if (q !== z && !q.dead && !q.friendly && q.row === z.row && Math.abs(q.x - z.x) <= .5) s7DirectHit(q, b.bigStarSplash ||
            30, b.from, {
              cold: bigStarColdLayers
            })
      }
      if ((b.pierce || 0) > 0) {
        s7ConsumePierceHit(b);
        s7RememberBulletHit(b, z)
      }
      if (totalHp(z) < before && b.from) z.lastHitPlant = b.from
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / isSpikePunctureVehicle

    // [原源码行 5915] 金瓜：真实抛物线命中后秒杀，并继续跳向本行尚未命中的最近目标。

    // [原源码行 5916] “无限弹跳”表示不设置弹跳次数上限；同一个目标只命中一次，场上无新目标时结束。

    // [原源码行 5963] 金刺只击退命中的敌人，不造成伤害或易伤。

    // [原源码行 6005] 黑橄榄与变种橄榄球免疫通常控制效果；三叶草凛风对黑橄榄的0.2格直接位移是明确例外。

    // [原源码行 6032] 西瓜大炮等“标明完整 AOE 伤害”的投射物：范围内每个目标均承受完整标称伤害。

    // [原源码行 6040] 凝华/极寒冰瓜：图片明确标注为对应数值的 AOE，范围内目标承受完整伤害与完整寒意。

    // [原源码行 6049] 普通冰瓜/西瓜保持原版西瓜溅射伤害口径。

    // [原源码行 6135] 燃焰溅射由“火属性子弹命中”触发；直接伤害击杀中心目标也不能吞掉本次溅射。

    // [原源码行 6147] 先用火属性清除目标原有寒意，再叠加冰火/冰炎自身携带的寒意；

    // [原源码行 6148] 这样不会错误清掉本发子弹自己的5/8层寒意。

    // [原源码行 6191] 红色长矛把前两个命中者在本次命中后的易伤层数带给第三个命中者。

    // -----------------------------------------------------------------------------

    function isSpikePunctureVehicle(z) {
      return !!z && !z.dead && (z.type === "zomboni" || z.type === "catapult" || z.type === "bobsledSled")
    }

    function spikerockTouchingVehicle(z) {
      if (!state || !isSpikePunctureVehicle(z)) return null;
      return state.plants.find(p => p && !p.dead && p.key === "spikerock" && p.row === z.row && Math.abs(z.x - (p.col +
        .5)) < .62) || null
    }

    function trySpikerockPunctureVehicle(z) {
      const p = spikerockTouchingVehicle(z);
      if (!p) return false;
      // 变种冰车/雪橇车不被地刺王秒杀，统一改为100伤害+击退50px（0.625格=50px）。
      if ((z.type === "zomboni" || z.type === "bobsledSled") && z.s7?.variant) {
        s7DirectHit(z, 100, p, {
          ignore2: true,
          system: true
        });
        if (!z.dead) s7ApplyZombieKnockback(z, .625, { maxX: COLS + .3, reason: "地刺王击退变种车辆" });
        addEffect(p.row, p.col + .5, "地刺王击退变种车辆·-100", "#f87171", .6);
        return true
      }
      killZombie(z, {
        source: p,
        noCritical: true,
        noTransform: true,
        system: true
      });
      if (!p.dead) damagePlant(p, 250, z);
      addEffect(p.row, p.col + .5, "地刺王秒杀车辆·自身-250", "#f87171", .6);
      return true
    }
    const S7_NEWSPAPER_RAGE_WINDUP = 1.5;

    function s7NewspaperControlledAtBreak(z, opt = {}) {
      if (!z) return false;
      const e = s7Elem(z);
      return (z.slow || 0) > 0 || (z.stun || 0) > 0 || (z.freeze || 0) > 0 || (e.iceBound || 0) > 0 ||
        (opt.incomingSlow || 0) > 0 || (opt.incomingStun || 0) > 0 || (opt.incomingFreeze || 0) > 0 || (opt.incomingIceBound || 0) > 0
    }

    function s7CountNewspaperRageHit(z, opt = {}, dealt = 0, blocked = false) {
      if (!z || z.type !== "newspaper" || !z.s7?.variant || !z.enraged || ! ["paper_break","transition"].includes(z.s7?.newspaperRagePhase)) return false;
      if (!blocked && !(dealt > 0)) return false;
      if (!opt.source && !opt.element && !opt.ash) return false;
      z.s7.rageStacks = Math.min(10, (z.s7.rageStacks || 0) + 1);
      addEffect(z.row, z.x, "怒" + z.s7.rageStacks, "#f87171", .35);
      return true
    }

    function s7NewspaperRageInvincibleActive(z) {
      return !!(z && z.type === "newspaper" && z.enraged && ["paper_break","transition"].includes(z.s7?.newspaperRagePhase) && z.s7?.newspaperRageDefense === "invincible")
    }

    function s7NewspaperRageReduceActive(z) {
      return !!(z && z.type === "newspaper" && z.enraged && ["paper_break","transition"].includes(z.s7?.newspaperRagePhase) && z.s7?.newspaperRageDefense === "reduced")
    }

    function beginNewspaperRage(z, opt = {}) {
      if (!z || z.type !== "newspaper") return;
      z.s7 = z.s7 || {};
      z.enraged = true;
      z.s7.newspaperRagePhase = "paper_break";
      delete z.s7.newspaperRageTimer;
      const controlled = s7NewspaperControlledAtBreak(z, opt);
      z.s7.newspaperRageDefense = s7HasCommand("break", z.row) || !controlled ? "invincible" : "reduced";
      z.s7.newspaperDefenseSyncedByEvent = false;
      if (z.s7?.variant) z.s7.rageStacks = z.s7.rageStacks || 0;
      addEffect(z.row, z.x, z.s7.newspaperRageDefense === "invincible" ? "破报无敌·动画事件解封" : "破报受控·75%减伤", "#fde68a", .8)
    }

    function updateNewspaperRageState(z, dt) {
      if (!z || z.type !== "newspaper" || !z.enraged) return false;
      z.s7 = z.s7 || {};
      const phase = z.s7.newspaperRagePhase || "sprinting";
      // B02B: no independent countdown. EventTrack transitions paper_break -> transition -> sprinting.
      return phase === "paper_break" || phase === "transition"
    }

    function s7NewspaperDetachedParts() {
      if (!state) return [];
      state.s7 = state.s7 || {};
      state.s7.detachedParts = finiteArray(state.s7.detachedParts);
      return state.s7.detachedParts
    }

    function s7SpawnDetachedAsset(z, kind, asset, opt = {}) {
      if (!z || !state || !S7_SPRITES.meta(asset)) return null;
      const part={id:`part_${z.id}_${kind}_${state.frame||0}`,kind,asset,row:z.row,x:z.x,y:finiteNumber(opt.y,-.08),vy:0,groundY:finiteNumber(opt.groundY,.30),ttl:finiteNumber(opt.ttl,2.2),landed:false,pixelScale:finiteNumber(opt.pixelScale,.0062)};
      s7NewspaperDetachedParts().push(part);
      return part
    }

    function s7SpawnNewspaperDetached(z, kind) {
      if (!z || !state) return null;
      const asset = `news.detached.${kind}`;
      return s7SpawnDetachedAsset(z,kind,asset,{pixelScale:.0062})
    }

    function s7NewspaperDropArm(z) {
      if (!z || z.type !== "newspaper") return false;
      z.s7 = z.s7 || {};
      if (z.s7.newsArmVisible === false) return false;
      z.s7.newsArmVisible = false;
      s7SpawnNewspaperDetached(z,"arm");
      return true
    }

    function s7NewspaperDropHead(z) {
      if (!z || z.type !== "newspaper") return false;
      z.s7 = z.s7 || {};
      if (z.s7.newsHeadVisible === false) return false;
      z.s7.newsHeadVisible = false;
      s7SpawnNewspaperDetached(z,"head");
      return true
    }

    function s7UpdateDetachedParts(dt) {
      if (!state?.s7?.detachedParts) return;
      for (const p of state.s7.detachedParts) {
        p.ttl = Math.max(0, finiteNumber(p.ttl,0) - dt);
        if (!p.landed) {
          p.vy = finiteNumber(p.vy,0) + 4.8 * dt;
          p.y = finiteNumber(p.y,-.08) + p.vy * dt;
          // Near-vertical fall, no horizontal launch. Ground matches the body low point.
          if (p.y >= p.groundY) { p.y=p.groundY; p.vy=0; p.landed=true }
        }
      }
      state.s7.detachedParts = state.s7.detachedParts.filter(p=>p && p.ttl>0)
    }

    function s7DrawDetachedParts() {
      if (!state?.s7?.detachedParts) return;
      for (const p of state.s7.detachedParts) {
        if (!renderSafeRow(p.row) || !renderSafeX(p.x)) continue;
        const x=layout.x+finiteNumber(p.x,0)*layout.cell;
        const y=cy(Math.max(0,Math.min(ROWS-1,Math.round(p.row))))+finiteNumber(p.y,0)*layout.cell;
        if (s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE) {
          s7DrawSpriteAsset(ctx,p.asset,x,y,layout.cell,{pixelScale:finiteNumber(p.pixelScale,.0062),pivotX:.5,pivotY:.72,opacity:clamp(p.ttl/.5,0,1)})
        } else {
          ctx.save();
          ctx.globalAlpha = clamp(p.ttl/.5,0,1);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${layout.cell*(p.kind === "head" ? .20 : .14)}px sans-serif`;
          ctx.fillStyle = "#d6d3d1";
          ctx.fillText(p.kind === "head" ? "◉" : "╱", x, y);
          ctx.restore()
        }
      }
    }

    function updatePoleCommanderState(z, dt) {
      if (!z || z.dead || z.type !== "polecmd") return false;
      z.s7 = z.s7 || {};
      const s = z.s7;
      if (s.poleCommandPhase !== "pacing" && s.poleCommandPhase !== "sprinting") {
        s.poleCommandPhase = "pacing";
        s.poleCommandPaceElapsed = 0;
        s.poleCommandRunTime = 0;
        s.poleCommandSpeedTime = 0;
        s.poleCommandNextPaceEffect = 1
      }
      if (s.poleCommandPhase === "pacing") {
        s.poleCommandPaceElapsed = Math.min(POLE_COMMAND_RULE.pacingSeconds, finiteNumber(s.poleCommandPaceElapsed, 0) +
          dt);
        const nextEffect = Math.max(1, finiteNumber(s.poleCommandNextPaceEffect, 1));
        if (s.poleCommandPaceElapsed + 1e-9 >= nextEffect && nextEffect < POLE_COMMAND_RULE.pacingSeconds) {
          const remain = Math.max(0, POLE_COMMAND_RULE.pacingSeconds - nextEffect);
          addEffect(z.row, z.x, `原地踱步·剩${remain}s`, "#fde68a", .55);
          s.poleCommandNextPaceEffect = nextEffect + 1
        }
        if (s.poleCommandPaceElapsed + 1e-9 >= POLE_COMMAND_RULE.pacingSeconds) {
          s.poleCommandPhase = "sprinting";
          s.poleCommandRunTime = 0;
          s.poleCommandSpeedTime = 0;
          addEffect(z.row, z.x, "踱步结束·开始冲刺", "#fb7185", .8)
        }
        return true
      }
      s.poleCommandSpeedTime = Math.max(0, finiteNumber(s.poleCommandRunTime, 0));
      if (!zombieIsHardControlled(z)) {
        const base = Math.max(0, finiteNumber(z.speedNow || z.speed, 0));
        if (base > 0) s.poleCommandRunTime = finiteNumber(s.poleCommandRunTime, 0) + dt
      }
      return false
    }

