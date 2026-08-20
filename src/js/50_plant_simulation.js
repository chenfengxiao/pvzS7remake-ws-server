"use strict";

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7KelpSlotCount

    // [原源码行 4158] S7 版所有卡牌统一走 s7Act / s7PlantPassive，不再保留旧 PVZ1 kind 分支。

    // [原源码行 4168] SIMULATION: plants, zombies, bullets, lane turns

    // -----------------------------------------------------------------------------

    function s7KelpSlotCount(p) {
      return (p?.s7?.level || 0) >= 5 ? 2 : 1
    }

    function s7KelpSlotCooldown(p) {
      const lv = clamp(Math.floor(p?.s7?.level || 0), 0, 5);
      return PLANT_RULES.kelp.cd[lv] ?? PLANT_RULES.kelp.cd[0] ?? 10
    }

    function s7KelpEnsureSlots(p) {
      if (!p || p.key !== "kelp") return [];
      p.s7 = p.s7 || {};
      const count = s7KelpSlotCount(p);
      const old = Array.isArray(p.s7.kelpSlots) ? p.s7.kelpSlots : [];
      const slots = [];
      for (let i = 0; i < count; i++) {
        const prev = old[i] || {};
        slots.push({
          index: i,
          targetId: Number.isFinite(prev.targetId) ? prev.targetId : null,
          cooldown: Math.max(0, finiteNumber(prev.cooldown, 0))
        })
      }
      p.s7.kelpSlots = slots;
      return slots
    }

    function s7KelpTargetForSlot(p, slot) {
      if (!state || !p || !slot || slot.targetId == null) return null;
      const q = state.zombies.find(z => z && z.id === slot.targetId) || null;
      if (!q || q.dead || q.s7KelpGrabbed !== true || q.s7KelpGrabbedBy !== p || q.s7KelpSlotIndex !== slot.index)
        return null;
      return q
    }

    function s7KelpReleaseTarget(z, startCooldown = true) {
      if (!z) return;
      const p = z.s7KelpGrabbedBy;
      if (p && !p.dead && p.key === "kelp") {
        const slots = s7KelpEnsureSlots(p);
        const slot = slots.find(s => s.targetId === z.id || s.index === z.s7KelpSlotIndex);
        if (slot) {
          slot.targetId = null;
          slot.cooldown = startCooldown ? s7KelpSlotCooldown(p) : 0
        }
      }
      z.s7KelpGrabbed = false;
      z.s7KelpGrabbedBy = null;
      z.s7KelpSlotIndex = null;
      z.s7KelpTargeting = false;
      z.s7KelpPoison = null
    }

    function s7KelpSyncSlots(p) {
      const slots = s7KelpEnsureSlots(p);
      for (const slot of slots) {
        if (slot.targetId == null) continue;
        const q = s7KelpTargetForSlot(p, slot);
        if (!q) {
          slot.targetId = null;
          slot.cooldown = Math.max(slot.cooldown, s7KelpSlotCooldown(p))
        }
      }
      return slots
    }

    function s7KelpUpdateSlots(p, dt) {
      const slots = s7KelpSyncSlots(p);
      const full = s7KelpSlotCooldown(p);
      for (const slot of slots) {
        if (slot.targetId != null) slot.cooldown = full;
        else slot.cooldown = Math.max(0, slot.cooldown - Math.max(0, dt))
      }
      p.cd = 0;
      return slots
    }

    function s7KelpReadySlots(p) {
      return s7KelpSyncSlots(p).filter(slot => slot.targetId == null && slot.cooldown <= 0)
    }

    function s7KelpHeldTargets(p) {
      if (!state || !p || p.dead || p.key !== "kelp") return [];
      return s7KelpSyncSlots(p).map(slot => s7KelpTargetForSlot(p, slot)).filter(Boolean)
    }

    function s7PlanternIsAdjacent(plantern, plant) {
      return !!(plantern && plant && plantern !== plant && !plantern.dead && !plant.dead && plantern.row === plant
        .row && Math.abs(plantern.col - plant.col) === 1)
    }

    function s7PlantHasPlanternSlowImmunity(plant) {
      if (!state || !plant || plant.dead) return false;
      return state.plants.some(q => q.key === "plantern" && (q.s7?.level || 0) >= 5 && s7PlanternIsAdjacent(q, plant))
    }

    function s7LumenDecayIntervalForRow(row) {
      if (!state) return 5;
      return state.plants.some(q => !q.dead && q.key === "plantern" && (q.s7?.level || 0) >= 5 && q.row === row) ? 8 : 5
    }

    function s7ColdDecayIntervalForRow(row) {
      let interval = S7_RULES.elements.coldDecay;
      for (const p of finiteArray(state?.plants)) {
        if (!p || p.dead || p.row !== row || p.key !== "iceshroom") continue;
        const lv = p.s7?.level || 0;
        if (lv >= 5) interval = Math.max(interval, 10);
        else if (lv >= 3) interval = Math.max(interval, 7)
      }
      return interval
    }

    function s7PlanternApplyRowLumen(p) {
      if (!state || !p || p.dead) return 0;
      let affected = 0;
      const interval = s7LumenDecayIntervalForRow(p.row);
      for (const q of state.zombies) {
        if (q.dead || q.dying || q.friendly || q.row !== p.row) continue;
        const e = s7Elem(q);
        e.lumen = Math.min(4, Math.max(0, e.lumen || 0) + 1);
        e.lumenInterval = interval;
        e.lumenT = interval;
        q.lastElementSource = p;
        affected++
      }
      return affected
    }

    function s7PlanternHealRow(p, flatHeal) {
      if (!state || !p || p.dead) return 0;
      let healed = 0;
      for (const q of state.plants) {
        if (!q || q.dead || q.row !== p.row) continue;
        const beforeHp = q.hp;
        q.hp = Math.min(q.maxHp, q.hp + flatHeal + q.maxHp * .03);
        if (q.hp > beforeHp) healed++
      }
      return healed
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7PlanternTransfuse

    // [原源码行 4318] 路灯花的周期回血严格限定在自身所在行；包含路灯花自身，

    // [原源码行 4319] 不按同列、相邻行或3×3范围扩散。

    // -----------------------------------------------------------------------------

    function s7PlanternTransfuse(p, dt) {
      if (!state || !p || p.dead || (p.s7?.level || 0) < 5) return false;
      const target = state.plants.filter(q => q.row === p.row && s7PlanternIsAdjacent(p, q) && q.hp < 150 && q.hp < q
        .maxHp).sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
      if (!target || !(p.hp > 0)) return false;
      const amount = Math.min(100 * dt, p.hp, 150 - target.hp, target.maxHp - target.hp);
      if (!(amount > 0)) return false;
      p.hp -= amount;
      target.hp += amount;
      p.s7.planternTransfuseFx = (p.s7.planternTransfuseFx || 0) - dt;
      if (p.s7.planternTransfuseFx <= 0) {
        p.s7.planternTransfuseFx = .5;
        addEffect(target.row, target.col + .5, "输血+" + Math.round(amount / Math.max(dt, .001)) + "/s", "#fb7185", .45)
      }
      if (p.hp <= 0) {
        p.hp = 0;
        addEffect(p.row, p.col + .5, "输血耗尽", "#fb7185", .8);
        plantDie(p)
      }
      return true
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / updatePlants

    // [原源码行 4332] 5阶输血也只允许作用于本行的左右相邻植物，

    // [原源码行 4333] 杜绝同列的上一行/下一行植物被回血。

    // -----------------------------------------------------------------------------

    function updatePlants(dt, rowFilter = null, lanePlants = null) {
      const plants = lanePlants || state.plants;
      // Preserve the old snapshot semantics without allocating a copied array every lane.
      // Plants created during this pass begin updating on the next lane/frame, exactly as before.
      const initialLength = plants.length;
      for (let i = 0; i < initialLength; i++) {
        const p = plants[i];
        if (!p || rowFilter !== null && p.row !== rowFilter) continue;
        if (p.dead || !state.teams[p.row].alive) continue;
        p.age += dt;
        if (p.laddered && p.ladderExpire && state.time >= p.ladderExpire) {
          p.laddered = false;
          p.ladderExpire = null;
          addEffect(p.row, p.col + .5, "梯子到期", "#d4d4d8")
        }
        if (s7PlantHasPlanternSlowImmunity(p)) p.slow = 0;
        if (p.slow > 0) p.slow = Math.max(0, p.slow - dt);
        const slowFactor = p.slow > 0 ? .5 : 1;
        if (PLANT_RULES[p.key]) {
          if (p.buff > 0) p.buff = Math.max(0, p.buff - dt);
          if (p.s7?.deathPending) continue;
          s7PlantPassive(p, dt);
          s7RefreshPlant(p);
          if (p.s7?.fakeDeath > 0) continue;
          if (isMushroomAsleep(p)) continue;
          if (p.key === "kelp") {
            const kelpSlots = s7KelpUpdateSlots(p, dt * slowFactor);
            if (kelpSlots.some(slot => slot.targetId == null && slot.cooldown <= 0)) s7Act(p);
            continue
          }
          if (p.cd > 0) {
            if (p.key === "threepeater" && (p.s7?.ultTimer || 0) > 0) {
              p.s7.ultTimer = Math.max(0, p.s7.ultTimer - dt);
              continue
            }
            const cdSlowFactor = p.key === "kernel" && p.s7?.kernelThrowPending
              ? Math.max(0, finiteNumber(p.s7.kernelThrowSlowFactor, slowFactor))
              : slowFactor;
            p.cd -= dt * cdSlowFactor;
            if (p.key === "kernel") {
              if (!p.s7?.kernelThrowPending && p.cd <= s7KernelWindupLeadCd(p, slowFactor)) s7KernelStartThrow(p, slowFactor);
              // Once windup starts, reaching zero waits for the release Animation Event; no duplicate s7Act call.
              if (p.s7?.kernelThrowPending && p.cd <= 0) p.cd = 0;
            }
            if (p.key === "chomper" && ["recover", "chew", "swallow"].includes(p.s7?.chomperPhase)) {
              if (p.s7.chomperPhase === "swallow") {
                if (p.cd <= 0) {
                  const digest = s7ChomperDigest(p);
                  if (digest > 0) {
                    p.s7.chomperPhase = "chew";
                    p.s7.chomperTime = p.cd = digest
                  } else {
                    s7ChomperClearPhase(p)
                  }
                }
              } else if (p.s7.chomperPhase === "recover") {
                if (p.cd <= 0) s7ChomperClearPhase(p)
              } else {
                if (!(p.s7.chomperTime > 0)) p.s7.chomperTime = s7ChomperDigest(p);
                if (p.cd <= 0) s7ChomperClearPhase(p)
              }
              continue
            }
            continue
          }
          if (p.key === "timegrass") timegrassClearFinishedSkillCooldown(p);
          if (p.key === "kernel") {
            if (!p.s7?.kernelThrowPending) s7KernelStartThrow(p);
            if (p.s7?.kernelThrowPending) continue
          }
          if (p.key === "threepeater" && (p.s7?.ultTimer || 0) > 0) {
            p.cd = s7Cd(p);
            continue
          }
          const acted = s7Act(p);
          p.cd = acted ? s7Cd(p) : Math.min(.2, s7Cd(p))
        }
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / schedulePlantEvent

    // [原源码行 4374] 减速时攻速降低50%

    // [原源码行 4383] 缠绕水草使用独立槽位冷却：5阶两个槽位分别计时。

    // [原源码行 4384] 某槽位缠住目标时对应蓝条保持0；该目标死亡后才开始恢复。

    // -----------------------------------------------------------------------------

    function schedulePlantEvent(p, frames, type, payload = {}) {
      if (!state || !p) return;
      state.pendingPlantEvents = finiteArray(state.pendingPlantEvents);
      state.pendingPlantEvents.push({
        plantId: p.id,
        dueFrame: (state.frame || 0) + Math.max(0, frames | 0),
        type: type,
        payload: payload
      })
    }

    function resolveExplodenutDeath(p, payload = {}) {
      if (!p || p.dead || !p.s7?.deathPending) return;
      const deathLevel = clamp(payload.deathLevel ?? p.s7.explodenutDeathLevel ?? p.s7.level ?? 0, 0, 5);
      s7RefreshPlant(p);
      const postExplosionLevel = clamp(p.s7.level || 0, 0, 5);
      s7GrantDeathXp(p);
      p.s7.deathPending = false;
      delete p.s7.explodenutDeathLevel;
      if (postExplosionLevel >= 3) {
        const reviveLevel = postExplosionLevel - 1;
        const thresholds = s7Thresholds(p.key);
        p.s7.exp = thresholds[reviveLevel];
        p.s7.reviveHpMult = (p.s7.reviveHpMult || 1) * .8;
        s7RefreshPlant(p);
        p.hp = p.maxHp;
        p.cd = s7Cd(p);
        addEffect(p.row, p.col + .5, `爆炸结算${deathLevel}→${postExplosionLevel}阶·降至${reviveLevel}阶复活`, "#fbbf24", 1)
      } else {
        p.dead = true;
        addEffect(p.row, p.col + .5, `爆炸结算后${postExplosionLevel}阶·死亡`, "#f87171", .8)
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / processPlantEvents

    // [原源码行 4427] 爆炸伤害与击杀经验均在本事件之前同步结算。这里再刷新一次等级，

    // [原源码行 4428] 确保“死亡等级”绝不抢在爆炸所得经验和升级之前决定复活。

    // [原源码行 4435] 最终结算等级达到3阶及以上：严格扣除一整阶经验后复活；

    // [原源码行 4436] 最终仍低于3阶：直接死亡。5阶已经封顶，不再获得额外经验或升级。

    // -----------------------------------------------------------------------------

    function processPlantEvents() {
      if (!state) return;
      const pending = finiteArray(state.pendingPlantEvents);
      if (!pending.length) return;
      const remain = [];
      for (const ev of pending) {
        if ((ev.dueFrame || 0) > (state.frame || 0)) {
          remain.push(ev);
          continue
        }
        const p = state.plants.find(q => q.id === ev.plantId);
        if (!p) continue;
        if (ev.type === "explodenutDeath") resolveExplodenutDeath(p, ev.payload || {});
        else if (ev.type === "gloomPulse") s7ResolveGloomPulse(p, ev.payload || {});
        else if (ev.type === "marigoldExtra" && typeof p.s7?.marigoldProduce === "function") p.s7.marigoldProduce(ev
          .payload?.item)
      }
      state.pendingPlantEvents = remain
    }

    function plantDie(p) {
      if (!p || p.dead) return;
      if (p.key === "garlic" && p.s7?.fakeDeath > 0) return;
      if (p.key === "kelp") {
        for (const q of s7KelpHeldTargets(p)) s7KelpReleaseTarget(q, false)
      }
      if (PLANT_RULES[p.key]) {
        const lv = p.s7?.level || 0;
        if (p.key === "explodenut") {
          p.s7.deathPending = true;
          p.s7.explodenutDeathLevel = lv;
          p.hp = 1;
          p.cd = 999;
          s7ExplodenutDeathExplosion(p);
          schedulePlantEvent(p, 2, "explodenutDeath", {
            deathLevel: lv
          });
          addEffect(p.row, p.col + .5, "本帧爆炸·两帧后降级", "#fb7185", 1);
          return
        }
        if (p.key === "cactus" && (p.s7.level || 0) >= 5 && !(p.s7.cactusGoldenCd > 0) && !p.s7.cactusRebirthPending) {
          p.hp = 1;
          p.s7.invincible = 5;
          p.s7.cactusRebirthPending = true;
          p.s7.cactusGoldenCd = 180;
          addEffect(p.row, p.col + .5, "濒死无敌5s", "#fef08a", 1);
          return
        }
        if (!(p.key === "garlic" && lv >= 5 && !(p.s7.garlicDeathCd > 0))) s7GrantDeathXp(p);
        if (p.key === "potato") {
          s7PotatoDeathExplosion(p);
          if (!p.s7.revived) {
            p.s7.revived = true;
            p.hp = p.maxHp;
            addEffect(p.row, p.col + .5, "满血复活一次", "#a3e635");
            return
          }
        }
        if (p.key === "squash") {
          if (p.s7?.squashDeath) return;
          triggerS7SquashDeath(p);
          return
        }
        if (p.key === "garlic" && (p.s7.level || 0) >= 5 && !(p.s7.garlicDeathCd > 0)) {
          state.poisonPits = finiteArray(state.poisonPits);
          if (state.poisonPits.length < PERF.MAX_POISON_PITS) {
            state.poisonPits.push({
              row: p.row,
              col: p.col,
              ttl: 60,
              max: 60
            })
          }
          const deathHp = Math.max(1, p.s7.lastHpBeforeDamage || p.maxHp);
          for (const q of state.zombies)
            if (!q.dead && !q.friendly && q.row === p.row && Math.abs(q.x - (p.col + .5)) <= 1.5) {
              s7ApplyZombieKnockback(q, .625, { maxX: COLS - .5, reason: "大蒜毒爆击退" });
              s7ApplyElement(q, "poison", deathHp * 2, p, {
                ignoreTargetState: true
              })
            }
          p.hp = 1;
          p.s7.fakeDeath = 60;
          p.s7.garlicDeathCd = 180;
          p.cd = 999;
          addEffect(p.row, p.col + .5, "毒爆假死60s", "#a3e635");
          return
        }
      }
      p.dead = true;
      if (p.key === "seashroom" && !p.s7?.isClone) {
        const clones = state.plants.filter(q => !q.dead && q.key === "seashroom" && q.s7?.isClone && q.s7?.parentId ===
          p.id).sort((a, b) => (a.id || 0) - (b.id || 0));
        if (clones.length) {
          const heir = clones.shift();
          heir.s7.isClone = false;
          heir.s7.parentId = null;
          heir.s7.exp = Math.max(0, p.s7?.exp || 0);
          heir.s7.level = p.s7?.level || 0;
          heir.s7.lastLevel = heir.s7.level;
          heir.s7.upgradeHealedThrough = heir.s7.level;
          heir.maxHp = s7MaxHp(heir);
          heir.hp = Math.min(heir.maxHp, Math.max(1, heir.hp));
          heir.s7.cloneCd = [150, 120, 100, 100, 80, 80][heir.s7.level] || 150;
          for (const q of clones) q.s7.parentId = heir.id;
          addEffect(heir.row, heir.col + .5, "分身继承本体", "#67e8f9", .7)
        }
      }
      if (p.key === "doom" && renderSafeRow(p.row) && Number.isFinite(p.col)) {
        state.effects = finiteArray(state.effects);
        state.effects.push({
          row: p.row,
          x: p.col + .5,
          text: "坑",
          color: "#000",
          ttl: 180,
          max: 180,
          crater: true
        })
      }
    }

    function explode(row, x, rad, damage, opt = {}) {
      if (opt.ash) {
        for (const p of state.plants) {
          if (!p.dead && p.laddered && Math.abs(p.row - row) <= rad && Math.abs(p.col + .5 - x) <= rad) {
            p.laddered = false;
            addEffect(p.row, p.col + .5, "梯子被炸掉", "#fed7aa")
          }
        }
      }
      for (const z of [...state.zombies]) {
        if (!canExplosionAffectZombie(z, opt)) continue;
        if (Math.abs(z.row - row) <= rad && Math.abs(z.x - x) <= rad) damageZombie(z, damage, opt)
      }
      addEffect(row, x, "爆炸", "#fb7185");
      for (let r = Math.max(0, Math.floor(row - rad)); r <= Math.min(ROWS - 1, Math.ceil(row + rad)); r++) {
        for (let c = Math.max(0, Math.floor(x - rad)); c <= Math.min(COLS - 1, Math.ceil(x + rad)); c++) {
          if (Math.abs(r - row) <= rad && Math.abs(c + .5 - x) <= rad) {
            addGridEffect(r, c, "#ef4444", 1.5, false)
          }
        }
      }
    }

    function s7ExplodenutDeathExplosion(p) {
      explode(p.row, p.col + .5, 1.5, ASH, {
        source: p,
        ash: true,
        noTransform: true
      });
      addEffect(p.row, p.col + .5, "3×3灰烬爆炸", "#fb7185", 1.1)
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / removePlant

    // [原源码行 4622] 爆炸坚果死亡时只结算一次以自身为中心的 3×3 灰烬爆炸。

    // [原源码行 4623] 不再追加整行辣椒爆炸，中心区域也不会重复受到第二次伤害。

    // -----------------------------------------------------------------------------

    function removePlant(p) {
      p.dead = true;
      state.plants = state.plants.filter(q => !q.dead)
    }

    function damagePlant(p, dmg, src) {
      if (!p || p.dead || p.s7?.barleyPepperDormant) return;
      if (p.s7?.fakeDeath > 0) return;
      if (src && !src.dead && !src._isBullet && zombieIsHardControlled(src)) return;
      if (PLANTS[p.key]?.invincible) return;
      const before = p.hp;
      p.s7 = p.s7 || {};
      p.s7.lastHpBeforeDamage = before;
      // 窝瓜休息时减伤50%（离开本体的攻击态不受减伤）。
      if (p.key === "squash" && !p.s7.squashAway) dmg *= .5;
      const isProjectileHit = !!src?._isBullet;
      const squashProjectileWindow = s7SquashProjectileVulnerable(p);
      const isOrdinaryBite = s7IsOrdinaryBiteSource(src);
      const squashHomeBiteWindow = isOrdinaryBite && s7SquashBiteVulnerableAtHome(p, src);
      if (p.s7?.invincible > 0 && !(isProjectileHit && squashProjectileWindow) && !squashHomeBiteWindow) {
        addEffect(p.row, plantProjectileX(p), "无敌", "#fde68a");
        return
      }
      // 僵尸远程豌豆只在子弹命中入口结算小伞；damagePlant 不再提供“所有子弹通吃”的兜底，
      // 从框架上避免篮球、非豌豆子弹和邻格子弹误走同一保护分支。
      if (p.key === "umbrella" && isOrdinaryBite) {
        // 啃咬保护伞的僵尸立即向右弹飞1.5格（120px），保护伞自身受20点伤害。
        // 攻击冷却覆盖整个击退飞行时长，确保一次接触只咬一口，不会出现连啃很多口。
        if (Number.isFinite(src.x) && !src.dead) {
          const targetX = Math.min(COLS + .3, src.x + 1.5);
          s7MoveZombieByKnockback(src, targetX, { maxX: COLS + .3, reason: "保护伞弹飞" });
          src.attackCd = Math.max(src.attackCd || 0, S7_KNOCKBACK_DURATION);
          addEffect(src.row, src.x, "保护伞弹飞120px", "#bae6fd", .45)
        }
        p.hp -= 20;
        if (p.hp <= 0) plantDie(p);
        return
      }
      if (src && isOrdinaryBite) {
        const smallUmbrellaOwner = s7SmallUmbrellaForPlant(p);
        if (smallUmbrellaOwner) {
          // 最新规则是“一次啃咬”：本次啃咬由20HP小伞完整承受；不附带旧版的额外击退。
          s7ConsumeSmallUmbrella(smallUmbrellaOwner, "小伞承受啃咬20");
          return
        }
      }
      if (p.shield > 0) {
        const shieldBefore = p.shield;
        if (dmg >= p.hp + shieldBefore) {
          p.shield = 0;
          addEffect(p.row, p.col + .5, "护盾挡致命", "#fde68a");
          return
        }
        const absorbed = Math.min(dmg, shieldBefore);
        p.shield = Math.max(0, shieldBefore - absorbed);
        dmg -= absorbed;
        addEffect(p.row, p.col + .5, `护盾-${Math.round(absorbed)}${p.shield>0?` 余${Math.round(p.shield)}`:""}`,
          "#fde68a");
        if (dmg <= 0) return
      }
      if (dmg <= 0) return;
      p.hp -= dmg;
      if (p.hp <= 0) plantDie(p);
      if (src && PLANT_RULES[p.key]) {
        // 仙人掌反伤仅在被啃咬时触发（200%啃咬伤害反伤）。
        if (p.key === "cactus" && isOrdinaryBite && before > p.hp) damageZombie(src, Math.max(0, before - p.hp) * 2, {
          source: p,
          ignore2: true
        });
        if (p.key === "tallnut" && (p.s7?.level || 0) >= 5 && dmg > 0) {
          p.s7.bump = (p.s7.bump || 0) + dmg;
          addEffect(p.row, p.col + .5, `护盾吸收${Math.round(dmg)}`, "#fde68a", .3);
          while (p.s7.bump >= 1e3) {
            p.s7.bump -= 1e3;
            for (const z of state.zombies)
              if (!z.dead && z.row === p.row && z.x >= p.col + .5 && z.x <= p.col + 1.75 && !z.underground && !
                isBalloonAir(z)) {
                s7ApplyZombieKnockback(z, 1.25, {
                  maxX: COLS + .3,
                  reason: "高坚果震退"
                });
                addEffect(z.row, z.x, "震退1.25格", "#d8b4fe")
              } for (const pp of state.plants)
              if (!pp.dead && pp.row === p.row && pp.laddered && pp.col + .5 >= p.col + .5 && pp.col + .5 <= p.col +
                1.75) {
                pp.laddered = false;
                addEffect(pp.row, pp.col + .5, "震落梯子", "#d8b4fe")
              }
          }
          return
        }
        if (p.key === "hypno" && isOrdinaryBite && before > p.hp && (p.s7?.charms ?? 5) > 0 && !src.friendly && !isAbnormalImmuneZombie(
            src) && !src.underground) {
          if (s7ConvertZombieToFriendly(src, "本体魅惑")) {
            if ((p.s7?.level || 0) >= 3) {
              src.s7CharmedByHypno = true;
              src.s7HypnoOwnerId = p.id
            }
            s7GrantShineToIceStarHypno(p.row, 7.5, "魅惑照耀");
            p.s7.charms--;
            if (p.s7.charms <= 0) plantDie(p)
          }
        }
        if (p.key === "kernel" && (p.s7?.level || 0) >= 5 && before > p.hp && !src._isBullet && src.type !==
          "catapult" && !src.flags?.garg && !src.vehicle && !src.flags?.squash && !src.flags?.jalapeno && !src.flags
          ?.jack && !src.underground) {
          p.s7.kernelAccel = 1;
          p.s7.kernelCloseReduction = 2.5;
          p.s7.nextCdOverride = .5;
          addEffect(p.row, p.col + .5, "被啃急射0.5s", "#facc15", .4)
        }
      }
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7TriggerLumenChain

    // [原源码行 4637] 统一兜底：仍存活且处于眩晕/冻结的僵尸不能通过啃咬、挖根、

    // [原源码行 4638] 砸击、碾压、接触爆炸等直接路径对植物结算伤害。

    // [原源码行 4639] 已经离手的独立子弹仍由子弹自身结算；死亡触发效果也不受此限制。

    // [原源码行 4641] 绝对无敌植物不接受任何来源的伤害；缠绕水草由此覆盖啃咬、

    // [原源码行 4642] 砸击、碾压、挖根、爆炸、子弹、篮球及其他特殊伤害入口。

    // 小伞不再提供通用“所有远程子弹免疫”：只有豌豆类子弹能消耗20HP小伞。

    // 篮球、豌豆、啃咬和浮空单位分别走独立入口，禁止彼此复用范围或消耗规则。

    // [原源码行 4669] 保护伞本体被普通啃咬时，只支付20点生命并弹开本次攻击者；

    // [原源码行 4670] 不再先吃一遍普通啃咬伤害后又额外扣20。

    // [原源码行 4685] 200点护盾先逐点承伤；只要本次命中会连盾带本体一起致死，

    // [原源码行 4686] 就消耗整层护盾并完整挡下这一次致命伤（包括砸击/碾压）。

    // -----------------------------------------------------------------------------

    function s7TriggerLumenChain(origin, dealt, opt = {}) {
      if (!state || !origin || dealt <= 0 || opt.noLumenChain) return;
      const source = opt.noSource ? null : opt.source || origin.lastHitPlant || origin.lastElementSource || null;
      const chainDamage = Math.max(1, dealt * .25);
      const carriers = state.zombies.filter(q => q !== origin && !q.dead && !q.dying && !q.friendly && q.row === origin
        .row && isDamageableZombie(q) && (s7Elem(q).lumen || 0) >= 3 && canAffectZombieState(q, {
          source: source,
          element: true
        }));
      if (!carriers.length) return;
      for (const q of carriers) {
        damageZombie(q, chainDamage, {
          source: source,
          noSource: !!opt.noSource,
          ignore2: true,
          element: true,
          noLumenChain: true
        })
      }
      addEffect(origin.row, origin.x, `光标传导${Math.round(chainDamage)}`, "#fde047", .35)
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7YetiMainPlantsInRow

    // [原源码行 4783] 光标传导：任意僵尸受伤时，同路其它光标层数>=3的僵尸，

    // [原源码行 4784] 各自受到本次实际伤害25%的传导伤害；传导伤害本身不再触发传导。

    // -----------------------------------------------------------------------------

    function s7YetiMainPlantsInRow(row, exclude = null) {
      if (!state) return [];
      return finiteArray(state.plants).filter(p => p && p !== exclude && !p.dead && p.row === row && !p.s7?.isClone && !
        p.s7?.fakeDeath && !p.s7?.deathPending)
    }

    function s7ApplyYetiPlantSlow(p, seconds, label) {
      if (!p || p.dead || !(seconds > 0)) return false;
      if (s7PlantHasPlanternSlowImmunity(p)) {
        p.slow = 0;
        addEffect(p.row, p.col + .5, "减速免疫", "#fde68a", .35);
        return false
      }
      p.slow = Math.max(p.slow || 0, seconds);
      addEffect(p.row, p.col + .5, label || `减速${seconds}s`, "#93c5fd");
      return true
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7YetiVariantChance

    // [原源码行 4830] “不可叠加”按刷新/补足至规定时长处理，不做持续时间相加。

    // -----------------------------------------------------------------------------

    function s7YetiVariantChance(row = null, hpFraction = 1) {
      return s7VariantChanceForHpFraction(hpFraction, "push", row)
    }

    // -----------------------------------------------------------------------------

    // 核心模拟 / s7StartYetiFlee

    // [原源码行 4836] 推进类变种基础概率为0%；每个推进类指令僵尸额外提供8%。

    // -----------------------------------------------------------------------------

    function s7StartYetiFlee(z) {
      if (!z || z.dead || z.dying || z.type !== "yeti" || z.fleeing) return false;
      z.fleeing = true;
      z.dir = 1;
      z.speed = S7_YETI_RULE.fleeSpeed;
      z.baseSpeed = S7_YETI_RULE.fleeSpeed;
      addEffect(z.row, z.x, "雪人逃跑", "#a5f3fc");
      return true
    }

    function s7YetiOnDirectPlantAttack(z, dealt, opt = {}) {
      if (!z || z.type !== "yeti" || !(dealt > 0) || !opt.source || opt.noSource) return false;
      const source = opt.source;
      s7ApplyYetiPlantSlow(source, S7_YETI_RULE.hitSlowSeconds, "雪人反制1.5s");
      if (s7HasCommand("push", z.row)) {
        const others = s7YetiMainPlantsInRow(z.row, source);
        if (others.length) {
          const extra = others[Math.floor(s7BattleRandom() * others.length)];
          s7ApplyYetiPlantSlow(extra, S7_YETI_RULE.hitSlowSeconds, "指令减速1.5s")
        }
      }
      if (z.hp <= (z.maxHp || S7_YETI_RULE.bodyHp + S7_YETI_RULE.criticalHp) * 2 / 3) {
        s7StartYetiFlee(z);
      }
      return true
    }

    function s7RegenZombieAllPools(z, rate, dt) {
      if (!z || !(rate > 0) || !(dt > 0)) return;
      z.hp = Math.min(z.maxHp || z.hp || 0, (z.hp || 0) + rate * dt);
      for (const a of finiteArray(z.armors)) {
        if (a && a.hp > 0) a.hp = Math.min(a.max || a.hp || 0, a.hp + rate * dt)
      }
    }

    function s7BackupIndependentFromDancer(z) {
      return !!(z && z.type === "backup" && (z.s7?.variant || s7HasCommand("push", z.row)))
    }

    function s7BackupShouldWaitForDancer(z) {
      if (!z || z.type !== "backup" || s7BackupIndependentFromDancer(z)) return false;
      const leaderId = z.s7?.dancerLeaderId;
      if (!leaderId || !state) return false;
      const leader = state.zombies.find(q => q && !q.dead && q.id === leaderId && q.flags?.dancer);
      return !!(leader && (!leader.summoned || leader.s7?.dancerSummoning))
    }

