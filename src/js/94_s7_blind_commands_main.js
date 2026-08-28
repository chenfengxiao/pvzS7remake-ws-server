"use strict";

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7SpawnInterval

    // [原源码行 13879] S7 RULES: blind boxes, variants, command zombies

    // -----------------------------------------------------------------------------

    function s7SpawnInterval(t) {
      const minute = clamp(Math.floor(Math.max(0, t) / 60) + 1, 1, 40);
      return S7_RULES.spawnIntervalsByMinute[minute - 1]
    }

    const S7_COMMAND_PROB_PEAK_MINUTE = 37.5;
    const S7_COMMAND_PROB_PEAK_VALUE = -16e-5 * S7_COMMAND_PROB_PEAK_MINUTE * S7_COMMAND_PROB_PEAK_MINUTE + .012 * S7_COMMAND_PROB_PEAK_MINUTE;

    function s7CommandProb(t) {
      const minute = Math.max(0, finiteNumber(t, 0) / 60);
      // 37.5分钟后永久锁定22.5%，绝不继续代入二次函数下降。
      if (minute >= S7_COMMAND_PROB_PEAK_MINUTE) return S7_COMMAND_PROB_PEAK_VALUE;
      return clamp(-16e-5 * minute * minute + .012 * minute, 0, S7_COMMAND_PROB_PEAK_VALUE)
    }

    function s7CommandBoxes(t) {
      const minute = Math.floor(Math.max(0, t) / 60) + 1;
      if (minute <= 5) return 0;
      if (minute <= 10) return 1;
      if (minute <= 15) return 2;
      if (minute <= 23) return 3;
      if (minute <= 30) return 4;
      return 5
    }

    const S7_IMMORTAL_RULE = Object.freeze({
      normalSpawnX: 5.5,
      variantSpawnX: 7.5,
      commandForwardShift: 1,
      graveSeconds: 1,
      deathSummonVariantChance: .3,
      deathSummonForwardOffset: .35,
      deathSummonMinX: 2.5,
      summonedNormalFirstBiteWindup: 1
    });

    function s7ConfigureImmortal(z, opt = {}) {
      if (!z || z.type !== "immortal") return z;
      z.s7 = z.s7 || {};
      const variant = !!z.s7.variant;
      const summoned = !!opt.immortalSummoned;
      const bodyEmoji = variant ? "✨🧟" : "🧟";
      z.name = variant ? "亡唤不朽僵尸" : "不朽僵尸";
      z.s7.immortalBodyEmoji = bodyEmoji;
      z.s7.immortalSummoned = summoned;
      z.emoji = bodyEmoji;
      z.s7.immortalFirstBiteWindupPending = false;
      z.s7.immortalFirstBiteWindupUsed = false;
      delete z.s7.immortalFirstBiteWindupRemaining;
      if (summoned) {
        z.x = clamp(finiteNumber(z.x, S7_IMMORTAL_RULE.deathSummonMinX), S7_IMMORTAL_RULE.deathSummonMinX, COLS - .2);
        z.s7.immortalGraveActive = false;
        delete z.s7.immortalGraveRemaining;
        if (!variant) {
          z.s7.immortalFirstBiteWindupPending = true;
          z.s7.immortalFirstBiteWindupRemaining = S7_IMMORTAL_RULE.summonedNormalFirstBiteWindup
        }
        return z
      }
      const baseX = variant ? S7_IMMORTAL_RULE.variantSpawnX : S7_IMMORTAL_RULE.normalSpawnX;
      const commandShift = s7HasCommand("push", z.row) ? S7_IMMORTAL_RULE.commandForwardShift : 0;
      z.x = baseX - commandShift;
      z.s7.immortalGraveActive = true;
      z.s7.immortalGraveRemaining = S7_IMMORTAL_RULE.graveSeconds;
      z.emoji = "🪦";
      return z
    }

    function s7VariantBaseChanceForHpFraction(frac) {
      return finiteNumber(frac, 1) >= 4 ? .5 : 0
    }

    function s7VariantChanceForHpFraction(frac, cat, row = null) {
      const activeCommands = s7CommandCount(cat, row);
      return clamp(s7VariantBaseChanceForHpFraction(frac) + activeCommands * .08, 0, 1)
    }

    function s7HpFractionAllowsVariant(frac) {
      return finiteNumber(frac, 1) >= 4
    }

    function s7ResolveOpenVariant(requestedVariant, frac, cat, wasFriendly = false, command = false, row = null) {
      if (wasFriendly || command) return false;
      // 显式要求变种（如指令召唤盲盒必出同类型变种）时无视血量档限制。
      if (requestedVariant === true) return true;
      // 框架约束：所有普通/巨人僵尸都必须先达到4/5或5/5血量档，才允许成为变种。
      // 这条也约束"强制变种盲盒/空投"结果，防止低血量档提前刷出超大巨人等变种后果。
      if (!s7HpFractionAllowsVariant(frac)) return false;
      return s7BattleRandom() < s7VariantChanceForHpFraction(frac, cat, row)
    }

    function s7ApplyRaidBalloonFixedBonus(z) {
      if (!z || z.type !== "balloon" || z.s7?.raidBalloonFixedBonusApplied) return false;
      if (!s7HasCommand("raid", z.row) || z.s7?.category !== "raid") return false;
      z.s7.raidBalloonFixedBonusApplied = true;
      z.hp += 100;
      z.maxHp += 100;
      s7RefreshZombieCriticalSplit(z);
      z.armors.push(armor("气球", 100, 1, false));
      s7RecalcZombieXp(z);
      return true
    }

    function s7ApplyZombieVariant(z, variant = false, command = false, cat = null, opt = {}) {
      if (!z.s7) z.s7 = {};
      z.s7.variant = !!variant;
      z.s7.command = !!command;
      z.s7.category = cat || z.s7.category || s7CategoryForType(z.type);
      if (z.type === "tallz") z.s7.flatReduce = 5;
      if (z.type === "blackolive") {
        z.crit = 0;
        z.noCrit = true;
        z.armors = finiteArray(z.armors).filter(a => a?.name !== "黑橄榄头盔");
        delete z.s7.reviveOnce;
        delete z.s7.revived
      }
      s7RecalcZombieXp(z);
      z.s7Elem = s7Elem(z);
      if (command) {
        s7SetCommandStateForZombie(z, 1);
        z.s7.noEat = true;
        if (z.type === "blackolive") {
          const changed = s7HalveExistingElementsForBlackOlive(z.row);
          addEffect(z.row, z.x, `元素层减半${changed?`·${changed}`:""}`, "#a78bfa")
        }
      }
      if (variant) {
        z.name = "变种" + z.name;
        z.emoji = "✨" + z.emoji;
        if (z.type === "bucket") {
          z.name = "疯狗铁桶僵尸";
          z.emoji = "🐕🪣🧟";
          // 疯狗铁桶：本体血量提升至560（普通铁桶本体270）。
          z.hp = 560;
          z.maxHp = 560;
          s7RefreshZombieCriticalSplit(z)
        }
        if (z.type === "immortal") {
          z.name = "亡唤不朽僵尸";
          z.emoji = "✨🧟"
        }
        if (z.type === "screen") {
          z.name = "防爆门僵尸";
          z.emoji = "🛡️🚪🧟";
          z.s7.doorPerHitLimit = 30;
          z.s7.doorReduce = .4;
          const door = finiteArray(z.armors).find(a => a && a.hp > 0 && a.name === "铁门");
          if (door) {
            door.name = "防爆铁门";
            door.cls = 1;
            door.metal = true
          }
        }
        if (z.type === "wallz") {
          z.name = "坚果墙铁门僵尸";
          z.emoji = "🚪🥜🧟";
          z.armors.unshift(armor("铁门", 1100, 2, true))
        }
        if (z.type === "tallz") {
          z.name = "高坚果铁门僵尸";
          z.emoji = "🚪🧱🧟";
          z.armors.unshift(armor("铁门", 1100, 2, true))
        }
        if (z.type === "newspaper") {
          z.hp = 600;
          z.maxHp = 600;
          z.name = "狂暴二爷";
          z.emoji = "💢📰🧟";
          z.armors = [armor("狂暴报纸", 1200, 1, false)];
          z.s7.rageStacks = 0
        }
        if (z.type === "football") {
          z.name = "黑橄榄僵尸";
          z.emoji = "⚫🏈🧟";
          z.s7.immune = true
        }
        if (z.type === "zomboni") {
          z.name = "装甲车";
          z.emoji = "🛡️🧊🚗";
          z.s7.flatReduce = 12
        }
        if (z.type === "squashz") z.s7.reviveOnce = true;
        if (z.type === "backup") {
          z.name = "冲刺伴舞僵尸";
          z.emoji = "🏃💃🧟";
          z.armors.push(armor("伴舞头盔", 500, 1, true))
        }
        if (z.type === "pole") {
          z.hp += 300;
          z.maxHp += 300
        }
        if (z.type === "dolphin") {
          z.name = "鲸鱼僵尸";
          z.emoji = "🐋🧟";
          z.hp = 500;
          z.maxHp = 500
        }
        if (z.type === "balloon") {
          z.name = "突袭气球僵尸";
          z.emoji = "🎈⚡🧟";
          z.hp = 350;
          z.maxHp = 350;
          z.balloonDropX = 1.5
        }
        if (z.type === "ladder") {
          z.name = "专家梯子僵尸";
          z.emoji = "🧑‍🔧🪜🧟"
        }
        if (z.type === "snorkel") {
          z.flags = {
            ...ZOMBIES.snorkel
          };
          z.vehicle = false;
          z.air = false;
          z.underground = false;
          z.jumping = false;
          z.jumped = false;
          z.jumpMove = 0;
          z.diving = true;
          z.surfaced = false;
          z.armors.push(armor("潜水头盔", 540, 1, true))
        }
        if (z.type === "catapult") {
          z.name = "变种投篮车僵尸";
          z.emoji = "🏀🚗🧟";
          z.balls = 15
        }
        if (z.type === "bobsledSled") {
          z.hp = 600;
          z.maxHp = 600
        }
        if (z.type === "peaz") {
          z.name = "铁门豌豆射手僵尸";
          z.emoji = "🚪🌱🧟";
          z.armors.push(armor("射手铁门", 1100, 2, true))
        }
        if (z.type === "ducky") {
          z.name = "铁桶鸭子僵尸";
          z.emoji = "🪣🦆🧟";
          z.armors.push(armor("鸭子铁桶", 1100, 1, true))
        }
        if (z.type === "jack") z.s7.openBoxes = true;
        if (z.type === "yeti") {
          z.name = "宝藏雪人僵尸";
          z.emoji = "💎❄️🧟";
          if (!z.s7.yetiTreasureSlowApplied) {
            z.s7.yetiTreasureSlowApplied = true;
            const candidates = s7YetiMainPlantsInRow(z.row);
            if (candidates.length) {
              const target = candidates[Math.floor(s7BattleRandom() * candidates.length)];
              s7ApplyYetiPlantSlow(target, S7_YETI_RULE.treasureSpawnSlowSeconds, "宝藏雪人减速7.5s")
            }
          }
        }
      }
      if (z.type === "immortal") s7ConfigureImmortal(z, opt);
      if (z.type === "ladder") s7RefreshLadderCommandUses(z)
      if (s7HasCommand("raid", z.row) && z.s7?.category === "raid") {
        if (z.type === "balloon" && !opt.deferRaidBalloonFixedBonus) s7ApplyRaidBalloonFixedBonus(z)
      }
      if (z.type === "blackolive") s7ClearAbnormalState(z);
      if (z.type === "jack") z.jackCd = .1;
      // 变种可能改写本体总血量；所有原本有临界段的类型必须重新按1/3向下取整划分。
      s7RefreshZombieCriticalSplit(z);
      // 变种可能在前面改写本体血量或新增/替换防具，必须在全部改写结束后刷新经验快照。
      s7RecalcZombieXp(z);
      return z
    }

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7PickBoxResult

    // [原源码行 13923] 指令黑橄榄入场时将本行现有寒意/燃焰/剧毒/光标/暗熠层数统一向上取整减半。

    // [原源码行 13924] 燃焰本身仍可继续触发溅射、融化和其他火属性效果。

    // [原源码行 13959] 白眼/红眼巨人的满血巨大化规则必须在随机血量档位确定后执行，

    // [原源码行 13960] 不能在变种阶段提前滚，否则非满血巨人也会错误巨大化。

    // [原源码行 13975] 变种潜水的唯一变种能力是增加一层潜水头盔。

    // [原源码行 13976] 显式清除任何可能由旧状态或通用变种流程带入的穿越类状态。

    // [原源码行 14001] 宝藏雪人只在出场时触发一次：减速本行随机1个主植物7.5s。

    // [原源码行 14017] ── 指令增益（对场上所有同类僵尸生效）──

    // [原源码行 14022] 巨人武装/突进依赖随机血量档与满血巨大化结果，

    // [原源码行 14023] 统一在 s7FinalizeGiantByHpAndCommands 中处理。

    // [原源码行 14024] 扶梯僵尸突破指令增益：额外一个梯子（共2个），可搭任何植物

    // -----------------------------------------------------------------------------

    function s7CategoryPoolForBox(cat, opt = {}) {
      const allowGarg = !!opt.allowGarg;
      return finiteArray(S7_ZOMBIE_CATS[cat]).filter(type => {
        if (!ZOMBIES[type]) return false;
        if (S7_COMMAND_ZOMBIES.includes(type)) return false;
        if (!allowGarg && (type === "garg" || type === "giga")) return false;
        return true
      })
    }

    function s7PickForcedCategoryBoxResult(cat) {
      const list = s7CategoryPoolForBox(cat, {
        allowGarg: false
      });
      const type = s7BattleChoose(list.length ? list : S7_NORMAL_ZOMBIES.filter(k => k !== "garg" && k !== "giga"));
      return {
        type: type,
        cat: cat,
        variant: false,
        command: false
      }
    }

    function s7PickBoxResult(wasFriendly = false) {
      const cats = Object.keys(S7_ZOMBIE_CATS);
      if (wasFriendly) {
        // 魅惑池：取普通盲盒"5大类等概率→类内等概率"的两级结构，剔除指令僵尸（相对权重不变）。
        const cat = s7BattleChoose(cats);
        const list = s7CategoryPoolForBox(cat, {
          allowGarg: true,
          excludeCommand: true
        });
        const type = s7BattleChoose(list.length ? list : S7_NORMAL_ZOMBIES.filter(k => k !== "garg" && k !== "giga"));
        return {
          type: type,
          cat: cat,
          variant: false,
          command: false
        }
      }
      if (s7BattleRandom() < s7CommandProb(state?.time || 0)) {
        const cat = s7BattleChoose(cats);
        return {
          type: S7_COMMAND_BY_CAT[cat],
          cat: cat,
          variant: false,
          command: true
        }
      }
      const cat = s7BattleChoose(cats);
      const list = s7CategoryPoolForBox(cat, {
        allowGarg: true
      });
      const type = s7BattleChoose(list.length ? list : S7_NORMAL_ZOMBIES);
      return {
        type: type,
        cat: cat,
        variant: false,
        command: false
      }
    }

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7BoxName

    // [原源码行 14044] 随机血量机制要求：普通开盒僵尸是否变种由血量档决定，

    // [原源码行 14045] 达到 4/5 或 5/5 后才有 50% 概率变种。这里不再提前按时间滚变种。

    // -----------------------------------------------------------------------------

    function s7BoxName(sp) {
      const z = ZOMBIES[sp.type] || ZOMBIES.blind || ZOMBIES.normal;
      return `${sp.command?"指令":sp.variant?"变种":""}${z.name}盲盒`
    }

    function s7MakeSpawnBox(row, x, sp) {
      return makeBlind(row, x, {
        s7Box: {
          type: sp.type,
          cat: sp.cat,
          variant: !!sp.variant,
          command: !!sp.command
        },
        name: s7BoxName(sp),
        emoji: sp.command ? "🎁📣" : sp.variant ? "🎁✨" : "🎁"
      })
    }

    function s7ZombieEffectiveTotalHp(z) {
      if (!z) return 0;
      let total = Math.max(0, finiteNumber(z.hp, 0));
      for (const a of finiteArray(z.armors)) total += Math.max(0, finiteNumber(a?.hp, 0));
      return total
    }

    function s7ApplyBobsledSledNaturalDecay(z, dt) {
      if (!z || z.dead || z.type !== "bobsledSled" || z.s7?.variant || !(dt > 0)) return false;
      // 普通雪橇离开冰道后自然损耗；变种雪橇不自然掉血，只会因受击掉血。
      if (s7ZombieOnIceTrail(z)) return false;
      const before = s7ZombieEffectiveTotalHp(z);
      if (before <= 0) return false;
      damageZombie(z, S7_BOBSLED_SLED_DECAY_PER_SECOND * dt, {
        noSource: true,
        noCritical: true,
        noTransform: true,
        naturalSledDecay: true
      });
      if (!z.dead && Math.floor((z.s7?.sledDecayHintCd || 0) * 10) <= 0) {
        z.s7 = z.s7 || {};
        z.s7.sledDecayHintCd = 1;
        addEffect(z.row, z.x, "离冰道掉血", "#bfdbfe", .35)
      }
      if (z.s7) z.s7.sledDecayHintCd = Math.max(0, finiteNumber(z.s7.sledDecayHintCd, 0) - dt);
      return true
    }

    function s7SpawnBobsledCommandWalkers(z) {
      if (!z || z.dead || z.type !== "bobsledSled" || z.s7?.summonCommandWalkersSpawned) return 0;
      if (!canAddZombie(z.row, S7_BOBSLED_COMMAND_EXTRA_WALKERS)) return 0;
      z.s7 = z.s7 || {};
      z.s7.summonCommandWalkersSpawned = true;
      let made = 0;
      for (let i = 0; i < S7_BOBSLED_COMMAND_EXTRA_WALKERS; i++) {
        const offset = (i + 1) * S7_BOBSLED_COMMAND_EXTRA_WALKER_GAP;
        const walker = makeZombie("bobsled", z.row, clamp(z.x + offset, 0, COLS + .6), {
          category: "summon"
        });
        walker.name = `雪橇额外队员${i+1}`;
        walker.s7 = walker.s7 || {};
        walker.s7.summonCommandExtraWalker = true;
        if (z.friendly) {
          walker.friendly = true;
          walker.dir = 1
        }
        if (safePushZombie(walker, "bobsled-command-extra")) made++
      }
      if (made) addEffect(z.row, z.x + .5, `指令额外雪橇队员×${made}`, "#c7d2fe", .75);
      return made
    }

    function spawnBobsledSquad(row, x, opt = {}) {
      const count = 4;
      const riders = [];
      const sledGroupId = opt.sledGroupId || `sled-${uid++}`;
      for (let i = 0; i < count; i++) {
        const rider = makeZombie("bobsled", row, clamp(x + (i - (count - 1) / 2) * .22, 0, COLS + .6), {
          ...opt,
          variant: !!opt.variantSled || !!opt.variant
        });
        if (opt.friendly) {
          rider.friendly = true;
          rider.dir = 1
        }
        if (!rider.s7) rider.s7 = {};
        rider.s7.sledGroupId = sledGroupId;
        if (opt.variantSled) {
          rider.s7.variantSledMember = true;
          rider.s7.sledSummonCount = 0;
          rider.s7.sledSummonCd = 6
        }
        rider.name = "雪橇小队成员" + (i + 1);
        riders.push(rider);
        safePushZombie(rider, "bobsled-squad")
      }
      addEffect(row, x, `雪橇小队×${count}`, "#c7d2fe");
      return riders
    }

    function s7RandomHpFraction(isGarg = false) {
      const minute = Math.max(0, (state?.time || 0) / 60);
      let choices;
      if (minute < 4) choices = [1, 2, 3];
      else if (minute < 6) choices = [1, 2, 3, 3];
      else if (minute < 8) choices = [1, 2, 3, 4];
      else if (minute < 10) choices = [1, 2, 3, 4, 4];
      else if (minute < 12) choices = [1, 2, 3, 4, 5];
      else if (minute < 14) choices = [2, 2, 3, 4, 5];
      else if (minute < 16) choices = [2, 3, 3, 4, 5];
      else if (minute < 18) choices = [3, 3, 3, 4, 5];
      else if (minute < 20) choices = [3, 3, 3, 4, 4, 5, 5];
      else choices = [3, 4, 5];
      let frac = s7BattleChoose(choices);
      if (isGarg) {
        // 巨人早期血量上限：0-5分钟最高20%，5-7分钟最高40%，7-9分钟最高60%；9分钟后同其他僵尸。
        const maxFrac = minute < 5 ? 1 : minute < 7 ? 2 : minute < 9 ? 3 : 5;
        frac = Math.min(frac, maxFrac)
      }
      return frac
    }

    function s7CapGargHpFractionForEarlyGame(frac) {
      const minute = Math.max(0, (state?.time || 0) / 60);
      const maxFrac = minute < 5 ? 1 : minute < 7 ? 2 : minute < 9 ? 3 : 5;
      return Math.min(frac, maxFrac)
    }

    function s7RecalcZombieXp(z) {
      if (!z) return 0;
      // 经验值只取死亡实体的本体、一类防具、二类防具最大生命值；其他附属物不计入。
      const bodyMax = Math.max(0, finiteNumber(z.maxHp, z.hp || 0));
      let armorMax = 0;
      for (const a of finiteArray(z.armors)) {
        if (!a || (a.cls !== 1 && a.cls !== 2)) continue;
        armorMax += Math.max(0, finiteNumber(a.max, a.hp || 0))
      }
      z.s7Xp = bodyMax + armorMax;
      return z.s7Xp
    }

    function s7SetBodyMaxHp(z, maxHp) {
      if (!z) return;
      const next = Math.max(1, finiteNumber(maxHp, z.maxHp || z.hp || 1));
      z.maxHp = next;
      z.hp = next;
      s7RefreshZombieCriticalSplit(z)
    }

    function s7ScaledHpForFraction(baseHp, frac) {
      return Math.max(1, Math.ceil(finiteNumber(baseHp, 1) * clamp(finiteNumber(frac, 5) / 5, .2, 1)))
    }

    function s7MakeHugeWhiteGarg(z) {
      if (!z || z.type !== "garg" || z.s7?.hugeGarg) return false;
      z.s7 = z.s7 || {};
      z.s7.hugeGarg = true;
      s7SetBodyMaxHp(z, s7ScaledHpForFraction(4e3, z.s7.hpFraction));
      if (!String(z.emoji || "").includes("⬜")) z.emoji = "⬜" + z.emoji;
      s7RefreshGiantDisplay(z);
      s7RecalcZombieXp(z);
      addEffect(z.row, z.x, "白眼巨大化", "#e5e7eb");
      return true
    }

    function s7MakeSuperRedGiga(z) {
      if (!z || z.type !== "giga" || z.s7?.superGiga) return false;
      z.s7 = z.s7 || {};
      z.s7.superGiga = true;
      s7SetBodyMaxHp(z, s7ScaledHpForFraction(9e3, z.s7.hpFraction));
      if (!String(z.emoji || "").includes("🔴🔴")) z.emoji = "🔴" + z.emoji;
      s7RefreshGiantDisplay(z);
      s7RecalcZombieXp(z);
      addEffect(z.row, z.x, "红眼超大化", "#f87171");
      return true
    }

    function s7GiantArmorHpPerLayer(z) {
      // 白眼武装铁桶+铁门各1100；红眼各2200。
      return z && z.type === "giga" ? 2200 : 1100
    }

    function s7GiantArmorScale(z) {
      if (!z?.s7) return 1;
      // 武装巨人的铁桶/铁门也是血量组件，必须跟随当前血量档缩放；满血档才是完整1100/2200。
      return clamp(finiteNumber(z.s7.hpFraction, 5) / 5, .2, 1)
    }

    function s7AddGiantArmedArmor(z) {
      if (!z || !z.flags?.garg || z.s7?.armed) return false;
      z.s7 = z.s7 || {};
      z.s7.armed = true;
      const hp = Math.max(1, Math.ceil(s7GiantArmorHpPerLayer(z) * s7GiantArmorScale(z)));
      z.armors = finiteArray(z.armors).filter(a => a && a.hp > 0 && a.name !== "武装铁门" && a.name !== "武装铁桶");
      // 铁门护盾在外层先承伤；铁桶头盔在内层。二者均为可被磁力菇吸取的金属防具。
      z.armors.unshift(armor("武装铁桶", hp, 1, true));
      z.armors.unshift(armor("武装铁门", hp, 2, true));
      if (!String(z.emoji || "").includes("🛡️")) z.emoji = "🛡️" + z.emoji;
      addEffect(z.row, z.x, z.type === "giga" ? "红眼武装" : "白眼武装", "#fbbf24");
      s7RecalcZombieXp(z);
      return true
    }

    function s7AddGiantCharge(z) {
      if (!z || !z.flags?.garg || z.s7?.charged) return false;
      z.s7 = z.s7 || {};
      z.s7.charged = true;
      if (!String(z.emoji || "").includes("⚡")) z.emoji = "⚡" + z.emoji;
      addEffect(z.row, z.x, z.type === "giga" ? "红眼突进" : "白眼突进", "#f87171");
      return true
    }

    function s7ClearRedGigaNonHugeStates(z) {
      // v0.4 允许红眼变种拥有武装/突进，且可与超大化同时存在；兼容旧调用但不再清除 variant。
      return false
    }

    function s7RefreshGiantDisplay(z) {
      if (!z || !z.flags?.garg) return;
      const s = z.s7 || {};
      if (z.type === "giga") {
        s7ClearRedGigaNonHugeStates(z);
        const base = s.superGiga ? "超大红眼巨人" : "红眼巨人";
        if (s.armed && s.charged) z.name = "金色突进武装" + base;
        else if (s.armed) z.name = "武装" + base;
        else if (s.charged) z.name = "突进" + base;
        else z.name = base;
        return
      }
      const base = s.hugeGarg ? "巨大白眼巨人" : "白眼巨人";
      if (s.armed && s.charged) z.name = "金色突进武装" + base;
      else if (s.armed) z.name = "武装" + base;
      else if (s.charged) z.name = "突进" + base;
      else if (s.variant) z.name = "变种" + base;
      else z.name = base
    }

    function s7GiantRoll(chance) {
      return s7BattleRandom() < clamp(finiteNumber(chance, 0), 0, 1)
    }

    function s7FinalizeGiantByHpAndCommands(z) {
      if (!z || !z.flags?.garg) return;
      z.s7 = z.s7 || {};
      // 即使是旧存档、复制实体或已完成过随机的红眼，也先清理禁止的武装/突进状态。
      if (z.type === "giga") s7ClearRedGigaNonHugeStates(z);
      if (z.s7.giantSpecialRollDone) {
        s7RefreshGiantDisplay(z);
        s7RecalcZombieXp(z);
        return
      }
      z.s7.giantSpecialRollDone = true;
      const hpFraction = finiteNumber(z.s7.hpFraction, 5);
      const fullHp = hpFraction >= 5;
      const variantAllowed = s7HpFractionAllowsVariant(hpFraction);
      const isVariantGiant = !!z.s7.variant && variantAllowed;
      if (!variantAllowed) z.s7.variant = false;
      if (z.type === "garg") {
        // v0.4：巨大化独立判定，满血必定，否则20%；可与武装/突进同时存在。
        if (s7GiantRoll(fullHp ? 1 : .2)) s7MakeHugeWhiteGarg(z);
        if (isVariantGiant) {
          const armChance = .7 + s7CommandCount("break", z.row) * .08;
          const chargeChance = .3 + s7CommandCount("push", z.row) * .08;
          if (s7GiantRoll(armChance)) s7AddGiantArmedArmor(z);
          if (s7GiantRoll(chargeChance)) s7AddGiantCharge(z)
        }
      } else if (z.type === "giga") {
        // v0.4：红眼巨大化独立判定，满血必定，否则5%；武装/突进只属于变种且彼此独立。
        if (s7GiantRoll(fullHp ? 1 : .05)) s7MakeSuperRedGiga(z);
        if (isVariantGiant) {
          if (s7GiantRoll(.7)) s7AddGiantArmedArmor(z);
          if (s7GiantRoll(.3)) s7AddGiantCharge(z)
        }
      }
      s7RefreshGiantDisplay(z);
      s7RecalcZombieXp(z)
    }

    function s7ApplyHpFraction(z, frac) {
      if (!z) return;
      if (!z.s7) z.s7 = {};
      z.s7.hpFraction = Math.max(1, Math.min(5, frac || 5));
      if (frac < 5) {
        const scale = clamp(frac / 5, .2, 1);
        z.hp = Math.max(1, Math.ceil(z.hp * scale));
        z.maxHp = Math.max(1, Math.ceil(z.maxHp * scale));
        s7RefreshZombieCriticalSplit(z);
        for (const a of z.armors || []) {
          a.hp = Math.max(1, Math.ceil(a.hp * scale));
          a.max = Math.max(1, Math.ceil(a.max * scale))
        }
      }
      s7FinalizeGiantByHpAndCommands(z);
      s7ApplyRaidBalloonFixedBonus(z);
      s7RecalcZombieXp(z)
    }

    function s7CommandSummonBoxX() {
      return s7BattleRnd(8, 10)
    }

    function s7CommandCategoryForZombie(z) {
      if (!z) return null;
      const category = z.s7?.category || ZOMBIES[z.type]?.category || s7CategoryForType(z.type);
      return category && S7_ZOMBIE_CATS[category] ? category : null
    }

    function s7TriggerCommandSpawnOnce(z, reason = "spawn") {
      if (!z || z.dead || z.friendly) return 0;
      const isCommand = !!z.s7?.command || !!ZOMBIES[z.type]?.command || S7_COMMAND_ZOMBIES.includes(z.type);
      if (!isCommand) return 0;
      const category = s7CommandCategoryForZombie(z);
      if (!category) return 0;
      z.s7 = z.s7 || {};
      if (z.s7.commandSpawnResolved) return 0;
      if (z.s7.commandSpawnTarget == null) z.s7.commandSpawnTarget = Math.max(0, s7CommandBoxes(state.time || 0));
      z.s7.commandSpawnMade = Math.max(0, Math.floor(finiteNumber(z.s7.commandSpawnMade, 0)));
      const remaining = Math.max(0, z.s7.commandSpawnTarget - z.s7.commandSpawnMade);
      z.s7.commandSpawnReason = String(reason || "spawn");
      if (remaining <= 0) {
        z.s7.commandSpawnResolved = true;
        z.s7.commandSpawnPending = 0;
        return 0
      }
      const made = s7SummonCommandBlindBoxes(z, category, remaining);
      z.s7.commandSpawnMade += made;
      z.s7.commandSpawnPending = Math.max(0, z.s7.commandSpawnTarget - z.s7.commandSpawnMade);
      z.s7.commandSpawnResolved = z.s7.commandSpawnPending <= 0;
      return made
    }

    function s7SummonCommandBlindBoxes(z, category = null, requestedCount = null) {
      if (!z || !state || !category || !S7_ZOMBIE_CATS[category]) return 0;
      const targetCount = requestedCount == null ? s7CommandBoxes(state.time || 0) : Math.max(0, Math.floor(requestedCount));
      const count = Math.max(0, Math.min(targetCount, PERF.MAX_ZOMBIES - activeZombieCount(null)));
      let made = 0;
      for (let i = 0; i < count; i++) {
        const box = makeBlind(z.row, s7CommandSummonBoxX(), {
          forcedCategory: category,
          name: "指令召唤盲盒",
          emoji: "🎁📣",
          category: category,
          armorHp: S7_COMMAND_BLIND_BOX_ARMOR_HP
        });
        if (z.friendly) {
          box.friendly = true;
          box.dir = 1;
          box.s7CharmedByHypno = true
        }
        if (safePushZombie(box, "command-summon-box")) {
          made++;
          addEffect(box.row, box.x, "指令召唤盲盒", "#f87171", .55)
        }
      }
      if (made > 0) log(`${TEAM_NAMES[z.row]}：${z.name||"指令僵尸"} 召唤 ${made} 个${category}类1血盲盒。`);
      return made
    }

    function s7OpenBlindTo(z, type, variant = false, category = null, label = "开盒→", command = false) {
      const row = z.row,
        x = z.x,
        wasFriendly = !!z.friendly,
        inheritedElements = s7SnapshotElementState(z),
        poisonOnOpen = Math.max(0, z.s7?.poisonOnOpen || 0);
      inheritedElements.poison += poisonOnOpen;
      z.dead = true;
      state.zombies = state.zombies.filter(q => !q.dead);
      if (type === "bobsled" || type === "bobsledSled") {
        const frac = s7RandomHpFraction(false);
        const finalVariant = s7ResolveOpenVariant(variant, frac, category, wasFriendly, command, row);
        const sled = makeZombie("bobsledSled", row, x, {
          variant: finalVariant,
          category: category,
          command: !!command
        });
        if (wasFriendly) {
          sled.friendly = true;
          sled.dir = 1
        }
        s7ApplyHpFraction(sled, frac);
        sled.s7.inheritedElementsOnDismount = inheritedElements;
        safePushZombie(sled, "blind-bobsled-sled");
        // 指令入场召唤统一由 safePushZombie -> s7TriggerCommandSpawnOnce 负责，避免双重召唤。
        if (wasFriendly) s7GrantShineToIceStarHypno(row, 7.5, "开盒照耀");
        log(`${TEAM_NAMES[row]}：${z.name||"盲盒"} 打开，变成 ${wasFriendly?"魅惑":""}${finalVariant?"变种":""}雪橇`);
        return sled
      }
      const isGarg = type === "garg" || type === "giga";
      const rawFrac = command ? 5 : s7RandomHpFraction(false);
      // v0.4：变种巨人的出现不受前期巨人血量压制。先用原始血量档判变种，再只压制非变种巨人的最终血量档。
      const finalVariant = s7ResolveOpenVariant(variant, rawFrac, category, wasFriendly, command, row);
      const frac = isGarg && !finalVariant ? s7CapGargHpFractionForEarlyGame(rawFrac) : rawFrac;
      const nz = makeZombie(type, row, x, {
        variant: finalVariant,
        category: category,
        command: !!command,
        deferRaidBalloonFixedBonus: true
      });
      if (wasFriendly) {
        nz.friendly = true;
        nz.dir = 1;
        s7GrantShineToIceStarHypno(row, 7.5, "开盒照耀")
      }
      s7ApplyHpFraction(nz, frac);
      s7RestoreElementState(nz, inheritedElements);
      if (isAbnormalImmuneZombie(nz)) s7ClearAbnormalState(nz);
      safePushZombie(nz, "open-box");
      // 指令入场召唤统一由 safePushZombie -> s7TriggerCommandSpawnOnce 负责，避免双重召唤。
      const openEffectX = type === "bungee" ? nz.x : x;
      addEffect(row, openEffectX, label + nz.name, finalVariant ? "#fef08a" : "#fde047");
      log(`${TEAM_NAMES[row]}：${z.name||"盲盒"} 打开，变成 ${wasFriendly?"魅惑":""}${nz.name}`);
      return nz
    }

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7JackExplosion

    // [原源码行 14233] 乘雪橇阶段整体免疫元素；盲盒原有全部元素层数暂存于雪橇，

    // [原源码行 14234] 雪橇损毁后由每名下车成员完整继承。

    // [原源码行 14245] 魅惑盲盒只能开出普通僵尸；敌方盲盒在高血量时才可自动变种。

    // [原源码行 14267] 开盒只是替换盲盒载体，不清空寒意、燃焰、剧毒、光标或暗熠层数。

    // -----------------------------------------------------------------------------

    function s7JackReleaseRandomZombieFromSelf(z, label = "小丑开盒→") {
      if (!z || z.dead || !state || !canAddZombie(z.row, 1)) return null;
      const picked = s7PickBoxResult(!!z.friendly);
      const dummy = makeBlind(z.row, z.x, {
        name: "小丑自身盲盒",
        emoji: "🤡🎁",
        category: picked.cat || s7CategoryForType(picked.type),
        s7Box: {
          type: picked.type,
          variant: picked.variant,
          cat: picked.cat,
          command: picked.command
        }
      });
      if (z.friendly) {
        dummy.friendly = true;
        dummy.dir = 1
      }
      const released = transformBlind(dummy);
      if (released) addEffect(z.row, z.x, label + released.name, "#fde047", .75);
      return released
    }

    function s7JackReleaseOneBlindBox(b) {
      if (!b || b.dead || !b.blind) return null;
      // 变种小丑的“开盒”语义是把盒内僵尸放出来：
      // 每个盲盒都必须走 transformBlind -> s7OpenBlindTo 的正式开盒链路，
      // 正常释出 1 只盒内僵尸；不能静默删除，也不能额外倍增第 2 只。
      return transformBlind(b)
    }

    function s7OpenBlindBoxesInJackRow(z) {
      if (!z || !state) return 0;
      let opened = 0;
      const zArr = state.zombies;
      const zLen = zArr.length;
      for (let zi = 0; zi < zLen; zi++) {
        const b = zArr[zi];
        // 变种小丑的额外开盒能力固定为“自身所在整行”。
        // 不使用小丑对植物爆炸的3×3范围；不跨行；也不因距离远近漏开。
        if (!b || b.dead || !b.blind || b.row !== z.row) continue;
        const released = s7JackReleaseOneBlindBox(b);
        if (released) opened++;
      }
      return opened
    }

    function s7JackExplosion(z) {
      if (zombieIsHardControlled(z)) return false;
      const rad = 1.5;
      for (const p of [...state.plants]) {
        if (!p.dead && Math.abs(p.row - z.row) <= 1 && Math.abs(p.col + .5 - z.x) <= rad) {
          const dmg = 100 * (p.hp / Math.max(1, p.maxHp));
          damagePlant(p, dmg, z);
          addEffect(p.row, p.col + .5, "小丑" + Math.round(dmg), "#f472b6")
        }
      }
      let opened = 0;
      const zArr = state.zombies;
      const zLen = zArr.length;
      for (let zi = 0; zi < zLen; zi++) {
        const b = zArr[zi];
        if (!b || b.dead || !b.blind || b.row !== z.row || Math.abs(b.x - z.x) > rad) continue;
        const released = s7JackReleaseOneBlindBox(b);
        if (released) { opened++; addEffect(b.row, b.x, "小丑开盒→" + released.name, "#fde047", .75) }
      }
      if (z.s7?.openBoxes) opened += s7OpenBlindBoxesInJackRow(z);
      let selfReleased = s7JackReleaseRandomZombieFromSelf(z, "小丑自身开盒→");
      // 受召唤指令影响时，小丑自身开盒后有50%概率额外多出现一只随机僵尸。
      if (selfReleased && s7HasCommand("summon", z.row) && s7BattleRandom() < .5) {
        const extra = s7JackReleaseRandomZombieFromSelf(z, "小丑指令额外开盒→");
        if (extra) selfReleased = true
      }
      const labels = [];
      if (selfReleased) labels.push("自身1");
      if (opened) labels.push(`盲盒×${opened}`);
      addEffect(z.row, z.x, labels.length ? `小丑开盒·${labels.join("·")}` : "小丑爆炸", "#f472b6");
      killZombie(z, {
        noCritical: true,
        noTransform: true
      })
    }

    function s7TallnutAirBlock(rowFilter = null) {
      for (const z of state.zombies) {
        if (z.dead || rowFilter !== null && z.row !== rowFilter) continue;
        if (isUnderground(z)) {
          tallnutInterceptUndergroundDigger(z);
          continue
        }
        // 空中气球完全无视高坚果：不爆球、不改位移、不改速度，也不触发“拦飞”。
        if (isBalloonAir(z)) continue;
        if (z.type === "imp" || !isS7FlyingZombie(z)) continue;
        const tn = state.plants.find(p => !p.dead && p.key === "tallnut" && p.row === z.row && Math.abs(z.x - (p.col +
          .5)) < .8);
        if (tn) {
          if (z.type === "pogo") z.armors = z.armors.filter(a => a.name !== "跳跳杆");
          if (["pole", "polecmd", "dolphin"].includes(z.type)) z.jumped = true;
          z.jumping = false;
          z.jumpMove = 0;
          z.pogoAirTimer = 0;
          z.x = tn.col + 1.05;
          z.speed = SPEEDS.ordinary;
          setSpeedProfile(z, "ordinary", true);
          addEffect(tn.row, tn.col + .5, "拦飞", "#fde68a")
        }
      }
    }

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7ValidatePlacement

    // [原源码行 14342] 图片明确排除“投掷小鬼”；其余已实际起跳/飞行的指定僵尸均拦截。

    // -----------------------------------------------------------------------------

    function s7ValidatePlacement(key, row, col, quiet = false) {
      if (col >= PLANT_COLS) return {
        ok: false,
        msg: "第10列不可种"
      };
      // 前排类植物（def组）以及曾哥/窝瓜/玉米/小喷菇/魅惑菇只能在3/4/5号位（col 2/3/4）
      const frontOnly = ["gloom", "squash", "kernel", "puff", "hypno"];
      const defKeys = Object.keys(PLANT_RULES).filter(k => PLANT_RULES[k].group === "def");
      const restricted345 = new Set([...frontOnly, ...defKeys]);
      if (restricted345.has(key) && (col < 2 || col > 4)) return {
        ok: false,
        msg: "前排类植物只能在3/4/5号位"
      };
      if (key === "torchwood") {
        const peas = ["snowpea", "repeater", "splitpea", "threepeater", "gatling", "sniper", "reverseRepeater"];
        const ok = state.plants.some(p => !p.dead && p.row === row && peas.includes(p.key) && p.col < col);
        if (!ok) return {
          ok: false,
          msg: "火炬必须能拐到豌豆：同路左侧需要豌豆系"
        }
      }
      return {
        ok: true,
        msg: ""
      }
    }

    // -----------------------------------------------------------------------------

    // 盲盒/指令僵尸 / s7ValidateBoard

    // [原源码行 14424] 铲种规则统一由 canvasClick 调用 s7ValidatePlacement；不再使用额外拦截层。

    // -----------------------------------------------------------------------------

    function s7ValidateBoard(show = false) {
      let ok = true;
      for (let r = 0; r < ROWS; r++) {
        const rowPlants = state.plants.filter(p => !p.dead && p.row === r);
        for (const p of rowPlants) {
          const v = s7ValidatePlacement(p.key, p.row, p.col, true);
          if (!v.ok) {
            ok = false;
            if (show) addEffect(p.row, p.col + .5, v.msg, "#fca5a5", 1.4)
          }
        }
        const lastTwo = rowPlants.filter(p => p.col >= 7);
        const hasOutput = lastTwo.some(p => s7MaxExp(p.key) >= 45e3);
        const hasSunshroom = lastTwo.some(p => p.key === "sunshroom");
        if (!hasOutput || !hasSunshroom) {
          ok = false;
          if (show) addEffect(r, 7.5, "末两列需输出+阳光菇", "#fca5a5", 1.4)
        }
      }
      if (!ok && show) log("S7 铲种规则未通过：前排类/曾哥/窝瓜/玉米/小喷菇/魅惑菇站位（需在3/4/5号位）、末两列输出+阳光菇、火炬拐豆规则需要调整。");
      return ok
    }
    function s7TimelineZombieSizeSmokeTest() {
      const chargedGarg={type:'garg',flags:{garg:true},s7:{charged:true}};
      const normalGarg={type:'garg',flags:{garg:true},s7:{}};
      const hugeGarg={type:'garg',flags:{garg:true},s7:{hugeGarg:true}};
      const chargedGiga={type:'giga',flags:{garg:true},s7:{charged:true}};
      const normalGiga={type:'giga',flags:{garg:true},s7:{}};
      const hugeGiga={type:'giga',flags:{garg:true},s7:{superGiga:true}};
      const zomboni={type:'zomboni',flags:{},s7:{}};
      const catapult={type:'catapult',flags:{},s7:{}};
      const bobsled={type:'bobsled',flags:{},s7:{}};
      const bobsledSled={type:'bobsledSled',flags:{},s7:{}};
      const scale=e=>s7VisualScaleMultiplier('zombie',e,'body');
      const values={
        chargedGarg:scale(chargedGarg),normalGarg:scale(normalGarg),hugeGarg:scale(hugeGarg),
        chargedGiga:scale(chargedGiga),normalGiga:scale(normalGiga),hugeGiga:scale(hugeGiga),
        zomboni:scale(zomboni),catapult:scale(catapult),bobsled:scale(bobsled),bobsledSled:scale(bobsledSled)
      };
      const glyph=e=>s7ZombieFallbackGlyphScale(e,S7_ANIMATION_RENDER_MODES.TIMELINE);
      const glyphValues={
        chargedGarg:glyph(chargedGarg),normalGarg:glyph(normalGarg),hugeGarg:glyph(hugeGarg),
        chargedGiga:glyph(chargedGiga),normalGiga:glyph(normalGiga),hugeGiga:glyph(hugeGiga),
        zomboni:glyph(zomboni),catapult:glyph(catapult),bobsled:glyph(bobsled),bobsledSled:glyph(bobsledSled)
      };
      const near=(a,b)=>Math.abs(a-b)<1e-9;
      return {
        ok:near(values.normalGarg,2)&&near(values.hugeGarg,3)&&near(values.chargedGarg,1)&&near(values.normalGiga,2)&&near(values.hugeGiga,3)&&near(values.chargedGiga,1)&&near(values.zomboni,1.8)&&near(values.catapult,1.5)&&near(values.bobsled,.6)&&near(values.bobsledSled,1.125)&&near(glyphValues.normalGarg/.48,2)&&near(glyphValues.hugeGarg/.48,3)&&near(glyphValues.normalGiga/.48,2)&&near(glyphValues.hugeGiga/.48,3)&&near(glyphValues.zomboni/.48,1.8)&&near(glyphValues.catapult/.48,1.5)&&near(glyphValues.bobsled/.48,.6)&&near(glyphValues.bobsledSled/.48,1.125),
        tiers:S7_TIMELINE_ZOMBIE_SIZE_TIERS,values,glyphValues
      }
    }
    window.S7Final = Object.freeze({
      version:S7_ANIMATION_VERSION,
      selfTest() {
        const projectileAssets=Object.keys(S7_B06_PROJECTILE_MANIFEST).map(k=>({key:k,registered:!!S7_SPRITES.assets.get(`projectile.b06.${k}`)}));
        const effectAssets=Object.keys(S7_BILIBILI_EFFECT_MANIFEST).map(k=>({key:k,registered:!!S7_SPRITES.assets.get(`effect.bili.${k}`)}));
        const frozenLegacyKeys=[...Object.keys(S7_B04A_MANIFEST),...Object.keys(S7_B04B_FLAG_MANIFEST)].filter(k=>k.includes('onearm'));
        const bobsledClips=['walk','attack','death'].map(action=>{
          const id=`zombie.final.bobsled_${action}`, clip=S7_ANIM.getClip(id), asset=S7_SPRITES.meta(id);
          return {action,id,clip:!!clip,asset:!!asset,frameWidth:asset?.frameWidth||0,frameHeight:asset?.frameHeight||0}
        });
        const hitFeedback={duration:ZOMBIE_HIT_FLASH_DURATION,alpha:ZOMBIE_HIT_FLASH_ALPHA};
        const modularBootstrap={
          finiteArray:typeof finiteArray==="function",
          finitePositive:typeof finitePositive==="function",
          userGridPlants:Object.keys(S7_USER_GRID_PLANT_MANIFEST||{})
        };
        const blindVisualClips=['walk','attack'].map(action=>{
          const id=`zombie.planthead.blind.${action}`,clip=S7_ANIM.getClip(id);
          const layers=finiteArray(clip?.layers).map(layer=>layer?.name).filter(Boolean);
          return {action,id,clip:!!clip,layers,headOnly:layers.length===2&&layers.includes('body')&&layers.includes('head')&&!layers.includes('armor')}
        });
        const sunflowerShineTargets={timegrass:S7_SUNFLOWER_SHINE_TARGETS.has('timegrass'),count:S7_SUNFLOWER_SHINE_TARGETS.size};
        const timelineZombieSizes=s7TimelineZombieSizeSmokeTest();
        const cactusClips={normal:!!S7_ANIM.getClip('plant.video.skill.cactusNormal'),air:!!S7_VIDEO_SKILL_CLIPS.cactus};
        const sunflowerLegacy=s7ResolvePlantAnimation({key:'sunflower',s7:{videoSkillTimer:1,videoSkillKey:'sunflower'}}).clipId===S7_B03C_DEFAULT_CLIPS.sunflower;
        const turretSpeed={cellsPerSecond:S7_CATTAIL_TURRET_PROJECTILE_SPEED,cellsPerFrame:S7_CATTAIL_TURRET_PROJECTILE_SPEED*S7_ANIMATION_FIXED_DT};
        return {
          ok:projectileAssets.every(x=>x.registered)&&effectAssets.every(x=>x.registered)&&!frozenLegacyKeys.length&&!!S7_ANIM.getClip('plant.b03b.gatling.fire')&&bobsledClips.every(x=>x.clip&&x.asset&&x.frameWidth===352&&x.frameHeight===384)&&hitFeedback.duration===.12&&hitFeedback.alpha===.5&&modularBootstrap.finiteArray&&modularBootstrap.finitePositive&&modularBootstrap.userGridPlants.length===3&&blindVisualClips.every(x=>x.clip&&x.headOnly)&&sunflowerShineTargets.timegrass&&timelineZombieSizes.ok&&cactusClips.normal&&cactusClips.air&&sunflowerLegacy&&Math.abs(turretSpeed.cellsPerFrame-.12)<1e-9,
          projectileAssets,effectAssets,frozenLegacyKeys,bobsledClips,hitFeedback,modularBootstrap,blindVisualClips,sunflowerShineTargets,timelineZombieSizes,cactusClips,sunflowerLegacy,turretSpeed,
          gatlingClip:!!S7_ANIM.getClip('plant.b03b.gatling.fire'),
          b04a:window.S7B04A?.selfTest?.(),
          b04b:window.S7B04B?.selfTest?.(),
          b04c:window.S7B04C?.selfTest?.()
        }
      },
      timelineZombieSizeSmokeTest() {
        return s7TimelineZombieSizeSmokeTest()
      },
      hitFeedbackSmokeTest() {
        const previousState=state;
        try {
          state={time:10};
          const hit={dead:false,hitFlashUntil:0};
          const blocked={dead:false,hitFlashUntil:0};
          const marked=s7MarkZombieHitFlash(hit,1);
          const zeroMarked=s7MarkZombieHitFlash(blocked,0);
          return {
            ok:marked&&s7ZombieHitFlashActive(hit)&&!zeroMarked&&!s7ZombieHitFlashActive(blocked)&&Math.abs(hit.hitFlashUntil-10.12)<1e-9,
            marked,zeroMarked,active:s7ZombieHitFlashActive(hit),until:hit.hitFlashUntil,alpha:ZOMBIE_HIT_FLASH_ALPHA,duration:ZOMBIE_HIT_FLASH_DURATION
          }
        } finally { state=previousState }
      },
      plantingSmokeTest() {
        const previous={state,tool,selected,glove,uid,frameAcc,last};
        try {
          newState(false);
          state.running=false;
          state.plants=[];
          state.iceTrails=[];
          state.allowStack=false;
          state.s7.lastRenderErrorMsg='';
          tool='plant';
          selected='wallnut';
          glove=null;
          resize();
          const rect=canvas.getBoundingClientRect();
          const clientX=rect.left+layout.x+6.5*layout.cell;
          const clientY=rect.top+layout.y+.5*layout.cell;
          const cell=boardToCell(clientX-rect.left,clientY-rect.top);
          canvasClick({clientX,clientY,pointerType:'self-test'});
          draw();
          const planted=state.plants.find(p=>!p.dead&&p.row===0&&p.col===6&&p.key==='wallnut');
          return {
            ok:!!planted&&state.plants.length===1&&cell?.row===0&&cell?.col===6&&!state.s7.lastRenderErrorMsg,
            plantCount:state.plants.length,cell,plantKey:planted?.key||null,renderError:state.s7.lastRenderErrorMsg||null
          }
        } catch(err) {
          return {ok:false,error:String(err?.stack||err)}
        } finally {
          state=previous.state;tool=previous.tool;selected=previous.selected;glove=previous.glove;
          uid=previous.uid;frameAcc=previous.frameAcc;last=previous.last
        }
      },
      sunflowerTimegrassSmokeTest() {
        const previous={state,uid};
        try {
          newState(false);
          state.running=false;
          state.plants=[];
          state.zombies=[];
          state.s7.sunflowerSuns=[];
          const sunflower=makePlant('sunflower',0,4);
          const timegrass=makePlant('timegrass',0,5);
          sunflower.s7.level=3;
          state.plants.push(sunflower,timegrass);
          const baseCd=s7Cd(timegrass);
          const acted=s7ActSunflower(sunflower);
          // The current production action creates the normal sun. Build one explicit side-sun
          // token here so this smoke test validates the illumination contract deterministically.
          const token=s7SpawnSunflowerSun(sunflower,'side',{
            targetX:timegrass.col+.5,targetCol:timegrass.col,targetPlantId:timegrass.id
          });
          const resolved=!!token&&s7ResolveSunflowerSun(token);
          const boostedCd=s7Cd(timegrass);
          return {
            ok:acted&&resolved&&S7_SUNFLOWER_SHINE_TARGETS.has('timegrass')&&timegrass.s7.shine===S7_SUNFLOWER_RULE.illuminateDuration&&boostedCd<baseCd&&Math.abs(baseCd/boostedCd-S7_SUNFLOWER_RULE.illuminateAttackSpeedMultiplier)<1e-9,
            acted,resolved,targetAllowed:S7_SUNFLOWER_SHINE_TARGETS.has('timegrass'),shine:timegrass.s7.shine||0,
            baseCd,boostedCd,multiplier:baseCd/boostedCd
          }
        } catch(err) {
          return {ok:false,error:String(err?.stack||err)}
        } finally { state=previous.state;uid=previous.uid }
      },
      balloonGroundMotionSmokeTest() {
        const previous={state,uid};
        try {
          newState(false); state.running=false; state.plants=[]; state.zombies=[];
          const z=makeZombie('balloon',0,1.5,{variant:true});
          state.zombies.push(z);
          const popped=popBalloon(z,'自检落地');
          const before=z.x;
          updateZombies(FIXED_FRAME_DT,0);
          const afterWalk=z.x;
          const wallnut=makePlant('wallnut',0,1);
          state.plants.push(wallnut);
          const hpBefore=wallnut.hp;
          updateZombies(FIXED_FRAME_DT,0);
          const bitPlant=wallnut.hp<hpBefore;
          return {
            ok:popped&&!z.air&&z.flags?.air===false&&afterWalk<before&&z.dir===-1&&bitPlant,
            before,afterWalk,afterBite:z.x,air:z.air,flagAir:z.flags?.air,dir:z.dir,speedProfile:z.speedProfile,
            hpBefore,hpAfter:wallnut.hp,bitPlant
          };
        } catch(err) { return {ok:false,error:String(err?.stack||err)} }
        finally {state=previous.state;uid=previous.uid}
      },
      cactusBalloonModeSmokeTest() {
        const previous={state,uid};
        try {
          newState(false); state.running=false; state.plants=[]; state.zombies=[]; state.bullets=[];
          const cactus=makePlant('cactus',0,4), ground=makeZombie('normal',0,3.0), balloon=makeZombie('balloon',0,4.0);
          state.plants.push(cactus); state.zombies.push(ground,balloon);
          const didAir=s7ActCore(cactus);
          const airBullet=state.bullets[0];
          const airClip=s7ResolvePlantAnimation(cactus).clipId;
          const airChosen=airBullet?.targetId===balloon.id&&airBullet?.onlyFlyingBalloon===true&&airClip===S7_VIDEO_SKILL_CLIPS.cactus;
          popBalloon(balloon,'自检落地');
          const rejectsGrounded=!canBulletHitZombie(airBullet,balloon)&&!canBulletHitZombie(airBullet,ground);
          state.bullets=[];
          cactus.s7.videoSkillTimer=0;
          balloon.dead=true;
          const didGround=s7ActCore(cactus);
          const groundBullet=state.bullets[0];
          const groundClip=s7ResolvePlantAnimation(cactus).clipId;
          const normalMode=didGround&&groundBullet?.onlyFlyingBalloon!==true&&groundBullet?.groundOnly===true&&groundClip===S7_VIDEO_SKILL_CLIPS.cactusNormal;
          return {
            ok:didAir&&airChosen&&rejectsGrounded&&normalMode,
            didAir,airTargetId:airBullet?.targetId,balloonId:balloon.id,onlyFlyingBalloon:airBullet?.onlyFlyingBalloon,airClip,rejectsGrounded,
            didGround,groundTargetId:groundBullet?.targetId,groundId:ground.id,groundOnly:groundBullet?.groundOnly,groundClip,normalMode
          };
        } catch(err) { return {ok:false,error:String(err?.stack||err)} }
        finally {state=previous.state;uid=previous.uid}
      },
      cattailPrioritySmokeTest() {
        const previous={state,uid};
        try {
          newState(false); state.running=false; state.plants=[]; state.zombies=[];
          const cattail=makePlant('cattail',2,4), ground=makeZombie('normal',2,1.0), balloon=makeZombie('balloon',4,5.0), laneBalloon=makeZombie('balloon',2,5.5);
          state.plants.push(cattail); state.zombies.push(ground,balloon,laneBalloon);
          const global=s7CattailGlobalTarget(cattail);
          const lane=s7LaneTarget(2,{canHitAir:true,source:cattail,sourceKey:'cattail',preferFlyingBalloon:true});
          state.bullets=[];
          const probe=addBullet({x:4.5,y:2.5,row:2,dx:3,damage:12,kind:'cattailSmall',from:cattail,homing:true,target:ground,airOk:true,strictRow:true,life:8,homingSpeed:3});
          updateBullets(FIXED_FRAME_DT,2);
          const dynamicRetarget=probe.target===laneBalloon&&probe.targetId===laneBalloon.id;
          popBalloon(laneBalloon,'自检落地');
          const afterLanding=s7LaneTarget(2,{canHitAir:true,source:cattail,sourceKey:'cattail',preferFlyingBalloon:true});
          return {
            ok:global===balloon&&lane===laneBalloon&&dynamicRetarget&&afterLanding===ground,
            globalId:global?.id,expectedGlobal:balloon.id,laneId:lane?.id,expectedLane:laneBalloon.id,
            dynamicRetarget,targetAfterRetarget:probe.targetId,afterLandingId:afterLanding?.id,expectedGround:ground.id
          };
        } catch(err) { return {ok:false,error:String(err?.stack||err)} }
        finally {state=previous.state;uid=previous.uid}
      },
      cattailTurretSpeedSmokeTest() {
        const previous={state,uid};
        try {
          newState(false); state.running=false; state.plants=[]; state.zombies=[]; state.bullets=[];
          const cattail=makePlant('cattail',1,4);
          state.plants.push(cattail);
          const turret={row:1,x:4.5,age:0,nextRoundAt:0,roundsFired:0,roundsLeft:S7_CATTAIL_TURRET_RULE.rounds,source:cattail};
          s7FireTurretRound(turret);
          const bullet=state.bullets.find(q=>q&&q.kind==='cattailSmall'&&finiteNumber(q.delay,0)<=0);
          const before=bullet?.x;
          updateBullets(S7_ANIMATION_FIXED_DT,1);
          const after=bullet?.x;
          const delta=finiteNumber(after,0)-finiteNumber(before,0);
          return {
            ok:!!bullet&&Math.abs(delta-.12)<1e-9&&Math.abs(finiteNumber(bullet.homingSpeed,S7_CATTAIL_TURRET_PROJECTILE_SPEED)-S7_CATTAIL_TURRET_PROJECTILE_SPEED)<1e-9,
            before,after,delta,expected:.12,dx:bullet?.dx,homingSpeed:bullet?.homingSpeed,
            fixedDt:S7_ANIMATION_FIXED_DT,cellsPerSecond:S7_CATTAIL_TURRET_PROJECTILE_SPEED
          };
        } catch(err) { return {ok:false,error:String(err?.stack||err)} }
        finally {state=previous.state;uid=previous.uid}
      },
      loadVisualAssets() {
        const ids=[
          ...Object.keys(S7_B06_PROJECTILE_MANIFEST).map(k=>`projectile.b06.${k}`),
          ...Object.keys(S7_BILIBILI_EFFECT_MANIFEST).map(k=>`effect.bili.${k}`),
          'plant.b06.gatling.attack'
        ];
        ids.forEach(id=>S7_SPRITES.image(id));
        return ids
      },
      assetStatus() {
        const ids=[
          ...Object.keys(S7_B06_PROJECTILE_MANIFEST).map(k=>`projectile.b06.${k}`),
          ...Object.keys(S7_BILIBILI_EFFECT_MANIFEST).map(k=>`effect.bili.${k}`),
          'plant.b06.gatling.attack'
        ];
        return ids.map(id=>{const img=S7_SPRITES.image(id);return {id,complete:!!img?.complete,width:img?.naturalWidth||0,height:img?.naturalHeight||0}})
      },
      visualSmokeTest() {
        newState(false);
        state.running=false;
        state.time=1.25;
        state.plants=[];state.zombies=[];state.effects=[];state.bullets=[];
        const kinds=['pea','ice','fire','pult','kernel','butter','melon','winter','star','cattail','cactus','spore','basketball'];
        kinds.forEach((kind,i)=>state.bullets.push({id:9000+i,kind,x:.8+i*.62,y:1.35,dx:1,dy:0,row:1,life:5,dead:false}));
        s7AddSpriteEffect('fumeSpray',2,.8,.9,{rangeCells:4.5,opacity:1});
        s7AddSpriteEffect('gloomPulse',3,4.5,.9,{scale:1.15,opacity:1});
        s7AnimationRenderMode=S7_ANIMATION_RENDER_MODES.TIMELINE;
        draw();
        return {bullets:state.bullets.length,effects:state.effects.length,mode:s7AnimationRenderMode}
      }
    });
    wire()
