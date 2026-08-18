"use strict";

    // -----------------------------------------------------------------------------

    // 核心模拟 / updateZombies

    // [原源码行 6289] 只在僵尸主更新中推进一次，禁止由currentSpeed的多次查询重复计时。

    // [原源码行 6290] 本逻辑帧开始时仍处于踱步阶段，因此即使本帧刚好达到4秒，也从下一帧才移动。

    // [原源码行 6312] 冲刺成长时间只在未被硬控、实际可产生正速度时推进。

    // -----------------------------------------------------------------------------

    // -----------------------------------------------------------------------------

    // 大蒜接触 / 单一入口
    // 每次“离开后重新接触”才结算一次：固定10点啃咬伤害；3阶起同时附加10层剧毒。
    // garlicBitePlantId只用于抑制同一接触的逐帧重复扣血，回到可伤线时必须清除。

    function s7ResetGarlicContact(z) {
      if (z?.s7) delete z.s7.garlicBitePlantId
    }

    function s7HandleGarlicContact(z, p) {
      if (!z || !p || p.dead || p.key !== "garlic") return false;
      z.s7 = z.s7 || {};
      const firstFrameOfContact = z.s7.garlicBitePlantId !== p.id;
      if (firstFrameOfContact) {
        z.s7.garlicBitePlantId = p.id;
        damagePlant(p, 10, z);
        const garlicLevel = p.s7?.level || 0;
        const poisoned = garlicLevel >= 3 && s7ApplyElement(z, "poison", 10, p, {
          ignoreTargetState: true
        });
        addEffect(p.row, p.col + .5, poisoned ? "被咬-10·剧毒+10" : "被咬-10", poisoned ? "#a3e635" :
          "#fca5a5", .45)
      }
      if (!z.garlicFlee && !z.s7KelpPoison) {
        z.garlicFlee = 1;
        z.x += .25;
        addEffect(p.row, p.col + .5, "熏跑去底线", "#a3e635")
      }
      return true
    }

    function s7GroundWalkDirection(z) {
      return -1
    }

    function s7PlantStillBlocksZombie(p, z) {
      if (!p || p.dead || p.s7?.fakeDeath > 0 || p.s7?.deathPending) return false;
      // 胆小菇仅在“正在缩头”时对僵尸不可见；一旦不缩头必须立即恢复阻挡/啃食资格。
      if (!zombieCanTargetPlant(p)) return false;
      if (p.s7?.squashAway && !s7SquashBiteVulnerableAtHome(p, z)) return false;
      return true
    }

    function s7ZombieColdActionRate(z) {
      if (!z || z.dead) return 0;
      const cold = z.s7Elem?.cold;
      if (!(cold > 0)) return 1;
      const floor = 1 - S7_RULES.elements.coldSlowCap;
      const rate = 1 - S7_RULES.elements.coldSlowPerLayer * cold;
      return rate > floor ? rate : floor
    }

    function s7ZombieActionDt(z, dt) {
      return dt > 0 ? dt * s7ZombieColdActionRate(z) : 0
    }

    function s7ZombieActionDuration(z, seconds) {
      return seconds > 0 ? seconds / Math.max(.01, s7ZombieColdActionRate(z)) : 0
    }

    function updateZombies(dt, rowFilter = null, laneZombies = null) {
      updateUmbrellaImpKill(rowFilter);
      s7TallnutAirBlock(rowFilter);
      const zombies = laneZombies || state.zombies;
      const globalLengthBeforePrepass = laneZombies ? state.zombies.length : 0;
      // First-pass snapshot: no array copy, while newly summoned members remain eligible
      // for the second pass just as in the previous two-snapshot implementation.
      const prepassLength = zombies.length;
      for (let i = 0; i < prepassLength; i++) {
        const z = zombies[i];
        if (!z || rowFilter !== null && z.row !== rowFilter) continue;
        if (z.garlicFlee > 0 && z.x >= DAMAGE_BOUNDARY_X) {
          z.garlicFlee = 0;
          s7ResetGarlicContact(z);
          addEffect(z.row, DAMAGE_BOUNDARY_X, "回头", "#a3e635")
        }
        if (z.s7?.summoner) {
          z.s7.summonCd = (z.s7.summonCd || 6) - s7ZombieActionDt(z, dt);
          if (z.s7.summonCd <= 0) {
            z.s7.summonCd = 6;
            if (!canAddZombie(z.row, 2)) {
              addEffect(z.row, Math.min(DAMAGE_BOUNDARY_X, z.x), "召唤延迟", "#fca5a5", .45);
              continue
            }
            for (let i = 0; i < 2; i++) {
              let summonType;
              if (s7BattleRandom() < .5) summonType = s7BattleChoose(S7_ZOMBIE_CATS.summon);
              else summonType = s7BattleChoose(S7_NORMAL_ZOMBIES.filter(k => k !== "garg" && k !== "giga" && !S7_ZOMBIE_CATS
                .summon.includes(k)));
              safePushZombie(makeZombie(summonType, z.row, s7BattleRnd(6, 9), {
                variant: true
              }), "summoner")
            }
            addEffect(z.row, z.x, "战术召唤", "#f0abfc")
          }
        }
        if (z.type === "bobsledSled") {
          if (s7HasCommand("summon", z.row)) s7SpawnBobsledCommandWalkers(z);
          s7ApplyBobsledSledNaturalDecay(z, dt)
        }
        if (z.type === "warflag") z.air = false
      }
      const globalLengthAfterPrepass = state.zombies.length;
      if (laneZombies) s7AppendNewLaneEntities(state.zombies, rowFilter, zombies, globalLengthBeforePrepass);
      s7PrepareFriendlyLaneLookup(rowFilter, zombies);
      const updateLength = zombies.length;
      for (let i = 0; i < updateLength; i++) {
        const z = zombies[i];
        if (!z || rowFilter !== null && z.row !== rowFilter) continue;
        if (z.dead) continue;
        z.s7 = z.s7 || {};
        // 异常免疫僵尸必须先清除寒意等异常，再计算本帧动作时间，避免额外慢一帧。
        if (isAbnormalImmuneZombie(z)) s7ClearAbnormalState(z);
        // 普通僵尸走零分配快路径；只有实际存在寒意层数时才计算倍率。
        const actionRate = z.s7Elem?.cold > 0 ? s7ZombieColdActionRate(z) : 1;
        const actionDt = dt * actionRate;
        if (finiteNumber(z.hitFlashUntil, 0) > 0 && finiteNumber(state?.time, 0) > z.hitFlashUntil) z.hitFlashUntil = 0;
        // B04R: arm-loss visual/state disabled; HP no longer changes walk/bite body.
        s7SyncCommandRowForZombie(z);
        z.s7.timegrassPrevX = z.x;
        z.age += actionDt;
        if (z.type === "immortal" && z.s7.immortalGraveActive) {
          z.s7.immortalGraveRemaining = Math.max(0, finiteNumber(z.s7.immortalGraveRemaining, 1) - actionDt);
          if (z.s7.immortalGraveRemaining > 0) continue;
          z.s7.immortalGraveActive = false;
          z.emoji = z.s7.immortalBodyEmoji || (z.s7.variant ? "✨🧟" : "🧟");
          addEffect(z.row, z.x, z.s7.variant ? "亡唤出土" : "不朽出土", "#d6d3d1", .55)
        }
        // 击退属于独立物理位移，不受寒意/眩晕/冰冻动作倍率影响；每逻辑帧只推进一次。
        s7AdvanceZombieKnockback(z, dt);
        if (z.pogoAirTimer > 0) z.pogoAirTimer = Math.max(0, z.pogoAirTimer - actionDt);
        if (z.flyingImp || z.impLandingPending) {
          z.airTimer = (z.airTimer || 0) - actionDt;
          if (z.airTimer <= 0) {
            if (applyImpLandingStun(z)) continue
          } else {
            continue
          }
        }
        if (z.slow > 0) z.slow -= dt;
        if (z.freeze > 0) z.freeze -= dt;
        if (z.stun > 0) z.stun -= dt;
        if (z.landingInvuln > 0) z.landingInvuln -= dt;
        if (z.s7?.resist > 0) z.s7.resist -= dt;
        if (z.invincible > 0) z.invincible -= dt;
        if (z.s7?.command && !z.s7.commandSpawnResolved && !z.friendly) s7TriggerCommandSpawnOnce(z, "deferred-capacity-retry");
        tickSpeed(z, dt);
        if (z.type === "zomboni") s7RefreshZomboniIceTrails(z);
        // 每帧只校正已经落地的气球状态，不解除正常眩晕/冻结。
        // 防止变种气球落地后仍携带 flags.air 或旧空中锁而永久停滞。
        if (z.type === "balloon" && !z.air) s7NormalizeGroundedBalloon(z, false);
        if (z.type === "ladder") s7RefreshLadderCommandUses(z);
        if (z.type === "football" && !s7HasCommand("break", z.row)) z.s7.footballRunTime = 0
        if (s7HasCommand("push", z.row) && (z.type === "wallz" || z.type === "tallz")) {
          s7RegenZombieAllPools(z, 10, dt)
        }
        if (z.dying && !z.noCrit) {
          z.hp -= 100 * actionDt;
          if (z.hp <= 0) {
            killZombie(z, {
              noCritical: true
            });
            continue
          }
          continue
        }
        if (z.flags.bungee) {
          updateBungee(z, actionDt);
          continue
        }
        if (updateNewspaperRageState(z, actionDt)) continue;
        if (z.friendly) {
          // 魅惑僵尸：向右移动，攻击遇到的敌方僵尸
          const hostile = nearestHostileAt(z.row, z.x);
          if (hostile && Math.abs(hostile.x - z.x) < 0.48) {
            // 攻击敌方僵尸
            z.attackCd = (z.attackCd || 0) - actionDt;
            if (z.attackCd <= 0) {
              z.attackCd = 0.04;
              if (typeof damageZombie === "function") {
                damageZombie(hostile, 4, {
                  source: undefined,
                  zombieAttacker: z,
                  noTeam: true,
                  noCritical: true
                });
              }
            }
          } else {
            z.x += currentSpeed(z, dt) * dt * 0.6;
            if (z.x > COLS + 0.6) z.dead = true;
          }
          continue;
        }
        if (updatePoleCommanderState(z, actionDt)) continue;
        z.s7KelpTargeting = false;
        if (z.s7KelpGrabbed) {
          if (z.s7KelpGrabbedBy?.dead) s7KelpReleaseTarget(z, false);
          else continue
        }
        // 巨人投掷状态机统一先于通用硬控返回：
        // - 尚未进入前摇且被控：不会开始；随后由硬控分支结束本帧。
        // - 已在前摇且被控：状态机返回true并暂停倒计时，绝不移动、砸击、反锤或投出小鬼。
        if (s7UpdateGargThrowWindup(z, actionDt)) continue;
        if (s7UpdateGargSmashWindup(z, actionDt)) continue;
        if (zombieIsHardControlled(z)) continue;
        if (s7BackupShouldWaitForDancer(z)) continue;
        if (!z.underground && trySpikerockPunctureVehicle(z)) continue;
        if (!z.underground && (z.vehicle || z.flags?.garg) && tryShadowSpikeHeavyContact(z, actionDt)) continue;
        if (z.flags.catapult) {
          updateCatapult(z, dt, actionDt);
          continue
        }
        if (z.flags.shooter || z.flags.jalapeno) {
          const handled = updateShooterZombie(z, actionDt);
          if (handled) continue
        }
        if (z.flags.jack && !z.s7?.boxStolen) {
          z.jackCd -= actionDt;
          if (z.jackCd <= 0) {
            s7JackExplosion(z);
            continue
          }
        }
        if (z.flags.dancer && !z.summoned && z.age > TIMES.dancerNaturalSummon) {
          summonDancers(z);
          z.summoned = true;
          z.speed = SPEEDS.ordinary;
          setSpeedProfile(z, "ordinary", true)
        }
        if (z.flags.digger && z.underground && tallnutInterceptUndergroundDigger(z)) continue;
        if (z.flags.digger && z.underground) {
          const naturalSurface = s7NaturalDiggerSurfaceEvent(z);
          if (naturalSurface) {
            z.x = naturalSurface.x;
            surfaceDigger(z, naturalSurface.reason)
          }
        }
        if (zombieIsHardControlled(z)) continue;
        if (z.type === "yeti" && z.fleeing) {
          z.x += currentSpeed(z, dt) * dt;
          if (z.x > S7_YETI_RULE.fleeExitX) {
            addEffect(z.row, Math.min(z.x, COLS + .8), "雪人逃脱", "#67e8f9");
            log("雪人僵尸成功逃脱。");
            z.dead = true
          }
          continue
        }
        if (z.garlicFlee > 0) {
          z.x += currentSpeed(z, dt) * dt;
          if (z.x >= DAMAGE_BOUNDARY_X) {
            z.x = DAMAGE_BOUNDARY_X;
            z.garlicFlee = 0;
            s7ResetGarlicContact(z);
            addEffect(z.row, DAMAGE_BOUNDARY_X, "到可伤线回头", "#a3e635")
          }
          continue
        }
        if (!state.teams[z.row].alive) continue;
        let ftarget = nearestFriendlyAt(z.row, z.x);
        if (ftarget && !z.underground && (z.flags?.garg || !canZombiePassPlant(z))) {
          if (z.type === "football") z.s7.footballRunTime = 0;
          if (z.flags?.garg) s7LockGargSmashTarget(z, ftarget, "zombie");
          else {
            // 普通僵尸啃咬魅惑僵尸
            z.attackCd = (z.attackCd || 0) - actionDt;
            if (z.attackCd <= 0) {
              z.attackCd = 0.04;
              if (typeof damageFriendlyZombie === "function") damageFriendlyZombie(ftarget, 4, z, { noCritical: true, noTeam: true });
            }
          }
          continue
        }
        if (hasPogo(z)) {
          if (z.pogoChargeTime > 0) {
            z.pogoChargeTime -= actionDt;
            if (z.pogoChargeTime > 0) continue;
            const jumpFromX = z.x;
            const jumpToX = z.x - 2;
            const crossedTallnut = state.plants.filter(p => !p.dead && p.key === "tallnut" && p.row === z.row && p.col +
              .5 <= jumpFromX && p.col + .5 >= jumpToX).sort((a, b) => b.col - a.col)[0];
            if (crossedTallnut) {
              z.armors = z.armors.filter(a => a.name !== "跳跳杆");
              z.x = crossedTallnut.col + 1.05;
              z.pogoAirTimer = 0;
              addEffect(z.row, z.x, "高坚果拦跳", "#fde68a");
              continue
            }
            z.x = jumpToX;
            z.pogoAirTimer = .25;
            let interval = TIMES.pogoJumpInterval;
            if (s7HasCommand("raid", z.row)) interval *= .7;
            z.pogoCd = interval;
            addEffect(z.row, z.x, "蓄力跳", "#fde68a");
            if (jumpFromX >= 6 && s7BattleRandom() < .2) {
              let nr = Math.floor(s7BattleRandom() * ROWS);
              if (nr !== z.row) {
                addEffect(z.row, z.x, "换行", "#fde68a");
                z.row = nr
              }
            }
            if (!z.friendly && z.x < -.35 && !z.dying) defeatLane(z.row);
            if (z.friendly && z.x > COLS + .6) z.dead = true;
            continue
          }
          if (z.pogoCd === undefined) z.pogoCd = 0;
          if (z.pogoCd > 0) z.pogoCd -= actionDt;
          let sp = currentSpeed(z, dt);
          let target = firstPlantAt(z.row, z.x, {
            vehicle: z.vehicle,
            ordinaryBiteOnly: false,
            zombie: z
          });
          if (target && z.pogoCd <= 0 && Math.abs(z.x - (target.col + .5)) < 1.2) {
            if (s7KillIfUmbrellaProtectedPlantContact(z, target, "保护伞秒杀跳跳")) continue;
            if (PLANTS[target.key].tall) {
              z.armors = z.armors.filter(a => a.name !== "跳跳杆");
              addEffect(z.row, z.x, "跳杆被挡", "#fde68a")
            } else if (z.s7?.variant) {
              const requiredBounces = s7HasCommand("raid", z.row) ? 1 : 2;
              z.s7.pogoStationaryBounces = (z.s7.pogoStationaryBounces || 0) + 1;
              if (z.s7.pogoStationaryBounces <= requiredBounces) {
                z.pogoAirTimer = .2;
                z.pogoCd = TIMES.pogoJumpInterval;
                addEffect(z.row, z.x, `原地弹跳${z.s7.pogoStationaryBounces}/${requiredBounces}`, "#fbbf24")
              } else {
                z.s7.pogoStationaryBounces = 0;
                z.pogoChargeTime = FIXED_FRAME_DT;
                addEffect(z.row, z.x, "跳2格", "#fbbf24")
              }
              continue
            } else {
              z.x = target.col - .5;
              z.pogoAirTimer = .25;
              let interval = TIMES.pogoJumpInterval;
              if (s7HasCommand("raid", z.row)) interval *= .7;
              z.pogoCd = interval;
              addEffect(z.row, z.x, "跳跃", "#fde68a");
              if (z.x >= 6 && s7BattleRandom() < .2) {
                let nr = Math.floor(s7BattleRandom() * ROWS);
                if (nr !== z.row) {
                  addEffect(z.row, z.x, "换行", "#fde68a");
                  z.row = nr
                }
              }
            }
          }
          z.x -= sp * dt;
          if (!z.friendly && z.x < -.35 && !z.dying) defeatLane(z.row);
          if (z.friendly && z.x > COLS + .6) z.dead = true;
          continue
        }
        if (z.jumpMove > 0) {
          let jsp = z.jumpSpeed || SPEEDS.poleJump;
          z.x -= jsp * actionDt;
          z.jumpMove -= jsp * actionDt;
          if (z.type === "polecmd" && z.x <= .05) {
            z.jumpMove = 0;
            z.jumping = false;
            addEffect(z.row, Math.max(.1, z.x), "跳出场外坠亡", "#f87171");
            killZombie(z, {
              noCritical: true,
              noTransform: true
            });
            continue
          }
          if (z.jumpMove <= 0) {
            if (s7KillZombieByUmbrella(z, "保护伞秒杀落下")) continue;
            z.jumping = false;
            z.jumped = true;
            z.jumpMove = 0;
            setSpeedProfile(z, "ordinary", true);
            addEffect(z.row, z.x, "落地", "#fde68a")
          }
          continue
        }
        if (z.stun > 0) continue;
        let p = frontPlantForZombie(z);
        if (p && z.type === "snorkel" && z.diving && s7HasCommand("raid", z.row) && z.x < 5.25) {
          p = null
        }
        if (z.flags.squash && z.s7?.squashZWindup) {
          z.s7.squashZWindupTimer -= actionDt;
          if (z.s7.squashZWindupTimer <= 0) {
            const target = state.plants.find(q => !q.dead && q.id === z.s7.squashZTargetId);
            if (target) {
              applySmashOrCrushDamage(z, target, "crush");
              addEffect(z.row, z.x, "窝瓜僵尸碾压", "#a3e635")
            }
            killZombie(z, { noCritical: true });
            continue
          }
          continue
        }
        if (p && !z.underground) {
          if (z.type === "football") z.s7.footballRunTime = 0;
          if (z.type === "snorkel") surfaceSnorkelAtPlant(z, p);
          else if (z.diving) {
            z.diving = false;
            z.surfaced = true;
            addEffect(z.row, z.x, "浮出水面", "#93c5fd")
          }
          if (trySpecialContact(z, p, actionDt)) continue;
          if (s7HandleGarlicContact(z, p)) continue;
          if (z.s7KelpPoison) continue;
          if (z.type === "immortal" && z.s7?.immortalFirstBiteWindupPending) {
            z.s7.immortalFirstBiteWindupRemaining = Math.max(0, finiteNumber(z.s7.immortalFirstBiteWindupRemaining, 1) - actionDt);
            if (z.s7.immortalFirstBiteWindupRemaining > 0) continue;
            z.s7.immortalFirstBiteWindupPending = false;
            z.s7.immortalFirstBiteWindupUsed = true;
            addEffect(z.row, z.x, "召唤不朽前摇完成", "#d6d3d1", .4)
          }
          if (z.type === "newspaper") {
            // B02B: attack cadence is generated by animation events. This remains active
            // in both visual render modes because the timeline is a gameplay clock, not a renderer.
            z.s7 = z.s7 || {};
            z.s7.newspaperAttackTargetId = p.id;
            z.attackCd = 0
          } else {
            z.attackCd -= actionDt;
            if (z.attackCd <= 0) {
              let biteInterval = .04;
              let biteDmg = 4;
              if (s7HasCommand("break", z.row) && (z.type === "football" || z.type === "blackolive")) biteDmg = 4 * 1.3;
              if (z.s7?.variant && z.type === "football" || z.type === "blackolive") biteDmg *= 1.2;
              if (z.type === "football" || z.type === "blackolive") biteDmg = Math.floor(biteDmg);
              if (z.flags?.digger && z.s7?.variant) biteDmg *= 1.5;
              z.attackCd = biteInterval;
              damagePlant(p, biteDmg, z)
            }
          }
          // 目标仍存在时继续啃食；若本次啃咬刚好吃掉/使其进入不可阻挡状态，
          // 本逻辑帧立即恢复行走，避免落地气球与出土矿工卡在已经清空的格子。
          if (s7PlantStillBlocksZombie(p, z)) continue;
          if (z.type === "snorkel" && z.surfaced && !z.diving) {
            z.diving = true;
            z.surfaced = false;
            addEffect(z.row, z.x, "重新潜水", "#93c5fd")
          }
          if (!(z.type === "balloon" && !z.air) && !(z.flags?.digger && !z.underground)) continue;
          z.attackCd = 0
        }
        if (z.flags.digger && z.underground) {
          const oldX = z.x;
          z.x -= currentSpeed(z, dt) * dt;
          damageDiggerRoots(z, oldX, z.x);
          if (z.dead || !z.underground) continue;
          if (z.x <= .2) {
            surfaceDigger(z, "进家前出土");
            z.dir = 1;
            z.friendly = false
          }
          continue
        }
        if (z.flags.air && z.type === "balloon" && z.x <= (z.s7?.variant ? 1.5 : 4)) {
          if (z.s7?.variant) z.x = 1.5;
          popBalloon(z, "自动落地")
        }
        if (z.type === "bobsled" && z.s7?.variantSledMember) {
          const aliveVariantMembers = state.zombies.filter(q => !q.dead && q.type === "bobsled" && q.s7?.sledGroupId ===
            z.s7.sledGroupId);
          if (aliveVariantMembers.length <= 1 && z.s7.sledSummonCount < 3) {
            z.s7.sledSummonCd -= actionDt;
            if (z.s7.sledSummonCd <= 0) {
              z.s7.sledSummonCd = 6;
              z.s7.sledSummonCount++;
              const newMember = makeZombie("bobsled", z.row, clamp(z.x + .5, 0, COLS - .2));
              if (z.friendly) {
                newMember.friendly = true;
                newMember.dir = 1
              }
              newMember.s7 = newMember.s7 || {};
              newMember.s7.sledGroupId = z.s7.sledGroupId;
              newMember.s7.variantSledMember = true;
              newMember.s7.sledSummonCount = z.s7.sledSummonCount;
              newMember.s7.sledSummonCd = 6;
              newMember.name = "雪橇召唤成员";
              safePushZombie(newMember, "sled-member");
              addEffect(z.row, z.x + .5, "雪橇召唤", "#c7d2fe")
            }
          }
        }
        const moveOldX = z.x;
        const groundWalkDir = s7GroundWalkDirection(z);
        const moveNextX = z.x + groundWalkDir * currentSpeed(z, dt) * dt;
        if (!z.friendly && z.type === "snorkel") {
          const crossedPlant = snorkelBlockingPlantCrossed(z, moveOldX, moveNextX);
          if (crossedPlant) {
            const crossX = crossedPlant.col + .5;
            if (!(z.diving && s7HasCommand("raid", z.row) && crossX < 5.25)) {
              z.x = crossedPlant.col + .999;
              surfaceSnorkelAtPlant(z, crossedPlant, "遇植物浮出");
              continue
            }
          }
        }
        z.x = moveNextX;
        if (z.type === "football" && s7HasCommand("break", z.row) && moveNextX < moveOldX - 1e-9) {
          z.s7.footballRunTime = (z.s7.footballRunTime || 0) + actionDt
        }
        if (!z.friendly && groundWalkDir < 0 && z.x < -.35 && !z.dying) defeatLane(z.row);
        // 自然出土矿工向右返回；走出右侧边界后直接离场，不触发本路失败。
        if (!z.friendly && groundWalkDir > 0 && z.x > COLS + .6) z.dead = true;
        if (z.friendly && z.x > COLS + .6) z.dead = true
      }
      // Dead entities are compacted once after all lane turns.
      // Return the post-prepass boundary so the caller can expose main-pass summons to friendlies.
      return globalLengthAfterPrepass
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / currentSpeed

    // [原源码行 6326] 伞的空中单位判定优先于高坚果拦飞，避免处于伞区的气球/跳跃单位

    // [原源码行 6327] 被高坚果先强制落地，从而绕过伞的直接弹飞结算。

    // [原源码行 6384] 仍在空中，跳过移动和攻击

    // [原源码行 6394] 突破指令增益：橄榄球僵尸奔跑时间累积（移速随时间增加上限2倍）

    // [原源码行 6402] 防护指令增益：坚果墙5/s、高坚果10/s 自回血

    // [原源码行 6417] 蹦极处于无敌等待状态，不接受眩晕/冻结，也不区分敌我侧跳过逻辑。

    // [原源码行 6422] 读报破报后的暴怒前摇必须先于移动、啃咬和特殊接触判定。

    // [原源码行 6431] 眩晕/冻结检查必须位于其余主动行为之前，防止投篮、射击、

    // [原源码行 6432] 小丑爆炸、舞王召唤等在硬控期间继续执行。

    // [原源码行 6434] 地刺王/暗影地刺对冰车和投篮车的接触秒杀必须早于投篮车专用更新，

    // [原源码行 6435] 否则投篮车会因提前continue而永远绕过地刺判定。

    // [原源码行 6509] 重型单位与暗影地刺的接触已在主动行为分支之前统一结算。

    // [原源码行 6642] 每次真正接触一株大蒜只结算一次固定10点啃咬伤害；

    // [原源码行 6643] 不使用普通4/厘秒持续啃咬，也不能出现完全不掉血。

    // -----------------------------------------------------------------------------

    function s7RaidCommandSpeedAura(row) {
      if (!state || !Number.isInteger(row)) return 0;
      let best = 0;
      for (const q of state.zombies || []) {
        if (!q || q.dead || q.row !== row || q.type !== "polecmd" || !q.s7?.command || q.s7?.category !== "raid") continue;
        const denom = Math.max(1, finiteNumber(q.maxHp, q.hp || 1) + finiteArray(q.armors).reduce((sum, a) => sum + Math.max(0, finiteNumber(a?.max, a?.hp || 0)), 0));
        best = Math.max(best, clamp(totalHp(q) / denom, 0, 1))
      }
      return best * .2
    }

    function s7IsRaidCategoryZombie(z) {
      // 小鬼不进入普通自然盲盒池，但作为巨人投掷单位享受奇袭类动态光环。
      return !!(z && (S7_ZOMBIE_CATS.raid.includes(z.type) || z.type === "imp"))
    }

    function currentSpeed(z, dt = FIXED_FRAME_DT) {
      if (isAbnormalImmuneZombie(z)) s7ClearAbnormalState(z);
      let sp;
      if (z.fleeing) sp = z.speed || SPEEDS.flee || .5;
      else if (z.vehicle && (z.type === "zomboni" || z.flags?.catapult && z.drive)) {
        if (z.x > 6) sp = SPEEDS.zomboni1;
        else if (z.x > 4) sp = SPEEDS.zomboni2;
        else if (z.x > 2) sp = SPEEDS.zomboni3;
        else sp = SPEEDS.zomboni4
      } else sp = z.speedNow || z.speed || SPEEDS.ordinary;
      const e = s7Elem(z);
      if (e.cold > 0) {
        const floor = 1 - S7_RULES.elements.coldSlowCap;
        const rate = 1 - S7_RULES.elements.coldSlowPerLayer * e.cold;
        sp *= rate > floor ? rate : floor
      }
      if (e.iceBound > 0) sp = 0;
      if (z.type === "newspaper") {
        if (s7HasCommand("break", z.row)) sp *= 1.2;
        if (z.s7?.variant) sp *= 1.2;
        if (z.enraged) {
          if (z.s7?.newspaperRagePhase !== "sprinting") sp = 0;
          else sp *= 5;
          if (z.s7?.variant && z.s7?.rageStacks > 0) sp *= 1 + Math.min(1, z.s7.rageStacks * .1)
        }
      }
      if (z.s7?.variant) {
        if (z.type === "bucket") sp *= 3;
        if (z.type === "pole") sp *= 1.3;
        if (z.type === "backup") sp *= 2;
        if (z.type === "balloon") sp *= 2;
        if (z.type === "gatlingz") sp *= 1.5;
        if (z.type === "ladder") sp *= 1.3
      }
      if (z.s7?.charged) sp *= 1.2;
      if (z.s7?.superGiga) sp *= 1 / 3;
      // 防御性约束：即使其他查询路径读取速度，投掷前摇中的巨人也必须保持静止。
      if (z.flags?.garg && z.s7?.gargThrowPhase === "windup") sp = 0;
      if (z.type === "polecmd") {
        if (z.s7?.poleCommandPhase !== "sprinting") {
          sp = 0
        } else {
          const runTime = Math.max(0, finiteNumber(z.s7?.poleCommandSpeedTime, finiteNumber(z.s7?.poleCommandRunTime,
            0)));
          const sprintBase = Math.max(0, sp) * POLE_COMMAND_RULE.sprintInitialMultiplier;
          sp = Math.min(POLE_COMMAND_RULE.sprintSpeedCapBeforeGlobalScale, sprintBase * Math.pow(POLE_COMMAND_RULE
            .sprintGrowthPerSecond, runTime))
        }
      }
      if (z.row != null && s7HasCommand("raid", z.row)) {
        if (z.type === "pole") sp *= 1.2;
        else if (z.type === "dolphin") sp *= 1.4;
        else if (z.type === "balloon") sp *= 1.2;
        else if (z.type === "snorkel") sp *= 1.3;
        if (s7IsRaidCategoryZombie(z) || z.type === "polecmd") sp *= 1 + s7RaidCommandSpeedAura(z.row)
      }
      if (z.row != null && s7HasCommand("push", z.row)) {
        if (z.type === "backup") sp *= 1.5;
        if (z.type === "bucket") sp *= 1.3
      }
      if (z.row != null && s7HasCommand("break", z.row)) {
        if (z.type === "football") {
          const rt = z.s7?.footballRunTime || 0;
          sp *= Math.min(2, 1 + rt * .2)
        }
        if (z.type === "ladder") sp *= 1.2;
        if (z.type === "squashz") sp *= 1.3;
        if (s7ZombieOnIceTrail(z)) sp *= 1.3
      }
      return sp * .9
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / applySmashOrCrushDamage

    // [原源码行 6767] 普通读报破报前保持普通速度；破报前摇结束后严格变为2倍速。

    // [原源码行 6768] 变种读报额外保留文档规定的基础移速+20%与受击怒气成长。

    // [原源码行 6805] 奇袭司令（撑杆司令）：在场时为非奇袭类僵尸提升移速

    // [原源码行 6813] 奇袭指令增益：撑杆+20%、海豚+40%、气球+20% 移速

    // [原源码行 6819] 防护指令增益

    // [原源码行 6824] 突破指令增益

    // [原源码行 6826] 暴怒僵尸（报纸破报后）移速再次+20%

    // [原源码行 6828] 橄榄球僵尸处于奔跑状态时移速随时间增加，上限2倍

    // [原源码行 6833] 扶梯僵尸指令增益移速+20%

    // [原源码行 6835] 倭瓜僵尸移速+20%

    // [原源码行 6837] 冰道指令增益：所有处于冰道上的僵尸移速+30%

    // -----------------------------------------------------------------------------

    // -----------------------------------------------------------------------------

    // 巨人砸击 / 统一前摇状态机
    // 一旦开始举锤，本次动画不会因击退或目标离开而重置。巨人继续停下完成
    // 举锤→落锤→收锤；命中帧再校验目标，失去接触时只砸空，不补伤害。

    function s7ClearGargSmashTarget(z) {
      if (!z || z.dead || !z.flags?.garg || !z.s7 || z.s7.gargSmashTargetId == null) return false;
      delete z.s7.gargSmashTargetId;
      delete z.s7.gargSmashTargetKind;
      delete z.s7.gargSmashTargetRow;
      delete z.s7.gargSmashTargetCol;
      delete z.s7.gargSmashLockedX;
      delete z.s7.gargSmashInterruptedFrame;
      z.attackCd = TIMES.gargHammer;
      return true
    }

    const S7_KNOCKBACK_DURATION = 1;
    const S7_KNOCKBACK_DECAY = 8;

    // 所有“击退”统一进入速度脉冲：v(t)=C*e^(-kt)，持续1秒。
    // C按积分归一化，因此在未触碰场地边界时，0~1秒的位移积分严格等于旧版击退距离。
    function s7QueueZombieKnockback(z, distance, opt = {}) {
      const amount = finiteNumber(distance, 0);
      if (!z || z.dead || Math.abs(amount) <= 1e-9) return 0;
      const before = finiteNumber(z.x, 0);
      const minX = Number.isFinite(opt.minX) ? opt.minX : -1;
      const maxX = Number.isFinite(opt.maxX) ? opt.maxX : COLS + .3;
      const allowed = clamp(before + amount, minX, maxX) - before;
      if (Math.abs(allowed) <= 1e-9) return 0;
      z.s7KnockbackImpulses = finiteArray(z.s7KnockbackImpulses);
      z.s7KnockbackImpulses.push({
        distance: allowed,
        elapsed: 0,
        duration: S7_KNOCKBACK_DURATION,
        decay: S7_KNOCKBACK_DECAY,
        minX,
        maxX,
        reason: opt.reason || "击退"
      });
      return allowed
    }

    function s7MoveZombieByKnockback(z, nextX, opt = {}) {
      if (!z || z.dead || !Number.isFinite(nextX)) return 0;
      return s7QueueZombieKnockback(z, nextX - finiteNumber(z.x, 0), opt)
    }

    function s7ApplyZombieKnockback(z, distance, opt = {}) {
      return s7QueueZombieKnockback(z, distance, opt)
    }

    function s7AdvanceZombieKnockback(z, dt) {
      const impulses = finiteArray(z?.s7KnockbackImpulses);
      if (!z || z.dead || !impulses.length || !(dt > 0)) return 0;
      let totalMoved = 0;
      const keep = [];
      for (const imp of impulses) {
        const distance = finiteNumber(imp?.distance, 0);
        const duration = Math.max(1e-6, finiteNumber(imp?.duration, S7_KNOCKBACK_DURATION));
        const decay = Math.max(1e-6, finiteNumber(imp?.decay, S7_KNOCKBACK_DECAY));
        const t0 = clamp(finiteNumber(imp?.elapsed, 0), 0, duration);
        const t1 = Math.min(duration, t0 + dt);
        if (Math.abs(distance) <= 1e-12 || t1 <= t0) continue;
        const norm = 1 - Math.exp(-decay * duration);
        const step = distance * (Math.exp(-decay * t0) - Math.exp(-decay * t1)) / norm;
        const before = finiteNumber(z.x, 0);
        const minX = Number.isFinite(imp.minX) ? imp.minX : -1;
        const maxX = Number.isFinite(imp.maxX) ? imp.maxX : COLS + .3;
        z.x = clamp(before + step, minX, maxX);
        const moved = z.x - before;
        totalMoved += moved;
        // 触边后沿用旧版“最多推到边界”的口径，不再保留未完成的越界位移。
        const blocked = Math.abs(moved - step) > 1e-9;
        if (!blocked && t1 < duration - 1e-12) {
          imp.elapsed = t1;
          keep.push(imp)
        }
      }
      if (keep.length) z.s7KnockbackImpulses = keep;
      else delete z.s7KnockbackImpulses;
      return totalMoved
    }

    function s7LockGargSmashTarget(z, target, kind = "plant") {
      if (!z || z.dead || !z.flags?.garg || !target || target.dead) return false;
      z.s7 = z.s7 || {};
      // 已经举锤时不换锁、不重置倒计时。
      if (z.s7.gargSmashTargetId != null) return true;
      z.s7.gargSmashTargetId = target.id;
      z.s7.gargSmashTargetKind = kind === "zombie" ? "zombie" : "plant";
      z.s7.gargSmashTargetRow = target.row;
      z.s7.gargSmashTargetCol = target.col;
      z.s7.gargSmashLockedX = finiteNumber(z.x, 0);
      z.attackCd = TIMES.gargHammer;
      return true
    }

    function s7GargLockedPlant(z) {
      if (!z?.s7 || z.s7.gargSmashTargetKind !== "plant") return null;
      return finiteArray(state?.plants).find(p => p && !p.dead && p.id === z.s7.gargSmashTargetId) || null
    }

    function s7GargLockedZombie(z) {
      if (!z?.s7 || z.s7.gargSmashTargetKind !== "zombie") return null;
      return finiteArray(state?.zombies).find(q => q && !q.dead && q.id === z.s7.gargSmashTargetId) || null
    }

    function s7GargStillHasLockedPlant(z, p = s7GargLockedPlant(z)) {
      if (!z || !p || p.dead || z.s7?.gargSmashTargetId !== p.id) return false;
      if (!s7PlantStillBlocksZombie(p, z)) return false;
      const front = frontPlantForZombie(z);
      return !!front && front.id === p.id
    }

    function s7GargStillHasLockedZombie(z, target = s7GargLockedZombie(z)) {
      if (!z || !target || target.dead || target.row !== z.row) return false;
      if (!!target.friendly === !!z.friendly) return false;
      return Math.abs(finiteNumber(target.x, Infinity) - finiteNumber(z.x, -Infinity)) < .46
    }

    function s7UpdateGargSmashWindup(z, dt) {
      if (!z || z.dead || !z.flags?.garg || z.s7?.gargSmashTargetId == null) return false;
      // 硬控暂停整段动作；解除后从原进度继续。
      if (zombieIsHardControlled(z) || z.s7?.gargThrowPhase === "windup") return true;
      z.attackCd = Math.max(0, finiteNumber(z.attackCd, TIMES.gargHammer) - Math.max(0, finiteNumber(dt, 0)));
      if (z.attackCd > 1e-9) return true;

      const kind = z.s7.gargSmashTargetKind || "plant";
      let hit = false;
      if (kind === "zombie") {
        const target = s7GargLockedZombie(z);
        if (s7GargStillHasLockedZombie(z, target)) {
          s7GargZombieHammerAoe(z, target, { hitFriendly: !z.friendly });
          hit = true
        } else {
          // 目标已离开时仍在当前位置完成落锤，可命中仍处于锤击范围内的对立僵尸。
          hit = s7GargZombieHammerAoe(z, z, { hitFriendly: !z.friendly }) > 0
        }
      } else {
        const plant = s7GargLockedPlant(z);
        if (s7GargStillHasLockedPlant(z, plant)) {
          applySmashOrCrushDamage(z, plant, "smash");
          hit = true
        }
        // 与旧植物砸击一致：落锤同时对当前位置附近双方僵尸结算群锤。
        s7GargZombieHammerAoe(z, z, { hitFriendly: true });
        s7GargZombieHammerAoe(z, z, { hitFriendly: false })
      }
      addEffect(z.row, z.x, hit ? "巨人落锤" : "巨人砸空", hit ? "#f87171" : "#94a3b8", .55);
      s7ClearGargSmashTarget(z);
      return true
    }

    function applySmashOrCrushDamage(z, p, kind) {
      if (!p || p.dead || zombieIsHardControlled(z)) return;
      if (z?.flags?.garg && z.s7?.gargThrowPhase === "windup") return;
      if (z) {
        z.s7 = z.s7 || {};
        const impactKey = `${p.id||`${p.row}:${p.col}`}:${kind}`;
        if (z.s7.heavyImpactFrame === (state?.frame ?? -1) && z.s7.heavyImpactKey === impactKey) return;
        z.s7.heavyImpactFrame = state?.frame ?? -1;
        z.s7.heavyImpactKey = impactKey
      }
      let dmg = 99999;
      let label = kind === "smash" ? "砸击" : "碾压";
      const impactRule = S7_HEAVY_IMPACT_RULES[p.key];
      if (impactRule) {
        dmg = impactRule[kind];
        label = `${impactRule.name}${kind==="smash"?"抗砸":"抗压"}${dmg}`
      }
      damagePlant(p, dmg, z);
      addEffect(p.row, p.col + .5, label, kind === "smash" ? "#f87171" : "#fde68a");
      if (p.key === "tallnut" && kind === "crush" && z && !z.dead && (z.type === "zomboni" || z.type === "catapult")) {
        const targetX = Math.min(COLS + .3, Math.max(z.x + 1.25, p.col + 1.75));
        s7MoveZombieByKnockback(z, targetX, { maxX: COLS + .3, reason: "高坚果车辆击退" });
        z.attackCd = Math.max(z.attackCd || 0, 1);
        addEffect(z.row, z.x, z.type === "catapult" ? "投篮车被高坚果击退" : "冰车被高坚果击退", "#d8b4fe")
      } else if (p.key === "gloom" && kind === "crush" && z && !z.dead && z.type === "zomboni") {
        const targetX = Math.min(COLS + .3, Math.max(z.x + .625, p.col + 1.125));
        s7MoveZombieByKnockback(z, targetX, { maxX: COLS + .3, reason: "忧郁菇车辆击退" });
        z.attackCd = Math.max(z.attackCd || 0, .75);
        addEffect(z.row, z.x, "曾哥击退冰车0.625格", "#c084fc", .5)
      } else if (p.key === "chomper" && kind === "crush" && z && !z.dead && z.type === "zomboni") {
        const targetX = Math.min(COLS + .3, Math.max(z.x + .625, p.col + 1.125));
        s7MoveZombieByKnockback(z, targetX, { maxX: COLS + .3, reason: "大嘴花车辆击退" });
        z.attackCd = Math.max(z.attackCd || 0, .75);
        addEffect(z.row, z.x, "大嘴花击退冰车0.625格", "#fca5a5", .5)
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / trySpecialContact

    // [原源码行 6850] 同一只僵尸在同一逻辑帧内只能对同一株植物结算一次砸击/碾压，

    // [原源码行 6851] 防止车辆接触判定或补帧重复调用造成高坚果瞬间被多次扣血。

    // [原源码行 6887] 高坚果明确防住冰车与投篮车的碾压：每次只承受固定1000伤害，

    // [原源码行 6888] 并把车辆向右击退1.25格，避免同一接触点连续碾压形成“瞬杀”。

    // [原源码行 6904] 忧郁菇对砸击与碾压都固定承受500伤害；只有冰车碾压会触发击退。

    // -----------------------------------------------------------------------------

    function trySpecialContact(z, p, dt) {
      if (zombieIsHardControlled(z)) return true;
      if (z.flags.squash && z.s7?.squashZWindup) return true;
      if (z.flags.garg) {
        s7LockGargSmashTarget(z, p, "plant");
        return true
      }
      if (z.vehicle) {
        z.attackCd -= dt;
        if (z.attackCd <= 0) {
          z.attackCd = .45;
          applySmashOrCrushDamage(z, p, "crush")
        }
        return true
      }
      if (s7KillIfUmbrellaProtectedPlantContact(z, p, "保护伞秒杀起跳")) return true;
      if ((z.flags.pole || z.flags.dolphin) && !z.jumped) {
        if (z.type === "polecmd") {
          const commanderSpeed = currentSpeed(z, dt);
          if (p.key === "tallnut" && commanderSpeed < POLE_COMMAND_RULE.tallnutVaultThreshold) {
            z.jumping = false;
            z.jumped = true;
            z.jumpMove = 0;
            z.speed = SPEEDS.ordinary;
            setSpeedProfile(z, "ordinary", true);
            addEffect(p.row, p.col + .5, "高坚果拦司令", "#fde68a");
            return false
          }
          const takeoffCol = p?.col ?? Math.floor(z.x);
          if (takeoffCol <= 0 || z.x <= 1.05) {
            addEffect(z.row, Math.max(.15, z.x), "一列起跳坠亡", "#f87171");
            killZombie(z, {
              source: p,
              noCritical: true,
              noTransform: true
            });
            return true
          }
          const runTime = Math.max(0, finiteNumber(z.s7?.poleCommandSpeedTime, finiteNumber(z.s7?.poleCommandRunTime,
            0)));
          const jumpDistance = Math.min(POLE_COMMAND_RULE.jumpDistanceCap, POLE_COMMAND_RULE.jumpInitialDistance +
            runTime * POLE_COMMAND_RULE.jumpGrowthPerSecond);
          z.jumping = true;
          z.jumped = true;
          z.jumpMove = jumpDistance;
          z.jumpSpeed = Math.max(SPEEDS.poleJump * 2, commanderSpeed, 1.1);
          z.speed = SPEEDS.ordinary;
          setSpeedProfile(z, "ordinary", true);
          addEffect(z.row, z.x, `司令跳${jumpDistance.toFixed(2)}格`, "#fde68a");
          return true
        }
        if (!PLANTS[p.key].tall) {
          z.jumping = true;
          z.jumped = true;
          let jumpDist = 1;
          if (z.flags.dolphin) {
            jumpDist = z.s7?.variant ? 2 : 1;
            z.jumpSpeed = SPEEDS.dolphinSlow
          } else {
            jumpDist = z.s7?.variant ? 2 : 1;
            if (s7HasCommand("raid", z.row)) jumpDist += .5;
            z.jumpSpeed = SPEEDS.poleJump * (z.s7?.variant ? 1.3 : 1)
          }
          z.jumpMove = jumpDist;
          if (z.type === "pole") z.s7.poleJumpInitial = jumpDist;
          if (z.type === "dolphin") z.s7.dolphinJumpInitial = jumpDist;
          z.speed = SPEEDS.ordinary;
          setSpeedProfile(z, "ordinary", true);
          addEffect(z.row, z.x, "跳过", "#fde68a");
          return true
        }
      }
      if (z.flags.ladder && z.armors.some(a => a.name === "扶梯" && a.hp > 0) && (z.s7?.ladderUsesRemaining || 1) > 0 && !p.laddered) {
        const breakCmd = s7HasCommand("break", z.row);
        const isVariant = !!z.s7?.variant;
        const repeaterHp = PLANT_RULES.repeater?.hp?.[0] ?? 300;
        const canLadder = breakCmd || (isVariant ? (p.maxHp || PLANTS[p.key].hp) > repeaterHp : p.key === "wallnut" || p
          .key === "tallnut");
        if (canLadder) {
          z.s7 = z.s7 || {};
          const now = finiteNumber(state?.time, 0);
          if (finiteNumber(z.s7.ladderWindupUntil, 0) <= 0 || z.s7.ladderWindupTarget !== p.id) {
            z.s7.ladderWindupTarget = p.id;
            z.s7.ladderWindupUntil = now + s7ZombieActionDuration(z, 2);
            z.s7.ladderPlaceUntil = z.s7.ladderWindupUntil;
            addEffect(z.row, z.x, "架梯前摇", "#e5e7eb", .8);
            return true
          }
          if (now < z.s7.ladderWindupUntil) {
            z.s7.ladderPlaceUntil = z.s7.ladderWindupUntil;
            return true
          }
          delete z.s7.ladderWindupUntil;
          delete z.s7.ladderWindupTarget;
          z.s7.ladderPlaceUntil = now + s7ZombieActionDuration(z, .75);
          p.laddered = true;
          p.ladderExpire = state.time + 300;
          z.s7.ladderUsesRemaining = Math.max(0, finiteNumber(z.s7?.ladderUsesRemaining, 1) - 1);
          if (z.s7.ladderUsesRemaining <= 0) {
            const idx = z.armors.findIndex(a => a.name === "扶梯");
            if (idx >= 0) z.armors.splice(idx, 1)
          }
          z.x -= .55;
          addEffect(p.row, p.col + .5, z.s7.ladderUsesRemaining > 0 ? "架梯·剩1次" : "架梯", "#e5e7eb");
          if (!z.armors.some(a => a.name === "扶梯" && a.hp > 0)) {
            z.speed = SPEEDS.ordinary;
            setSpeedProfile(z, "ordinary", true)
          }
          return true
        }
      }
      if (z.flags.squash) {
        if (!z.s7.squashZWindup) {
          z.s7.squashZWindup = true;
          z.s7.squashZWindupTimer = 1;
          z.s7.squashZTargetId = p.id;
          addEffect(z.row, z.x, "窝瓜僵尸前摇", "#a3e635", .9)
        }
        return true
      }
      if (z.flags.jalapeno) {
        explodeNormalJalapenoZombie(z);
        killZombie(z, {
          noCritical: true,
          noTransform: true
        });
        return true
      }
      return false
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / summonDancers

    // [原源码行 6977] 文档规则：初始跳160px；冲刺每秒增加4px，封顶200px。

    // [原源码行 6978] 以80px为1格换算为2格起步、每秒+0.05格、封顶2.5格。

    // -----------------------------------------------------------------------------

    function summonDancers(z) {
      z.s7 = z.s7 || {};
      z.s7.dancerSummonUntil = finiteNumber(state?.time,0) + s7ZombieActionDuration(z, .9);
      const isVariant = !!z.s7?.variant;
      const summonCmd = s7HasCommand("summon", z.row);
      const dancerSlots = isVariant ? [[0, -.55], [0, -.275], [0, .275], [0, .55]] : [[0, -.55], [0, .55], [-1, 0], [1, 0]];
      for (const [dr, dx] of dancerSlots) {
        const r = z.row + dr;
        if (r >= 0 && r < ROWS) {
          const backupVariant = isVariant;
          const b = makeZombie("backup", r, clamp(z.x + dx, 0, COLS - .2), {
            variant: backupVariant,
            category: "push"
          });
          b.s7 = b.s7 || {};
          b.s7.dancerLeaderId = z.id;
          b.s7.followDancer = !backupVariant && !s7HasCommand("push", b.row);
          if (z.friendly) {
            b.friendly = true;
            b.dir = 1
          }
          safePushZombie(b, "dancer")
        }
      }
      if (summonCmd) {
        const sp = s7PickBoxResult();
        const box = s7MakeSpawnBox(z.row, clamp(z.x + .5, 0, COLS - .2), sp);
        if (z.friendly) {
          box.friendly = true;
          box.dir = 1
        }
        safePushZombie(box, "dancer-box");
        addEffect(z.row, z.x + .5, "召唤盲盒", "#f0abfc")
      }
      addEffect(z.row, z.x, z.friendly ? "友军伴舞" : "召唤伴舞", "#f0abfc")
    }

    // -----------------------------------------------------------------------------
    // 篮球保护已集中到 s7BasketballProtectorForPlant：
    // - 本体保护伞：本行相邻3列；
    // - 小伞：只保护自身锚定的1×1格；
    // - 篮球不会消耗小伞；窝瓜离开原格后，小伞仍留在锚点，不跟随窝瓜。
    // -----------------------------------------------------------------------------

    function launchCatapultBasketball(z, p) {
      if (!z || z.dead || z.friendly || !p || p.dead) return false;
      const sx = finiteNumber(z.x, DAMAGE_BOUNDARY_X + .5) - .18;
      const sy = finiteNumber(z.row, 0) + .2;
      const tx = p.col + .5;
      const ty = p.row + .5;
      addBullet({
        x: sx,
        y: sy,
        row: p.row,
        dx: -3.2,
        damage: 30,
        kind: "basketball",
        emoji: "🏀",
        zombieBullet: true,
        catapultBasketball: true,
        from: z,
        targetPlantId: p.id,
        arc: true,
        arcStartX: sx,
        arcStartY: sy,
        arcEndX: tx,
        arcEndY: ty,
        arcTime: clamp(.65 + Math.abs(sx - tx) * .06, .75, 1.25),
        arcHeight: clamp(.85 + Math.abs(sx - tx) * .08, .95, 1.55),
        life: 2
      });
      addEffect(z.row, Math.min(DAMAGE_BOUNDARY_X, z.x), "投篮30", "#fdba74", .35);
      return true
    }

    function applyLockedCatapultDamage(p, damage = 30) {
      if (!p || p.dead) return false;
      const protector = s7BasketballProtectorForPlant(p);
      if (protector) {
        addEffect(p.row, plantProjectileX(p), protector.key === "umbrella" ? "☂️保护伞挡篮球" : "☂️小伞挡篮球", "#bae6fd", .6);
        return true
      }
      let remain = Math.max(0, finiteNumber(damage, 30));
      const shieldBefore = Math.max(0, finiteNumber(p.shield, 0));
      const hpBefore = finiteNumber(p.hp, 0);
      if (shieldBefore > 0 && remain >= hpBefore + shieldBefore) {
        p.shield = 0;
        addEffect(p.row, p.col + .5, "护盾挡致命", "#fde68a", .6);
        return true
      }
      if (shieldBefore > 0 && remain > 0) {
        const absorbed = Math.min(shieldBefore, remain);
        p.shield = Math.max(0, shieldBefore - absorbed);
        remain -= absorbed;
        addEffect(p.row, p.col + .5, `护盾-${Math.round(absorbed)}${p.shield>0?` 余${Math.round(p.shield)}`:""}`,
          "#fde68a", .5)
      }
      if (remain > 0 && !p.dead) {
        p.hp = finiteNumber(p.hp, 0) - remain;
        addEffect(p.row, p.col + .5, `篮球-${Math.round(remain)}`, "#fdba74", .5);
        if (p.hp <= 0) plantDie(p)
      } else if (shieldBefore > 0) {
        addEffect(p.row, p.col + .5, "篮球命中护盾", "#fdba74", .4)
      }
      return true
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / resolveCatapultBasketballImpact

    // [原源码行 7158] 最终伤害入口再次进行一次伞区判定，保证后排植物、叠种植物及邻格植物

    // 本体保护伞使用1×3篮球区；小伞只保护锚定本格1×1，且篮球不消耗小伞。

    // -----------------------------------------------------------------------------

    function resolveCatapultBasketballImpact(b) {
      if (!b || b.dead) return false;
      b.dead = true;
      const p = state.plants.find(q => q && !q.dead && q.id === b.targetPlantId);
      if (!p) return false;
      if (p.key === "squash" && p.s7?.squashAway && !s7SquashProjectileVulnerable(p)) {
        addEffect(p.row, plantProjectileX(p), "篮球落空", "#cbd5e1", .45);
        return false
      }
      return applyLockedCatapultDamage(p, 30)
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / updateCatapult

    // [原源码行 7196] 篮球到达落点后先消失，再只检查最初锁定的那株植物。

    // [原源码行 7197] 锁定目标已死亡/不存在时不改锁其他植物。

    // [原源码行 7203] 窝瓜离开原位后，只有连砸的重新锁定阶段和下落阶段能被远程子弹命中。

    // [原源码行 7208] 保护判定集中在最终伤害入口，避免多套分支出现前后排漏判。

    // -----------------------------------------------------------------------------

    function updateCatapult(z, moveDt, actionDt = moveDt) {
      if (z.friendly || zombieIsHardControlled(z)) return;
      if (z.drive) {
        if (z.x < 8.0) {
          z.drive = false;
          z.ready = .6;
          z.throwCd = 0
        } else {
          const p = frontPlantForZombie(z);
          if (p && trySpecialContact(z, p, actionDt)) return;
          const sp = currentSpeed(z, moveDt);
          z.x -= sp * moveDt;
          if (z.x < -.35) defeatLane(z.row);
          return
        }
      }
      z.ready -= actionDt;
      if (z.ready > 0) return;
      z.throwCd -= actionDt;
      if (z.throwCd <= 0) {
        const throwInterval = s7HasCommand("ranged", z.row) ? 5 * .7 : 5;
        const maxTargets = z.s7?.variant ? 3 : 1;
        const targets = leftmostPlants(z.row, Math.min(maxTargets, z.balls || 0));
        if (targets.length > 0 && z.balls > 0) {
          z.throwCd = throwInterval;
          z.s7 = z.s7 || {};
          z.s7.catapultThrowUntil = finiteNumber(state?.time,0) + s7ZombieActionDuration(z, 1.45);
          for (const target of targets) launchCatapultBasketball(z, target);
          z.balls -= targets.length
        } else z.drive = true
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / updateShooterZombie

    // [原源码行 7212] 魅惑或硬控期间不投篮/移动。

    // [原源码行 7214] 篮球耗尽后，投篮车进入车辆推进阶段；先结算植物接触，

    // [原源码行 7215] 使其无法穿过植物，并可触发高坚果的固定抗压与车辆击退。

    // [原源码行 7223] 仅第8列及其右侧开出的投篮车保留初始前摇；其余投篮车ready从0开始，

    // [原源码行 7224] 因而会立即完成第一轮投篮，然后才进入正常投篮CD。

    // [原源码行 7229] 普通投篮车锁定本行最靠左的1株植物；变种投篮车锁定最靠左的3株不同植物。

    // [原源码行 7230] 每颗篮球只保留目标植物ID，落点时不做碰撞、不改锁、不兜底重定向。

    // -----------------------------------------------------------------------------

    function updateShooterZombie(z, dt) {
      if (zombieIsHardControlled(z)) return true;
      // 机枪僵尸：出生后有0.6秒前摇
      if (z.type === "gatlingz" || z.type === "peaz") {
        z.ready = z.ready || .6;
        z.ready -= dt;
        if (z.ready > 0) return true;
      }
      const rangedCmd = s7HasCommand("ranged", z.row);
      const isVariant = !!z.s7?.variant;
      if (z.gatlingBurst > 0) {
        z.gatlingBurstTimer -= dt;
        if (z.gatlingBurstTimer <= 0) {
          addBullet({
            x: z.x - .3,
            y: z.row + .5,
            row: z.row,
            dx: 5,
            damage: 20,
            kind: "pea",
            torchable: false,
            from: z,
            dir: -1,
            zombieBullet: true
          });
          z.gatlingBurst--;
          z.gatlingBurstTimer = .2
        }
      }
      if (z.type === "jalapenoz") {
        // 远攻指令动态影响倒计时：指令存在期间倒计时速度×4/3，等效全程存在时总时长×3/4。
        z.jalapenoCd -= dt * (rangedCmd ? 4 / 3 : 1);
        if (z.jalapenoCd <= 0) {
          explodeNormalJalapenoZombie(z);
          killZombie(z, {
            noCritical: true,
            noTransform: true
          });
          return true
        }
        return false
      }
      if (z.type === "ducky") {
        // 鸭子小于640px（当前坐标约x<8）后下水停住并开始射击；此前继续按普通僵尸移动。
        if (z.x >= 8) return false;
        z.shooterReady -= dt;
        if (z.shooterReady > 0) return true;
        z.shootCd -= dt;
        if (z.shootCd <= 0) {
          const interval = rangedCmd ? 3 : 6;
          const shots = z.s7?.variant ? 2 : 1;
          z.shootCd = interval;
          z.s7 = z.s7 || {};
          z.s7.duckyAttackUntil = finiteNumber(state?.time,0) + s7ZombieActionDuration(z, .72);
          for (let i = 0; i < shots; i++) addBullet({
            x: z.x - .3,
            y: z.row + .5,
            row: z.row,
            dx: 5,
            damage: 20,
            kind: "pea",
            torchable: false,
            from: z,
            dir: -1,
            zombieBullet: true
          });
          addEffect(z.row, z.x - .3, `鸭子射击×${shots}`, "#86efac")
        }
        return true
      }
      z.shooterReady -= dt;
      if (z.shooterReady > 0) return false;
      z.shootCd -= dt;
      if (z.shootCd > 0) return false;
      const hasTarget = state.plants.some(p => zombiePeaCanTargetPlant(p) && p.row === z.row && p.col + .5 < z.x);
      if (!hasTarget) {
        z.shootCd = .5;
        return false
      }
      let shots = z.shots || 1;
      let interval = 2.5;
      let damage = 20;
      let kind = "pea";
      let slow = 0;
      let peazCmdNextInterval = null;
      if (z.type === "peaz") {
        let mode = z.shooterMode || "normal";
        if (rangedCmd) {
          // 远攻指令会把普通豌豆僵尸永久转为双发/寒冰之一；指令消失后不回退。
          if (mode === "normal") mode = s7BattleRandom() < .5 ? "twin" : "ice";
          z.shooterMode = mode
        }
        if (mode === "twin") shots = 2;
        else if (mode === "ice") {
          kind = "ice";
          slow = 2;
          shots = 1
        } else shots = 1;
        if (rangedCmd) {
          interval = z.shooterCmdInterval || 2.5;
          peazCmdNextInterval = Math.max(.8, interval - .1)
        }
      }
      if (z.type === "gatlingz") {
        shots = 4;
        if (isVariant) interval *= 1 / 1.5;
        if (rangedCmd) shots = 5;
        z.gatlingBurst = shots;
        z.gatlingBurstTimer = 0
      }
      if (shots > 1 && z.type === "gatlingz") {
        addBullet({
          x: z.x - .3,
          y: z.row + .5,
          row: z.row,
          dx: 5,
          damage: damage,
          kind: kind,
          slow: slow,
          torchable: false,
          from: z,
          dir: -1,
          zombieBullet: true
        });
        z.gatlingBurst--
      } else {
        for (let i = 0; i < shots; i++) {
          addBullet({
            x: z.x - .3,
            y: z.row + .5,
            row: z.row,
            dx: 5,
            damage: damage,
            kind: kind,
            slow: slow,
            torchable: false,
            from: z,
            dir: -1,
            zombieBullet: true
          })
        }
      }
      z.shootCd = interval;
      if (peazCmdNextInterval != null) z.shooterCmdInterval = peazCmdNextInterval;
      addEffect(z.row, z.x - .3, `射击×${shots}`, "#86efac");
      return false
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / updateBungee

    // [原源码行 7246] Gatlingz burst: 后续子弹间隔0.2s发射

    // [原源码行 7267] Jalapenoz: 不射击, 走到植物前正常啃食, 但有特殊行为

    // [原源码行 7281] Ducky: 边走边射

    // [原源码行 7308] Peaz / Gatlingz: 边走边射

    // [原源码行 7329] 确定模式: 指令增益→必定双发/寒冰

    // [原源码行 7338] 指令增益: 每次射击后间隔-0.1s, 最低0.8s

    // [原源码行 7347] 变种: 攻速×1.5

    // [原源码行 7349] 指令增益: 四发变五发

    // [原源码行 7351] 多颗子弹间隔0.2s发射

    // [原源码行 7356] 首颗立即发射，后续由burst定时器在updateShooterZombie顶部处理

    // -----------------------------------------------------------------------------

    function updateBungee(z, dt) {
      if (!z || z.dead) return;
      z.speed = 0;
      z.baseSpeed = 0;
      z.air = true;
      z.slow = 0;
      z.freeze = 0;
      z.stun = 0;
      z.s7 = z.s7 || {};
      if (!z.s7.bungeeDropped) {
        const row = z.row;
        const spawnX = z.x;
        const isVariant = !!z.s7.variant;
        const isFriendly = !!z.friendly;
        const summonCommandActive = s7HasCommand("summon", z.row);
        let spawned = 0;
        while (canAddZombie(row, 1)) {
          const type = s7BattleChoose(BUNGEE_DROP_POOL);
          const nz = makeZombie(type, row, spawnX, {
            variant: isVariant,
            command: false,
            category: s7CategoryForType(type)
          });
          nz.x = spawnX;
          if (nz.flags?.bungee) {
            nz.bungeeTimer = 0;
            nz.speed = 0;
            nz.baseSpeed = 0;
            nz.air = true;
            nz.s7 = nz.s7 || {};
            nz.s7.bungeeColumn = Math.floor(spawnX) + 1;
            nz.s7.bungeeWaiting = true;
            nz.s7.bungeeDropped = false;
            nz.s7.bungeeDropCount = 0
          }
          if (isFriendly) {
            nz.friendly = true;
            nz.dir = 1
          }
          if (!safePushZombie(nz, "bungee-drop")) break;
          spawned++;
          if (!summonCommandActive || s7BattleRandom() >= .5) break
        }
        z.s7.bungeeDropped = true;
        z.s7.bungeeDropCount = spawned;
        addEffect(row, spawnX, `${isVariant?"变种空投":"空投"}${spawned>1?`×${spawned}`:""}`, isVariant ? "#fef08a" :
          "#e0e7ff", .8)
      }
      z.bungeeTimer = finiteNumber(z.bungeeTimer, 0) + dt;
      if (z.bungeeTimer < 1.5) return;
      z.dead = true;
      z.s7.bungeeWaiting = false
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / defeatLane

    // [原源码行 7396] 文档规则：蹦极无敌、不移动、不攻击、不受控；入场后先完成空投，

    // [原源码行 7397] 再在场停留1.5秒后退场。退场不按死亡结算。

    // [原源码行 7415] 普通蹦极固定放置1只；受召唤指令影响时，

    // [原源码行 7416] “每次放完有50%概率再放一次”，因此按几何分布连续判定，

    // [原源码行 7417] 仅由全局/单路实体上限终止，避免无限循环和性能失控。

    // [原源码行 7426] 所有空投结果严格出现在蹦极自身所在的第8或第9列。

    // [原源码行 7427] 即使目标类型拥有特殊出生点，也必须由蹦极空投位置覆盖。

    // [原源码行 7463] “退场”不走死亡/击杀/经验结算。

    // -----------------------------------------------------------------------------

    function defeatLane(row) {
      const t = state.teams[row];
      if (t && t.alive) {
        t.alive = false;
        t.defeatAt = state.time;
        log(`${t.name} 被僵尸进家，淘汰。`);
        for (const z of state.zombies) {
          if (z.row === row && !z.dead && !z.dying) {
            killZombie(z, {
              noCritical: true,
              noTransform: true,
              system: true
            })
          }
        }
      }
    }

    function updateSpawnForLane(t, dt) {
      if (!t || !t.alive) return;
      t.spawn -= dt;
      if (t.spawn > 0) return;
      if (!canAddZombie(t.row, 1)) {
        t.spawn += Math.max(.6, s7SpawnInterval(state.time) * .5);
        addEffect(t.row, DAMAGE_BOUNDARY_X, "出怪延迟", "#fca5a5", .45);
        return
      }
      // 基础机制：自然出怪只生成一个普通随机盲盒；是否变为指令僵尸在盲盒掉落开盒时判定。
      const sx = spawnXFor("blind");
      if (!safePushZombie(makeBlind(t.row, sx), "blind-spawn")) {
        t.spawn += 1;
        return
      }
      addEffect(t.row, DAMAGE_BOUNDARY_X, "盲盒进场", "#fde047");
      t.spawn += s7SpawnInterval(state.time)
    }

    function _compactLaneInPlace(arr, row) {
      if (!Array.isArray(arr)) return arr;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (e && e.dead && e.row === row) continue;
        arr[w++] = e;
      }
      arr.length = w;
      return arr;
    }
    function cleanupLane(row) {
      _compactLaneInPlace(state.plants, row);
      _compactLaneInPlace(state.zombies, row);
      _compactLaneInPlace(state.bullets, row);
    }

    const _lanePlantsScratch = [];
    const _laneZombiesScratch = [];
    const _laneBulletsScratch = [];
    function s7CollectLaneEntities(source, row, out) {
      out.length = 0;
      const list = finiteArray(source);
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (entity && entity.row === row) out.push(entity)
      }
      return out
    }
    function s7AppendNewLaneEntities(source, row, out, startIndex) {
      const list = finiteArray(source);
      for (let i = Math.max(0, startIndex | 0); i < list.length; i++) {
        const entity = list[i];
        if (entity && entity.row === row) out.push(entity)
      }
      return out
    }
    function cleanupFrameEntities() {
      compactArrayInPlace(state.plants, p => p && !p.dead);
      compactArrayInPlace(state.zombies, z => z && !z.dead);
      compactArrayInPlace(state.bullets, b => b && !b.dead)
    }

    function updateLaneTurn(t, dt, allowAutomaticSpawn = true) {
      if (!t || !t.alive) return;
      const row = t.row;
      s7UpdateElements(dt, row);
      if (allowAutomaticSpawn) updateSpawnForLane(t, dt);

      const lanePlants = s7CollectLaneEntities(state.plants, row, _lanePlantsScratch);
      updatePlants(dt, row, lanePlants);

      const laneZombies = s7CollectLaneEntities(state.zombies, row, _laneZombiesScratch);
      const postPrepassZombieCount = updateZombies(dt, row, laneZombies);
      updateUmbrellaImpKill(row);
      // Friendlies created during the main zombie pass were visible to the old global scan.
      s7AppendNewLaneEntities(state.zombies, row, laneZombies, postPrepassZombieCount);
      updateFriendlies(dt, row, laneZombies);

      const laneBullets = s7CollectLaneEntities(state.bullets, row, _laneBulletsScratch);
      updateBullets(dt, row, laneBullets);
      s7UpdateTurrets(dt, row)
    }
