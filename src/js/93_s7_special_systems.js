"use strict";

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ThreepeaterUlt

    // [原源码行 12903] 胆小菇没有任何低血量、暗熠层数或概率斩杀分支。

    // [原源码行 12916] 修正版口径：僵尸越近，三线射手开大概率越高。

    // [原源码行 12917] 在三条可攻击行内取距离本体最近的可攻击僵尸；每靠近0.5格，概率+0.3%。

    // [原源码行 12978] 猫尾草普通大刺是“默认同行”规则的明确例外：全屏五行索敌并跨行追踪。

    // [原源码行 13145] 地下矿工在地下时完全不受三叶草凛风影响：

    // [原源码行 13146] 既不发生位移，也不获得寒意。黑橄榄（黑大爷）是明确例外：

    // [原源码行 13147] 即使免疫通常控制，也必须承受本次0.2格位置击退；其寒意仍由免控规则拦截。

    // [原源码行 13149] 每次凛风对每个目标只调用一次统一入口；实际坐标增量严格为0.2格，

    // [原源码行 13150] 不再叠加贴图宽度、速度或同帧重复击退。

    // [原源码行 13246] 技能刷新时复用统一的空中单位判定与击杀入口，避免篮球、气球、

    // [原源码行 13247] 小鬼、撑杆/海豚/跳跳在不同分支里出现不一致结果。

    // [原源码行 13255] 只有五阶保护伞能够把现有小伞升级为空中单位弹飞小伞。

    // [原源码行 13258] 低阶保护伞刷新普通小伞时，明确保持无空中单位弹飞能力。

    // [v10.8.0 最新纠正] 星星先固定飞行2格，再检测本行僵尸与魔法师效果：无僵尸无魔法则沿原轨迹继续，有魔法则慢速左移，有僵尸则锁定本行最靠左僵尸。

    // 魅惑僵尸不参与敌方索敌，也不会诱导既有星星后退；百变大麦的杨桃形态使用同一规则。

    // [原源码行 13359] 上一轮提取的灵魂孢子与本轮喷射同时发出；无目标时不会清空库存。

    // [原源码行 13417] 连射可以继续触发连射；64发只作为极端随机链的性能保险，不改变正常概率分布。

    // [原源码行 13425] 金瓜不是西瓜大炮，仍只选择可被普通投手命中的地面目标。

    // [原源码行 13514] 本次大招按开大前星级结算，随后升1星：

    // [原源码行 13515] 1星、2星各让后续大招+15冰豆；1/2/3星各让开大率+2%。

    // [原源码行 13533] 只回复机枪射手自身。

    // [原源码行 13537] 不再用大招弹幕时长覆盖攻击冷却，确保4阶保持1.3秒、5阶保持1.1秒基础攻速。

    // [原源码行 13546] 常规攻击固定为3颗普通豌豆+1颗冰豆，冰豆施加3层寒意。

    // -----------------------------------------------------------------------------

    function s7Act(p) {
      const did=s7ActCore(p);
      // 仙人掌在核心动作中依据"空中气球/地面目标"显式选择两套攻击动画。
      // splitpea/gatling/threepeater 使用 B03B/B06 fire clip，跳过 video skill 防止贴图断裂。
      if(did && p?.key !== "cactus" && !["splitpea","gatling","threepeater","scaredy"].includes(p?.key)) s7MarkPlantSkillVisual(p);
      return did
    }

    function s7ThreepeaterUlt(p, upgrade = false) {
      const lv = p.s7?.level || 0;
      const totalBullets = lv >= 4 ? 120 : 90;
      const perRow = totalBullets / 3;
      const ox = p.col + .55,
        oy = p.row + .5;
      const stepDelay = 3 / perRow;
      const hasUp = p.row - 1 >= 0,
        hasDown = p.row + 1 < ROWS;
      const hitRowMin = Math.max(0, p.row - 1);
      const hitRowMax = Math.min(ROWS - 1, p.row + 1);
      for (let i = 0; i < perRow; i++) {
        const t = perRow > 1 ? i / (perRow - 1) : 0;
        const angleRad = 60 * Math.abs(Math.sin(2 * Math.PI * t)) * Math.PI / 180;
        const dx = 5 * Math.cos(angleRad);
        const dyMag = 5 * Math.sin(angleRad);
        const delay = i * stepDelay;
        addBullet({
          x: ox,
          y: oy,
          row: p.row,
          dx: 5,
          dy: 0,
          damage: 20,
          kind: "pea",
          from: p,
          life: 8,
          delay: delay,
          hitRowMin: 0,
          hitRowMax: ROWS - 1,
          rowSpan: ROWS,
          fullscreenHit: true
        });
        if (hasUp) addBullet({
          x: ox,
          y: oy,
          row: p.row,
          dx: dx,
          dy: -dyMag,
          damage: 20,
          kind: "pea",
          from: p,
          life: 8,
          delay: delay,
          hitRowMin: 0,
          hitRowMax: ROWS - 1,
          rowSpan: ROWS,
          fullscreenHit: true
        });
        if (hasDown) addBullet({
          x: ox,
          y: oy,
          row: p.row,
          dx: dx,
          dy: dyMag,
          damage: 20,
          kind: "pea",
          from: p,
          life: 8,
          delay: delay,
          hitRowMin: 0,
          hitRowMax: ROWS - 1,
          rowSpan: ROWS,
          fullscreenHit: true
        })
      }
      p.hp = p.maxHp;
      p.s7.invincible = 3;
      p.s7.ultTimer = 3;
      addEffect(p.row, p.col + .5, upgrade ? "升级开大" : "三线大招", "#bbf7d0")
    }

    function s7BigStar(p, label = "大星星") {
      if (!state || !p || p.dead) return 0;
      const target = s7StarTarget(p);
      if (!target) return 0;
      const centerX = target.x;
      let hitCount = 0;
      for (const q of state.zombies) {
        if (q.dead || q.dying || q.friendly || q.row !== p.row || Math.abs(q.x - centerX) > 1) continue;
        if (!canPlantTargetZombie(q, {
            row: p.row,
            source: p,
            canHitAir: false,
            canHitUnderground: false,
            canHitDiving: false
          })) continue;
        const totalMax = Math.max(0, q.maxHp || 0) + finiteArray(q.armors).reduce((sum, a) => sum + Math.max(0, a
          ?.max || 0), 0);
        if (s7DirectHit(q, 143 + .07 * totalMax, p, {
            lumen: 3
          })) hitCount++
      }
      addBigStarVisual(p, hitCount, label);
      addEffect(p.row, centerX, `${label}·范围1`, "#fde047", .55);
      return hitCount
    }

    function s7Marigold(p) {
      const lv = p.s7?.level || 0;
      const totalLoss = state.plants.filter(a => !a.dead).reduce((sum, a) => sum + Math.max(0, a.maxHp - a.hp), 0);
      const rollWeightedItem = () => {
        const r = s7BattleRandom();
        return r < .6 ? "water" : r < .8 ? "fertilizer" : r < .95 ? "cart" : "box"
      };
      const rollItem = () => totalLoss > 250 ? "water" : rollWeightedItem();
      const produce = it => {
        if (it === "water") {
          const injured = state.plants.filter(a => !a.dead && a.row === p.row && a.hp < a.maxHp).sort((a, b) => a.hp /
            a.maxHp - b.hp / b.maxHp).slice(0, 2);
          for (const a of injured) {
            a.hp = Math.min(a.maxHp, a.hp + 40 + (lv >= 1 ? a.maxHp * .15 : 0));
            addEffect(a.row, a.col + .5, "水壶", "#67e8f9")
          }
        } else if (it === "fertilizer") {
          const adjacent = [plantStack(p.row, p.col - 1)[0], plantStack(p.row, p.col + 1)[0]].filter(Boolean);
          for (const a of adjacent) a.buff = Math.max(a.buff || 0, 15);
          addEffect(p.row, p.col + .5, "肥料", "#a3e635")
        } else if (it === "cart") {
          state.rakes.push({
            row: p.row,
            x: p.col + .5,
            remainingDamage: 7200,
            speed: 3.5,
            source: p
          });
          addEffect(p.row, p.col + .5, "推车7200", "#e5e7eb")
        } else {
          const z = s7Nearest(p.row, p.col, {
            range: 9,
            source: p
          });
          if (z) s7Shoot(p, z, 0, {
            kind: "giftBox",
            emoji: "🎁",
            torchable: false,
            giftBox: true
          })
        }
      };
      produce(rollItem());
      if (lv >= 5) schedulePlantEvent(p, Math.round(1.5 / FIXED_FRAME_DT), "marigoldExtra", {
        item: rollWeightedItem()
      });
      else if (lv >= 3 && s7BattleRandom() < .3) schedulePlantEvent(p, Math.round(1.5 / FIXED_FRAME_DT), "marigoldExtra", {
        item: s7BattleRandom() < .75 ? "water" : "fertilizer"
      });
      p.s7.marigoldProduce = produce;
      return true
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / updateS7Carts

    // [原源码行 13672] 水壶只在金盏花本路选择目标；金盏花自己也是合法的非满血目标。

    // -----------------------------------------------------------------------------

    function updateS7Carts(dt) {
      state.rakes = finiteArray(state.rakes);
      for (const cart of state.rakes) {
        if (!cart || cart.dead) continue;
        cart.x += (cart.speed || 3.5) * dt;
        const hits = state.zombies.filter(z => !z.dead && !z.friendly && z.row === cart.row && !isBalloonAir(z) && !
          isUnderground(z) && Math.abs(z.x - cart.x) <= .45).sort((a, b) => a.x - b.x);
        for (const z of hits) {
          if (!(cart.remainingDamage > 0)) {
            cart.dead = true;
            break
          }
          const beforeHp = Math.max(0, totalHp(z));
          let dealt = 0;
          if (z.blind) {
            const boxArmor = finiteArray(z.armors).find(a => a && a.hp > 0);
            const openCost = Math.max(1, boxArmor ? finiteNumber(boxArmor.hp, 1) : Math.max(1, finiteNumber(z.hp, 1) -
              finiteNumber(z.crit, 0)));
            const budget = Math.min(cart.remainingDamage, openCost);
            damageZombie(z, budget, {
              source: cart.source
            });
            dealt = budget
          } else {
            const budget = Math.min(cart.remainingDamage, beforeHp);
            if (beforeHp <= cart.remainingDamage) {
              killZombie(z, {
                source: cart.source,
                noCritical: true,
                instantKill: true
              })
            } else {
              damageZombie(z, budget, {
                source: cart.source,
                pierceAll: true
              })
            }
            dealt = Math.min(budget, beforeHp)
          }
          cart.remainingDamage = Math.max(0, cart.remainingDamage - dealt);
          addEffect(z.row, z.x,
            `${z.blind&&z.dead?"推车开盒":"推车伤害"}${Math.round(dealt)}·余${Math.round(cart.remainingDamage)}`, "#e5e7eb",
            .45);
          if (cart.remainingDamage <= 0) {
            cart.dead = true;
            break
          }
        }
        if (cart.x > COLS + .8) cart.dead = true
      }
      state.rakes = state.rakes.filter(cart => cart && !cart.dead)
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / drawS7Carts

    // [原源码行 13718] 金盏花推车属于普通伤害，不是“清盒/吞噬/灰烬”等不开盒机制。

    // [原源码行 13719] 盲盒应在路障护甲被推车打破时立即开盒；伤害预算只扣除实际

    // [原源码行 13720] 打掉的盲盒路障耐久，不能用 noTransform 把盲盒直接静默删除。

    // [原源码行 13734] 普通僵尸仍维持原有“推车直接结算致死”的口径，但不再压制

    // [原源码行 13735] 僵尸自身依法触发的死亡转化/亡语。

    // -----------------------------------------------------------------------------

    function drawS7Carts() {
      if (!state) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${layout.cell*.34}px serif`;
      for (const cart of finiteArray(state.rakes)) {
        if (!renderSafeRow(cart.row) || !renderSafeX(cart.x)) continue;
        ctx.fillText("🛒", layout.x + cart.x * layout.cell, cy(cart.row))
      }
      ctx.restore()
    }
    const S7_CATTAIL_TURRET_PROJECTILE_SPEED = 3; // 25Hz 固定逻辑帧下每帧 0.12 格。
    const S7_CATTAIL_TURRET_RULE = Object.freeze({
      duration: 6,
      rounds: 20,
      spikesPerRound: 3,
      roundInterval: 6 / 20,
      spikeDamage: 12,
      spikeGap: .08
    });

    function s7SpawnTurret(p) {
      if (!p || p.dead || !finiteArray(state.plants).includes(p)) return false;
      state.s7 = state.s7 || {};
      state.s7.turrets = finiteArray(state.s7.turrets);
      const row = clamp(Math.round(finiteNumber(p.row, 0)), 0, ROWS - 1);
      const x = finiteNumber(p.col, 0) + .5;
      if (!renderSafeX(x)) return false;
      if (state.s7.turrets.length >= PERF.MAX_TURRETS) state.s7.turrets.shift();
      state.s7.turrets.push({
        row: row,
        x: x,
        age: 0,
        nextRoundAt: 0,
        roundsFired: 0,
        roundsLeft: S7_CATTAIL_TURRET_RULE.rounds,
        source: p
      });
      addEffect(row, x, "浮游炮·6秒20轮60刺", "#bae6fd");
      return true
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7FireTurretRound

    // [原源码行 13787] 炮位只由所属猫尾草决定，禁止使用被击杀僵尸所在行或命中位置。

    // -----------------------------------------------------------------------------

    function s7FireTurretRound(t) {
      // 浮游炮的射击时间轴与当前是否存在僵尸彻底解耦：生成后固定完成20轮、每轮3刺。
      // 有合法同行目标时，小刺沿用追踪；没有目标时仍立即生成并沿本行向右直飞，之后可正常碰撞命中。
      const target = s7LaneTarget(t.row, {
        canHitAir: true,
        source: t.source,
        sourceKey: "cattail",
        preferFlyingBalloon: true
      });
      for (let i = 0; i < S7_CATTAIL_TURRET_RULE.spikesPerRound; i++) addBullet({
        x: t.x + .18,
        y: t.row + .5,
        row: t.row,
        // 固定25Hz：3格/秒 × 0.04秒 = 每帧0.12格。
        dx: S7_CATTAIL_TURRET_PROJECTILE_SPEED,
        homingSpeed: S7_CATTAIL_TURRET_PROJECTILE_SPEED,
        damage: S7_CATTAIL_TURRET_RULE.spikeDamage,
        kind: "cattailSmall",
        from: t.source,
        torchable: false,
        cattailSmall: true,
        homing: !!target,
        target: target || null,
        targetId: target?.id || null,
        airOk: true,
        strictRow: true,
        life: 8,
        delay: i * S7_CATTAIL_TURRET_RULE.spikeGap
      });
      t.roundsFired++;
      t.roundsLeft = Math.max(0, S7_CATTAIL_TURRET_RULE.rounds - t.roundsFired);
      t.nextRoundAt += S7_CATTAIL_TURRET_RULE.roundInterval
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7UpdateTurrets

    // [原源码行 13834] 不论当前是否有目标，时间轴上的这一轮都已消耗；浮游炮必须严格在6秒内结束。

    // -----------------------------------------------------------------------------

    function s7UpdateTurrets(dt, rowFilter = null) {
      if (!state.s7?.turrets) return;
      state.s7.turrets = finiteArray(state.s7.turrets);
      for (const t of state.s7.turrets) {
        if (!t || !renderSafeRow(t.row) || !renderSafeX(t.x)) {
          if (t) t.roundsLeft = 0;
          continue
        }
        if (rowFilter !== null && t.row !== rowFilter) continue;
        t.age = Math.max(0, finiteNumber(t.age, 0)) + dt;
        t.roundsFired = clamp(Math.floor(finiteNumber(t.roundsFired, 0)), 0, S7_CATTAIL_TURRET_RULE.rounds);
        t.nextRoundAt = Math.max(0, finiteNumber(t.nextRoundAt, t.roundsFired * S7_CATTAIL_TURRET_RULE.roundInterval));
        while (t.roundsFired < S7_CATTAIL_TURRET_RULE.rounds && t.age + 1e-9 >= t.nextRoundAt) s7FireTurretRound(t)
      }
      state.s7.turrets = state.s7.turrets.filter(t => t && t.roundsFired < S7_CATTAIL_TURRET_RULE.rounds && t.age <
        S7_CATTAIL_TURRET_RULE.duration && renderSafeRow(t.row) && renderSafeX(t.x))
    }

