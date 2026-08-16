"use strict";

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ShootDelayed

    // [原源码行 11484] 刚升到5阶立即发一次盾，随后严格每120秒刷新；护盾不叠加。

    // [原源码行 11588] 环绕 5 颗小星星：最多 5 颗，每秒补充 1 颗；敌人进入左 1 / 右 1 格时自动消耗，必叠 1 层光标。

    // [原源码行 11602] 真实发射可见的小星星，而不是瞬间扣血；命中必叠1层光标。

    // [原源码行 11670] 缩头时攻击间隔立即变为2秒；低于0.5秒时完全免疫缩头。

    // [原源码行 11694] 正在持续对敌射击时不属于“空闲”，不能反向恢复攻击间隔。

    // -----------------------------------------------------------------------------

    function s7ShootDelayed(p, target, damage, opt = {}, idx = 0) {
      return s7Shoot(p, target, damage, {
        ...opt,
        delay: opt.delay ?? idx * .2
      })
    }
    const S7_GLOOM_RULE = Object.freeze({
      pulseDamage: 20,
      pulseCount: 4,
      pulseGap: .2,
      baseLeftCols: 1,
      baseRightCols: 1,
      upgradedRightCols: 2,
      rowRadius: 1,
      darkByLevel: Object.freeze([1, 1, 1, 1, 2, 2]),
      passiveRegen: 10,
      attackHealMultiplierByLevel: Object.freeze([0, 0, 0, 1, 6, 6]),
      executeDarkLayers: 5,
      pierceThreshold: 5,
      executeHpRatio: .3,
      executeHeal: 800
    });

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7GloomRange

    // [原源码行 12048] 图片 5：忧郁菇唯一规则源。忧郁菇是默认同行规则的另一明确例外，

    // [原源码行 12049] 其攻击范围严格保持文档规定的0阶3×3、1阶起3×4。

    // -----------------------------------------------------------------------------

    function s7GloomRange(p) {
      const lv = clamp(p?.s7?.level || 0, 0, 5);
      const centerX = p.col + .5;
      return {
        minRow: Math.max(0, p.row - S7_GLOOM_RULE.rowRadius),
        maxRow: Math.min(ROWS - 1, p.row + S7_GLOOM_RULE.rowRadius),
        minX: centerX - S7_GLOOM_RULE.baseLeftCols - .5,
        maxX: centerX + (lv >= 1 ? S7_GLOOM_RULE.upgradedRightCols : S7_GLOOM_RULE.baseRightCols) + .5,
        leftCell: p.col - S7_GLOOM_RULE.baseLeftCols,
        rightCell: p.col + (lv >= 1 ? S7_GLOOM_RULE.upgradedRightCols : S7_GLOOM_RULE.baseRightCols)
      }
    }

    function s7GloomTargets(p) {
      const range = s7GloomRange(p);
      return state.zombies.filter(q => !q.dead && !q.dying && !q.friendly && !isBalloonAir(q) && !isUnderground(q) && q
        .row >= range.minRow && q.row <= range.maxRow && q.x >= range.minX && q.x <= range.maxX)
    }

    function s7GloomMaxTotalHp(z) {
      return Math.max(1, (z?.maxHp || 0) + finiteArray(z?.armors).reduce((sum, a) => sum + Math.max(0, finiteNumber(a
        ?.max, 0)), 0))
    }

    function s7PaintGloomPulse(p, pulseIndex, hitCount) {
      if (hitCount <= 0) return;
      const range = s7GloomRange(p);
      for (let r = range.minRow; r <= range.maxRow; r++) {
        for (let c = range.leftCell; c <= range.rightCell; c++) {
          if (c >= 0 && c < COLS) addGridEffect(r, c, "#9333ea", .45, false)
        }
      }
      s7AddSpriteEffect('gloomPulse', p.row, p.col + .5, .48, {frameOffset:pulseIndex*2,scale:1.05,opacity:.95});
      addEffect(p.row, p.col + .5, `忧郁第${pulseIndex+1}段·20`, "#9333ea", .35)
    }

    function s7ResolveGloomPulse(p, payload = {}) {
      if (!p || p.dead || p.s7?.fakeDeath > 0 || isMushroomAsleep(p)) return 0;
      const lv = clamp(p.s7?.level || 0, 0, 5);
      const pulseIndex = clamp(payload.pulseIndex || 0, 0, S7_GLOOM_RULE.pulseCount - 1);
      let hit = 0;
      for (const q of s7GloomTargets(p)) {
        if (q.dead) continue;
        const darkBefore = Math.max(0, s7Elem(q).dark || 0);
        if (lv >= 5 && darkBefore >= 5 && totalHp(q) < s7GloomMaxTotalHp(q) * .3) {
          const wasBlind = !!q.blind;
          if (!killZombie(q, {
              source: p,
              noCritical: true,
              instantKill: true
            })) continue;
          if (wasBlind) {
            addEffect(q.row, q.x, "满暗熠开盒", "#c084fc", .7)
          } else {
            const heal = S7_GLOOM_RULE.executeHeal;
            p.hp = Math.min(p.maxHp, p.hp + heal);
            addEffect(q.row, q.x, `满暗熠斩杀·回血${heal}`, "#c084fc", .7)
          }
          hit++;
          continue
        }
        const did = s7DirectHit(q, 20, p, {
          ignore2: true,
          // 曾哥每一段伤害各叠暗曜（0-3阶1层，4阶起2层）；4段连击合计4/8层。
          dark: S7_GLOOM_RULE.darkByLevel[lv] || 1,
          pierceAll: darkBefore >= 5
        });
        if (!did) continue;
        hit++;
        if (lv >= 3) {
          const mult = lv >= 4 ? 6 : 1;
          const heal = (s7Elem(q).dark || 0) * mult;
          p.hp = Math.min(p.maxHp, p.hp + heal)
        }
      }
      s7PaintGloomPulse(p, pulseIndex, hit);
      return hit
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7StartGloomAttack

    // [原源码行 12152] 盲盒满足斩杀线时只执行开盒，不计为斩杀，也不触发800回血。

    // 最新口径：一轮攻击包含4段伤害，每段实际命中都叠1层暗曜；

    // 因此一次完整攻击行为最多叠4层，不再在4段之间共享 markedIds。

    // -----------------------------------------------------------------------------

    function s7StartGloomAttack(p) {
      const targets = s7GloomTargets(p);
      if (!targets.length) return false;
      const payload = {
        pulseIndex: 0
      };
      s7ResolveGloomPulse(p, payload);
      const framesPerPulse = Math.max(1, Math.round(S7_GLOOM_RULE.pulseGap / FIXED_FRAME_DT));
      for (let i = 1; i < S7_GLOOM_RULE.pulseCount; i++) {
        schedulePlantEvent(p, framesPerPulse * i, "gloomPulse", {
          pulseIndex: i
        })
      }
      return true
    }
    const S7_SUNFLOWER_RULE = Object.freeze({
      sunPerNormalProduction: 25,
      lumenLayersByLevel: Object.freeze([1, 1, 2, 2, 2, 2]),
      illuminateFromLevel: 3,
      illuminateDuration: 4,
      illuminateAttackSpeedMultiplier: 2,
      specialSunFromLevel: 5,
      specialSunLumenLayers: 1,
      sunPeakTime: .96,
      sunPeakHeight: .9,
      normalSunFlight: .96,
      sideSunFlight: 1.92,
      specialSunFlight: .96
    });
    const S7_SUNFLOWER_SHINE_TARGETS = new Set(Object.freeze([
      "starfruit", "melon", "fume", "gloom", "potato", "gatling", "winter", "repeater", "reverseRepeater",
      "scaredy", "ghost", "snowpea", "cabbage", "threepeater", "splitpea", "puff", "seashroom", "cattail",
      "firelotus", "spikerock", "cactus", "timegrass"
    ]));

    function s7SunflowerCanShinePlant(p) {
      return !!(p && !p.dead && S7_SUNFLOWER_SHINE_TARGETS.has(p.key))
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7SunflowerEnemyZombies

    // [原源码行 12199] 向日葵唯一规则源：所有效果都在对应阳光“消失”时结算，

    // [原源码行 12200] 不得在生产动作触发瞬间提前叠光标或提前给予照耀。

    // -----------------------------------------------------------------------------

    function s7SunflowerEnemyZombies(row) {
      return finiteArray(state?.zombies).filter(z => z && !z.dead && !z.dying && !z.friendly && z.row === row)
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ApplySunflowerLumen

    // [原源码行 12216] 文档写的是“本行全部僵尸”，因此不受飞行、地下、潜水、盲盒或

    // [原源码行 12217] 常规索敌状态限制；只排除死亡结算中的实体和友方僵尸。

    // -----------------------------------------------------------------------------

    function s7ApplySunflowerLumen(z, layers, source) {
      if (!z || z.dead || z.dying || z.friendly || layers <= 0) return false;
      if (!z.friendly && s7HasBlackOliveElementAura(z.row)) layers = Math.ceil(layers / 2);
      const e = s7Elem(z);
      e.lumen = Math.min(4, Math.max(0, e.lumen || 0) + layers);
      e.lumenT = 5;
      z.lastElementSource = source || z.lastElementSource || null;
      return true
    }

    function s7SunflowerSource(token) {
      if (!state || !token) return null;
      return finiteArray(state.plants).find(p => p && p.id === token.sourceId) || null
    }

    function s7SpawnSunflowerSun(p, kind, opt = {}) {
      if (!state || !p || p.dead) return null;
      state.s7 = state.s7 || {};
      state.s7.sunflowerSuns = finiteArray(state.s7.sunflowerSuns);
      const duration = kind === "side" ? S7_SUNFLOWER_RULE.sideSunFlight : kind === "special" ? S7_SUNFLOWER_RULE
        .specialSunFlight : S7_SUNFLOWER_RULE.normalSunFlight;
      const token = {
        id: uid++,
        kind: kind,
        row: p.row,
        startX: p.col + .5,
        targetX: Number.isFinite(opt.targetX) ? opt.targetX : p.col + .5,
        targetCol: Number.isFinite(opt.targetCol) ? opt.targetCol : null,
        targetPlantId: Number.isFinite(opt.targetPlantId) ? opt.targetPlantId : null,
        sourceId: p.id,
        layers: Math.max(0, opt.layers | 0),
        age: 0,
        duration: duration,
        dead: false
      };
      state.s7.sunflowerSuns.push(token);
      if (state.s7.sunflowerSuns.length > PERF.MAX_SUNFLOWER_SUNS) state.s7.sunflowerSuns.splice(0, state.s7
        .sunflowerSuns.length - PERF.MAX_SUNFLOWER_SUNS);
      return token
    }

    function s7ResolveSunflowerSun(token) {
      if (!state || !token || token.dead) return false;
      const source = s7SunflowerSource(token);
      if (token.kind === "side") {
        const target = finiteArray(state.plants).find(p => p && !p.dead && p.id === token.targetPlantId && p.row ===
          token.row && p.col === token.targetCol);
        if (s7SunflowerCanShinePlant(target)) {
          target.s7 = target.s7 || {};
          target.s7.shine = Math.max(target.s7.shine || 0, S7_SUNFLOWER_RULE.illuminateDuration);
          addEffect(target.row, target.col + .5, "照耀4秒·攻速+100%", "#fef08a", .55);
          return true
        }
        return false
      }
      if (token.kind === "normal") state.sun = (state.sun || 0) + S7_SUNFLOWER_RULE.sunPerNormalProduction;
      const layers = token.kind === "special" ? S7_SUNFLOWER_RULE.specialSunLumenLayers : token.layers;
      let marked = 0;
      for (const z of s7SunflowerEnemyZombies(token.row))
        if (s7ApplySunflowerLumen(z, layers, source)) marked++;
      addEffect(token.row, token.startX, token.kind === "special" ? `特殊小阳光消失·全行光标+${layers}` : `大阳光消失·全行光标+${layers}`,
        token.kind === "special" ? "#fff7ae" : "#fde047", .55);
      return marked > 0
    }

    function s7UpdateSunflowerSuns(dt) {
      if (!state?.s7) return;
      state.s7.sunflowerSuns = finiteArray(state.s7.sunflowerSuns);
      for (const token of state.s7.sunflowerSuns) {
        if (!token || token.dead) continue;
        token.age = Math.max(0, finiteNumber(token.age, 0) + Math.max(0, dt));
        if (token.age + 1e-9 >= finitePositive(token.duration, .96)) {
          s7ResolveSunflowerSun(token);
          token.dead = true
        }
      }
      state.s7.sunflowerSuns = state.s7.sunflowerSuns.filter(token => token && !token.dead && renderSafeRow(token
        .row) && renderSafeX(token.startX))
    }

    function drawSunflowerSuns() {
      const suns = finiteArray(state?.s7?.sunflowerSuns);
      if (!suns.length) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const token of suns) {
        if (!token || token.dead) continue;
        const duration = finitePositive(token.duration, .96);
        const elapsed = clamp(finiteNumber(token.age, 0), 0, duration);
        const t = clamp(elapsed / duration, 0, 1);
        const ease = t * t * (3 - 2 * t);
        const peakTime = S7_SUNFLOWER_RULE.sunPeakTime;
        const peakHeight = S7_SUNFLOWER_RULE.sunPeakHeight;
        const initialUpSpeed = 2 * peakHeight / peakTime;
        const gravity = initialUpSpeed / peakTime;
        const rise = Math.max(0, initialUpSpeed * elapsed - .5 * gravity * elapsed * elapsed);
        let gx = finiteNumber(token.startX, 0);
        let gy = token.row + .5 - rise;
        let size = .32;
        if (token.kind === "side") {
          gx += (finiteNumber(token.targetX, gx) - gx) * ease;
          size = .22
        } else {
          gx += Math.sin(Math.PI * t * 2) * (token.kind === "special" ? .045 : .025);
          size = token.kind === "special" ? .22 : .32
        }
        const x = layout.x + gx * layout.cell;
        const y = layout.y + gy * layout.cell;
        ctx.globalAlpha = clamp(1 - Math.max(0, t - .82) / .18, 0, 1);
        ctx.shadowColor = token.kind === "special" ? "#fff7ae" : "#facc15";
        ctx.shadowBlur = layout.cell * (token.kind === "normal" ? .22 : .14);
        ctx.font = `${layout.cell*size}px serif`;
        ctx.fillText("☀️", x, y)
      }
      ctx.restore()
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ActSunflower

    // [原源码行 12344] 特殊小阳光必须与普通小阳光使用相同贴图，仅通过轻微光晕区分内部类型。

    // -----------------------------------------------------------------------------

    function s7ActSunflower(p) {
      const lv = clamp(p.s7?.level || 0, 0, 5);
      const row = p.row;
      const col = p.col;
      const baseLayers = S7_SUNFLOWER_RULE.lumenLayersByLevel[lv];
      s7SpawnSunflowerSun(p, "normal", {
        layers: baseLayers
      });
      if (lv >= S7_SUNFLOWER_RULE.illuminateFromLevel) {
        const neighbors = finiteArray(state.plants).filter(q => !q.dead && q.row === row && Math.abs(q.col - col) === 1 &&
          s7SunflowerCanShinePlant(q)).sort((a, b) => a.col - b.col);
        for (let i = 0; i < 2 && i < neighbors.length; i++) {
          const t = neighbors[i];
          s7SpawnSunflowerSun(p, "side", {
            targetX: t.col + .5,
            targetCol: t.col,
            targetPlantId: t.id
          })
        }
      }
      if (lv >= S7_SUNFLOWER_RULE.specialSunFromLevel) {
        s7SpawnSunflowerSun(p, "special", {
          layers: S7_SUNFLOWER_RULE.specialSunLumenLayers
        })
      }
      return true
    }
    const S7_MELON_RULE = Object.freeze({
      goldChance: .005,
      chainChanceByLevel: Object.freeze([.3, .3, .45, .45, .6, .6]),
      growthChance: .75,
      baseDamage: 80,
      baseAoe: .75,
      growthDirectBonus: 40,
      growthSplashBonus: 10,
      cannonGrowthThreshold: 3,
      cannonRadius: 2,
      cannonBaseDamage: 420,
      cannonGrowthDamageBonus: 40
    });
    const S7_GATLING_RULE = Object.freeze({
      normalPeas: 3,
      normalIcePeas: 1,
      iceColdLayers: 3,
      ultPeas: 80,
      ultBaseIcePeas: 15,
      ultChanceByLevel: Object.freeze([0, 0, 0, .025, .03, .1]),
      starChanceBonus: .02,
      starIceBonus: 15,
      maxStars: 3,
      starsWithIceBonus: 2,
      ultSelfHeal: 100,
      iceBreakRadius: 1.25,
      iceBreakDamagePerCold: 5
    });

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7GatlingBaseUltChance

    // [原源码行 12373] 图片 3：西瓜投手唯一规则源。

    // [原源码行 12388] 图片 2：机枪射手唯一规则源。所有数值均从这里读取，避免描述与战斗逻辑漂移。

    // -----------------------------------------------------------------------------

    function s7GatlingBaseUltChance(level) {
      return S7_GATLING_RULE.ultChanceByLevel[clamp(level | 0, 0, 5)] || 0
    }

    function s7GatlingUltChance(p) {
      const level = p?.s7?.level || 0;
      const stars = level >= 5 ? clamp(p?.s7?.gatlingStars || 0, 0, S7_GATLING_RULE.maxStars) : 0;
      return s7GatlingBaseUltChance(level) + stars * S7_GATLING_RULE.starChanceBonus
    }

    function s7FireGatlingBurst(p, target, peaCount, iceCount, interval = .02) {
      peaCount = Math.max(0, peaCount | 0);
      iceCount = Math.max(0, iceCount | 0);
      const total = peaCount + iceCount;
      if (!target || total <= 0) return 0;
      let peasFired = 0;
      let iceFired = 0;
      for (let i = 0; i < total; i++) {
        const shouldFireIce = iceFired < iceCount && (peasFired >= peaCount || Math.floor((i + 1) * iceCount / total) >
          iceFired);
        if (shouldFireIce) iceFired++;
        else peasFired++;
        s7Shoot(p, target, 20, {
          kind: shouldFireIce ? "ice" : "pea",
          cold: shouldFireIce ? 3 : 0,
          delay: i * interval,
          torchable: true
        })
      }
      return Math.max(0, (total - 1) * interval)
    }
    const S7_BLOVER_KNOCKBACK = .2;
    const S7_BLOVER_PUSH_PER_FRAME = 1 / 20;
    const S7_BLOVER_PUSH_FRAMES = 4;

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ApplyBloverKnockback

    // [原源码行 12419] 均匀穿插冰豆，避免先发完全部普通豆后才出现冰豆。

    // -----------------------------------------------------------------------------

    function s7ApplyBloverKnockback(z) {
      if (!z || z.dead || z.type === "blackolive") return 0;
      if (!z.s7BloverPush) z.s7BloverPush = {
        remaining: S7_BLOVER_KNOCKBACK
      };
      else z.s7BloverPush.remaining = S7_BLOVER_KNOCKBACK;
      return S7_BLOVER_KNOCKBACK
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ChomperLevelCap

    // [原源码行 12441] 逐帧击退：每帧向右移动 1/20 格，持续 4 帧（0.16 秒）

    // [原源码行 12442] 期间僵尸正常移动不受阻断，最终位移 = 正常移动 + 击退

    // -----------------------------------------------------------------------------

    function s7ChomperLevelCap(p) {
      const lv = p.s7?.level || 0;
      return lv >= 4 ? 20 : lv >= 2 ? 15 : 8
    }

    function s7ChomperRange(p) {
      const eaten = Math.min(s7ChomperLevelCap(p), p.s7?.eaten || 0);
      return 1.625 + eaten * .5
    }

    const S7_CHOMPER_BITE_KNOCKBACK = .2;

    function s7ApplyChomperBiteKnockback(z) {
      if (!z || z.dead || isUnderground(z) || isBalloonAir(z)) return 0;
      return Math.max(0, s7ApplyZombieKnockback(z, S7_CHOMPER_BITE_KNOCKBACK, {
        maxX: COLS + .3,
        reason: "大嘴花撕咬击退"
      }))
    }

    function s7ChomperDigest(p) {
      const eaten = Math.min(s7ChomperLevelCap(p), p.s7?.eaten || 0);
      // 测试口径：这里仅表示不含 bite 前摇和 swallow 后摇的纯消化 CD；初始 40 秒，每吞一只 -2 秒。
      return Math.max(0, 40 - eaten * 2)
    }

    function s7ChomperClearPhase(p) {
      if (!p?.s7) return;
      p.s7.chomperPhase = null;
      p.s7.chomperTarget = null;
      p.s7.chomperTimer = 0;
      p.s7.chomperTime = 0
    }

    function s7ChomperStartPostSwing(p, swallowed) {
      if (!p?.s7) return;
      p.s7.chomperPhase = swallowed ? "swallow" : "recover";
      p.s7.chomperTarget = null;
      p.s7.chomperTimer = 0;
      p.s7.chomperTime = 0
    }

    function s7ChomperConsumeLockedTarget(p) {
      const z = p?.s7?.chomperTarget;
      if (!p || !p.s7 || !z || z.dead || z.removed || !s7ChomperCanSwallow(z) || !s7ChomperCanReachTarget(p, z)) return false;
      killZombie(z, {
        source: p,
        noCritical: true,
        noTransform: true
      });
      const cap = s7ChomperLevelCap(p),
        old = p.s7.eaten || 0;
      p.s7.eaten = Math.min(cap, old + 1);
      p.s7.biteBonus = 0;
      p.s7.exec = 0;
      p.maxHp = s7MaxHp(p);
      p.hp = Math.min(p.maxHp, p.hp + 300);
      p.s7.chomperTarget = null;
      addEffect(p.row, p.col + .5, `吞噬${p.s7.eaten}/${cap}`, "#fca5a5");
      return true
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7ChomperCanSwallow

    // [原源码行 12458] PVZ1 原版大嘴花消化时间为42秒；每次成长固定缩短2秒。

    // -----------------------------------------------------------------------------

    function s7ChomperCanSwallow(z) {
      if (!z) return false;
      if (z.blind) return true;
      return !z.flags?.garg && !z.s7?.noEat && z.type !== "giga"
    }

    function s7ChomperCanReachTarget(p, z) {
      if (!p || !z || z.dead || z.removed) return false;
      if (z.row !== p.row) return false;
      // 大嘴花只能吞噬/撕咬自己本格或右侧的僵尸：本格左边界为 p.col。
      // 不使用 s7Nearest 默认的 col - .2 容差，避免贴在左侧的僵尸被误吃。
      if (z.x < p.col) return false;
      return Math.abs(z.x - (p.col + .5)) <= s7ChomperRange(p)
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7SquashTarget

    // [原源码行 12463] 所有盲盒（含指令盲盒）对大嘴花都按“吞噬不开盒”处理；

    // [原源码行 12464] 指令单位的 noEat 标记不能把盲盒错误导向撕咬开盒分支。

    // -----------------------------------------------------------------------------

    function s7SquashTarget(p, fromX, chained = false) {
      const origin = fromX != null ? fromX : p.col;
      // 前2后1：找出origin前面2格、后面1格范围内的僵尸
      const lo = origin - 1.05;
      const hi = origin + 2.55;
      if (p.s7?.squashLastHitId != null) {
        const last = state.zombies.find(z => !z.dead && !z.dying && !z.friendly && !z.s7KelpPoison && z.id === p.s7
          .squashLastHitId && z.row === p.row && canPlantTargetZombie(z, {
            row: p.row
          }) && z.x >= lo && z.x <= hi);
        if (last) return last;
        p.s7.squashLastHitId = null
      }
      return state.zombies.filter(z => !z.dead && !z.dying && !z.friendly && !z.s7KelpPoison && z.row === p.row &&
        canPlantTargetZombie(z, {
          row: p.row
        }) && z.x >= lo && z.x <= hi).sort((a, b) => a.x - b.x)[0] || null
    }

    function triggerS7SquashDeath(p) {
      const homeX = p.col + .5;
      const z = s7SquashTarget(p, homeX);
      const tx = z ? z.x : homeX + 2;
      p.s7.squashState = "targeting";
      p.s7.squashTimer = .6;
      p.s7.squashChain = 0;
      p.s7.squashDeath = true;
      p.s7.squashDeathTargetX = tx;
      p.s7.squashCurX = homeX;
      p.s7.squashYOffset = 0;
      p.s7.squashAway = false;
      addEffect(p.row, tx, "亡语锁定", "#a3e635", .6)
    }

    function updateShadowSpikes(dt) {
      state.shadowSpikes = finiteArray(state.shadowSpikes);
      const end = DAMAGE_BOUNDARY_X + .5;
      for (const sp of state.shadowSpikes) {
        if (!sp || sp.hp <= 0) continue;
        sp.x = finiteNumber(sp.x, .5) + 1.25 * dt;
        if (sp.x >= end) {
          sp.hp = 0;
          continue
        }
        sp.dmgCd = finiteNumber(sp.dmgCd, 0) - dt;
        if (sp.dmgCd <= 0) {
          sp.dmgCd += 1;
          const owner = state.plants.find(p => !p.dead && p.id === sp.ownerId && p.key === "spikerock") || null;
          for (const q of state.zombies) {
            if (q.dead || q.friendly || isBalloonAir(q) || isUnderground(q) || q.row !== sp.row || Math.abs(q.x - sp
              .x) >= .7) continue;
            s7DirectHit(q, 100, owner, {
              ignore2: true
            })
          }
        }
      }
      state.shadowSpikes = state.shadowSpikes.filter(x => x && x.hp > 0 && x.x < end)
    }

    function tryShadowSpikeHeavyContact(z, dt) {
      if (!state.shadowSpikes) return false;
      const s = state.shadowSpikes.find(sp => sp && sp.hp > 0 && sp.row === z.row && Math.abs(z.x - sp.x) < .45);
      if (!s) return false;
      if (isSpikePunctureVehicle(z)) {
        s.hp = 0;
        killZombie(z, {
          noCritical: true,
          noTransform: true,
          system: true
        });
        addEffect(s.row, s.x, "暗影地刺秒杀车辆后消失", "#f87171", .6);
        return true
      }
      z.attackCd -= dt;
      if (z.attackCd <= 0) {
        z.attackCd = z.flags?.garg ? TIMES.gargHammer : .45;
        s.hp = 0;
        addEffect(s.row, s.x, z.flags?.garg ? "暗刺被砸" : "暗刺被压", "#f87171")
      }
      return true
    }

    function drawShadowSpikes() {
      if (!state || !state.shadowSpikes) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const s of finiteArray(state.shadowSpikes)) {
        if (!s || !renderSafeRow(s.row) || !renderSafeX(s.x)) continue;
        const x = layout.x + finiteNumber(s.x, 6) * layout.cell,
          y = cy(Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(s.row, 0)))));
        ctx.font = `${layout.cell*.3}px serif`;
        ctx.fillText("📍", x, y + layout.cell * .03);
        ctx.fillStyle = "#c084fc";
        ctx.font = `${layout.cell*.08}px sans-serif`;
        ctx.fillText("暗刺", x, y - layout.cell * .26)
      }
      ctx.restore()
    }
    const S7_BARLEY_RULE = Object.freeze({
      initialWindup: 5,
      transformInterval: 30.1,
      pepperDormantTime: 30,
      pepperFollowupWindup: 5,
      pepperToken: "__barley_jalapeno__"
    });

    function s7BarleyTransformPool() {
      return [...PLANT_ORDER.filter(candidate => candidate !== "barley"), S7_BARLEY_RULE.pepperToken]
    }

    // -----------------------------------------------------------------------------

    // S7植物/元素 / s7SetBarleyBody

    // [原源码行 12601] 火爆辣椒与每一种非大麦植物各占一个等权条目。

    // -----------------------------------------------------------------------------

    function s7SetBarleyBody(p, windup = S7_BARLEY_RULE.initialWindup) {
      const cycle = Math.max(0, Math.floor(finiteNumber(p.s7?.barleyCycle, 0)));
      p.key = "barley";
      p.kind = "s7";
      p.s7 = {
        exp: 0,
        barleyOriginal: true,
        barleyCycle: cycle,
        barleyPhase: "windup",
        barleyTransformCd: windup,
        barleyPepperDormant: false
      };
      p.hp = p.maxHp = PLANT_RULES.barley.hp[0];
      p.cd = 999;
      p.asleep = false;
      s7InitPlant(p, true);
      p.s7.barleyOriginal = true;
      p.s7.barleyCycle = cycle;
      p.s7.barleyPhase = "windup";
      p.s7.barleyTransformCd = windup;
      p.s7.barleyPepperDormant = false;
      p.cd = 999
    }

    function s7BarleyPepperExplosion(p) {
      let blindKills = 0,
        otherHits = 0;
      for (const z of [...finiteArray(state.zombies)]) {
        if (!z || z.dead || z.dying || z.friendly || z.row !== p.row) continue;
        if (z.blind) {
          if (killZombie(z, {
              source: p,
              noCritical: true,
              noTransform: true,
              system: true
            })) blindKills++;
          continue
        }
        if (damageZombie(z, ASH, {
            source: p,
            ash: true,
            system: true
          })) otherHits++
      }
      addGridEffect(p.row, p.col, "#ef4444", 6, false);
      addEffect(p.row, p.col + .5, `大麦辣椒·盲盒秒杀${blindKills}·其他1800×${otherHits}`, "#fb923c", 1)
    }

    function s7SetBarleyPepperDormant(p) {
      const cycle = Math.max(0, Math.floor(finiteNumber(p.s7?.barleyCycle, 0))) + 1;
      p.key = "barley";
      p.kind = "s7";
      p.s7 = {
        exp: 0,
        level: 0,
        maxExp: 0,
        barleyOriginal: true,
        barleyCycle: cycle,
        barleyPhase: "pepperDormant",
        barleyTransformCd: S7_BARLEY_RULE.pepperDormantTime,
        barleyPepperDormant: true
      };
      p.hp = p.maxHp = PLANT_RULES.barley.hp[0];
      p.cd = 999;
      p.asleep = false;
      s7BarleyPepperExplosion(p)
    }

    function s7SetBarleyPlantForm(p, key, level) {
      const cycle = Math.max(0, Math.floor(finiteNumber(p.s7?.barleyCycle, 0))) + 1;
      const randomLevel = clamp(Math.floor(finiteNumber(level, 0)), 0, 5);
      p.key = key;
      p.kind = "s7";
      p.s7 = {
        exp: s7Thresholds(key)[randomLevel],
        barleyOriginal: true,
        barleyCycle: cycle,
        barleyPhase: "plant",
        barleyTransformCd: S7_BARLEY_RULE.transformInterval,
        barleyPepperDormant: false
      };
      p.hp = p.maxHp = PLANT_RULES[key].hp[randomLevel] ?? PLANT_RULES[key].hp[0];
      p.cd = 0;
      p.asleep = false;
      s7InitPlant(p, true);
      p.s7.barleyOriginal = true;
      p.s7.barleyCycle = cycle;
      p.s7.barleyPhase = "plant";
      p.s7.barleyTransformCd = S7_BARLEY_RULE.transformInterval;
      p.s7.barleyPepperDormant = false;
      p.s7.exp = s7Thresholds(key)[randomLevel];
      p.s7.level = randomLevel;
      p.s7.lastLevel = randomLevel;
      p.s7.upgradeHealedThrough = randomLevel;
      p.maxHp = s7MaxHp(p);
      p.hp = p.maxHp;
      p.cd = Math.min(.2, s7Cd(p));
      p.asleep = !!PLANTS[key]?.mushroom;
      addEffect(p.row, p.col + .5, `大麦→${PLANTS[key].name}·${randomLevel}阶`, "#fde68a")
    }

    function s7TransformBarley(p, forcedToken = null, forcedLevel = null) {
      if (!p || p.dead || !p.s7?.barleyOriginal) return false;
      const token = forcedToken || s7BattleChoose(s7BarleyTransformPool());
      if (token === S7_BARLEY_RULE.pepperToken) {
        s7SetBarleyPepperDormant(p);
        s7MarkPlantSkillVisual(p,null,'barley');
        return true
      }
      const level = forcedLevel == null ? s7BattleIrnd(0, 5) : forcedLevel;
      s7SetBarleyPlantForm(p, token, level);
      // s7SetBarleyPlantForm 会重建 p.s7；变身后重新挂载大麦技能视觉键。
      s7MarkPlantSkillVisual(p,null,'barley');
      return true
    }

    function s7UpdateBarleyLifecycle(p, dt) {
      if (!p?.s7?.barleyOriginal) return "normal";
      p.s7.barleyTransformCd = Math.max(0, finiteNumber(p.s7.barleyTransformCd, p.key === "barley" ? 5 : 30) - dt);
      if (p.s7.barleyTransformCd > 1e-9) return p.s7.barleyPepperDormant || p.key === "barley" ? "inactive" : "active";
      p.s7.barleyTransformCd = 0;
      if (p.s7.barleyPhase === "pepperDormant") {
        s7SetBarleyBody(p, S7_BARLEY_RULE.pepperFollowupWindup);
        addEffect(p.row, p.col + .5, "辣椒结束→大麦本体·前摇5秒", "#fde68a");
        return "inactive"
      }
      s7TransformBarley(p);
      return p.s7?.barleyPepperDormant || p.key === "barley" ? "inactive" : "active"
    }

    const S7_GHOST_RULE = Object.freeze({
      bigStarChanceByLevel: Object.freeze([.07, .07, .07, .07, .10, .10]),
      bigStarColdLayers: 10,
      maxChainRolls: 12
    });

    function s7ActCore(p) {
      const lv = p.s7?.level || 0,
        row = p.row,
        col = p.col;
      let z = s7Nearest(row, col, {
        canAir: plantCanAffectFlyingBalloon(p),
        source: p,
        range: 9,
        front: false
      });
      switch (p.key) {
        case "wallnut":
        case "tallnut":
        case "torchwood":
          return false;
        case "cactus": {
          const cap = [.09, .09, .12, .12, .15, .15][lv];
          // 本行只要存在仍在空中的敌方气球，就切入扎气球模式。
          // 已经被扎破或自然落地的气球不参与模式判定。
          const flyingBalloon = s7LaneTarget(row, {
            airOnly: true, canHitAir: true, source: p, sourceKey: "cactus", preferFlyingBalloon: true
          });
          const balloonMode = !!flyingBalloon;
          const q = flyingBalloon || s7Nearest(row, col, {
            range: 9, front: false, canAir: false, source: p
          });
          if (!q) return false;
          const red = lv >= 3 && s7BattleRandom() < .03;
          s7Shoot(p, q, 20, {
            kind: "cactus",
            dx: red ? 7 : 6,
            pierce: red ? 2 : 0,
            vulnAdd: .03,
            vulnCap: cap,
            cactusSpear: red,
            airOk: balloonMode,
            onlyFlyingBalloon: balloonMode,
            groundOnly: !balloonMode,
            torchable: false,
            emoji: red ? "🔱" : undefined
          });
          // 空中模式沿用当前抬高身体动画；地面模式使用本次视频提取的正常发射动画。
          s7MarkPlantSkillVisual(p, 1.10, balloonMode ? "cactus" : "cactusNormal");
          if (red) addEffect(row, col + .5, "红色长刺", "#f87171");
          return true
        }
        case "explodenut":
          return lv >= 5 ? s7LaunchExplodenutBowling(p) : false;
        case "chomper": {
          if (p.s7.chomperPhase) {
            return false
          }
          const range = s7ChomperRange(p);
          z = s7Nearest(row, col, {
            range: range,
            xMin: col
          });
          if (!z || !s7ChomperCanReachTarget(p, z)) return false;
          if (!s7ChomperCanSwallow(z)) {
            const bonus = p.s7.biteBonus || 0,
              dmg = (lv >= 1 ? 60 : 40) + bonus;
            if (lv >= 5) {
              const chance = Math.max(0, p.s7.exec || 0);
              if (s7BattleRandom() < chance) killZombie(z, {
                source: p,
                noCritical: true,
                noTransform: true
              });
              p.s7.exec = chance + .02
            }
            if (!z.dead) s7DirectHit(z, dmg, p, {
              ignore2: true
            });
            if (!z.dead) {
              const pushed = s7ApplyChomperBiteKnockback(z);
              if (pushed > 0) addEffect(z.row, z.x, `撕咬击退${pushed.toFixed(2)}格`, "#fca5a5", .35)
            }
            p.hp = Math.min(p.maxHp, p.hp + 150);
            if (lv >= 3) p.s7.biteBonus = bonus + 15;
            s7ChomperStartPostSwing(p, false);
            addEffect(row, col + .5, `撕咬${dmg}+回血150·后摇3.37s`, "#fca5a5");
            return true
          }
          p.s7.chomperTarget = z;
          if (!s7ChomperConsumeLockedTarget(p)) {
            s7ChomperClearPhase(p);
            return false
          }
          s7ChomperStartPostSwing(p, true);
          addEffect(row, col + .5, "即时吞噬·后摇3.37s", "#fca5a5");
          return true
        }
        case "garlic": {
          const arr = state.zombies.filter(q => !q.dead && !q.friendly && q.row === row && isDamageableZombie(q) && !
            isUnderground(q) && !isBalloonAir(q) && !(q.landingInvuln > 0));
          if (!arr.length) return false;
          arr.sort((a, b) => totalHp(b) - totalHp(a));
          const q = arr[0];
          q.garlicFlee = 1;
          s7ApplyElement(q, "poison", 10, p);
          addEffect(q.row, q.x, "熏跑+剧毒10", "#a3e635");
          return true
        }
        case "spikerock": {
          let hit = false;
          const targets = state.zombies.filter(q => !q.dead && !q.friendly && !isBalloonAir(q) && !isUnderground(q) && q
            .row === row && Math.abs(q.x - (col + .5)) < .65);
          for (const q of targets) {
            if (q.type === "zomboni" && q.s7?.variant) {
              s7DirectHit(q, 100, p, {
                ignore2: true
              });
              q.x = Math.min(COLS - .5, q.x + .625);
              hit = true;
              continue
            }
            const base = [20, 20, 40, 40, 50, 50][lv];
            for (let i = 0; i < 2; i++) s7DirectHit(q, base + (lv >= 5 ? 3 * (s7Elem(q).dark || 0) : 0), p, {
              ignore2: true,
              pierceAll: lv >= 5 && (s7Elem(q).dark || 0) >= 5
            });
            if (lv >= 5) s7ApplyElement(q, "dark", 1, p);
            hit = true
          }
          p.s7.shadowSummonCd = (p.s7.shadowSummonCd ?? 12) - 1;
          if (p.s7.shadowSummonCd <= 0) {
            p.s7.shadowSummonCd = 12;
            state.shadowSpikes.push({
              row: row,
              x: col + .5,
              dmgCd: 0,
              level: lv,
              hp: 300,
              ownerId: p.id
            });
            addEffect(row, col + .5, "暗影地刺", "#c084fc")
          }
          return hit || true
        }
        case "snowpea": {
          if (!z) return false;
          const chance = lv >= 2 ? .25 : .1;
          const lance = s7BattleRandom() < chance;
          if (lance) {
            // 冰锥是独立投射物：命中只生成这一枚冰锥，不再附带普通冰豆。
            // kind 不再写成 "ice"，避免后续绘制/特效链路把它重新当成普通冰豆处理。
            s7Shoot(p, z, 20, {
              kind: "iceLance",
              cold: 5,
              dx: 7,
              // pierce 表示可连续命中的总次数计数；5阶最多10个，3阶最多5个。
              pierce: lv >= 5 ? 10 : lv >= 3 ? 5 : 0,
              iceLance: true,
              pierceAll: true,
              iceLanceExpires: lv >= 3 && lv < 5,
              freezeOnHit: .5,
              emoji: "🧊"
            });
          } else {
            for (let i = 0; i < 2; i++) s7ShootDelayed(p, z, 20, {
              kind: "ice",
              cold: 2,
              dx: 5
            }, i)
          }
          return true
        }
        case "repeater": {
          z = s7Nearest(row, col, {
            range: 9,
            source: p
          });
          if (!z) return false;
          const pool = [{
            id: "pea",
            d: 20,
            kind: "pea"
          }, {
            id: "fire",
            d: 40,
            kind: "fire",
            fire: 5
          }, {
            id: "ice",
            d: 20,
            kind: "ice",
            cold: 2
          }];
          if (lv >= 1) pool.push({
            id: "orange",
            d: 70,
            kind: "fire",
            fire: 10
          });
          if (lv >= 2) pool.push({
            id: "icefire",
            d: 30,
            kind: "icefire",
            cold: 3,
            iceFireStage: 1,
            fireAttribute: false
          });
          if (lv >= 4) pool.push({
            id: "poisonfire",
            d: 40,
            kind: "spore",
            poison: 5,
            poisonFire: true
          });
          if (lv >= 5) pool.push({
            id: "redfire",
            d: 100,
            kind: "fire",
            fire: 15
          });
          const seq = [];
          if (lv < 3) {
            seq.push(s7BattleChoose(pool), s7BattleChoose(pool))
          } else {
            const used = new Set;
            const ruleLimit = lv >= 5 ? Number.POSITIVE_INFINITY : 4;
            const safetyLimit = 64;
            while (seq.length < ruleLimit && seq.length < safetyLimit) {
              const n = s7BattleChoose(pool);
              seq.push(n);
              if (used.has(n.id)) break;
              used.add(n.id)
            }
          }
          seq.forEach((b, i) => s7ShootDelayed(p, z, b.d, {
            kind: b.kind,
            fire: b.fire || 0,
            cold: b.cold || 0,
            poison: b.poison || 0,
            fireAttribute: !!b.fireAttribute || b.kind === "fire",
            iceFireStage: b.iceFireStage || 0,
            poisonFire: !!b.poisonFire
          }, i));
          return true
        }
        case "puff": {
          z = s7Nearest(row, col, {
            range: 8,
            source: p
          });
          if (!z) return false;
          const maxSpeed = s7Cd(p) <= .5001,
            eligible = lv >= 5 || lv >= 3 && maxSpeed;
          p.s7.puffNormalCount = p.s7.puffNormalCount || 0;
          if (eligible && p.s7.puffNormalCount >= 7) {
            s7Shoot(p, z, 100, {
              kind: "star",
              dark: 1,
              homing: true,
              emoji: "🖤",
              darkPierceScale: 20
            });
            p.s7.puffNormalCount = 0
          } else {
            const dmg = [50, 60, 60, 60, 80, 80][lv];
            s7Shoot(p, z, dmg, {
              kind: "spore",
              dark: s7BattleRandom() < [.2, .2, .3, .3, .3, .3][lv] ? 1 : 0
            });
            if (eligible) p.s7.puffNormalCount++
          }
          return true
        }
        case "scaredy": {
          if (p.s7.hiding) return false;
          z = s7Nearest(row, col, {
            range: 9,
            source: p
          });
          if (!z) return false;
          p.s7.scaredyInterval = Math.max(S7_SCAREDY_RULE.minInterval, s7ScaredyInterval(p) - S7_SCAREDY_RULE
            .stepPerShot);
          p.s7.scaredyIdleTime = 0;
          s7Shoot(p, z, s7ScaredyShotDamage(p), {
            kind: "spore",
            dark: s7BattleRandom() < s7ScaredyDarkChance(p) ? 1 : 0
          });
          return true
        }
        case "squash": {
          return false
        }
        case "threepeater": {
          const rows3 = [row, row - 1, row + 1].filter(r => r >= 0 && r < ROWS);
          let q = null;
          for (const r of rows3) {
            q = s7Nearest(r, col, {
              range: 9,
              source: p
            });
            if (q) break
          }
          if (q) {
            p.s7.b03bFireTimer = Math.max(p.s7.b03bFireTimer || 0, .72);
            for (let g = 0; g < 2; g++) {
              const delay = g * .2;
              s7Shoot(p, q, 20, {
                delay: delay,
                kind: "pea",
                hitRowMin: Math.max(0, row - 1),
                hitRowMax: Math.min(ROWS - 1, row + 1)
              });
              for (const amp of [1, -1]) s7Shoot(p, q, 20, {
                delay: delay,
                kind: "pea",
                hitRowMin: Math.max(0, row - 1),
                hitRowMax: Math.min(ROWS - 1, row + 1),
                rowSpan: 1,
                waveAmp: amp,
                waveFreq: Math.PI / 4,
                originX: col + .55,
                originY: row + .5,
                hitRadiusBonus: .25
              })
            }
            let prob = [.005, .0075, .01, .01, .01, .01][lv] + (lv >= 3 ? p.s7.ultProbBonus || 0 : 0);
            if (lv >= 5) {
              const nearby = state.zombies.filter(t => !t.dead && !t.friendly && rows3.includes(t.row) &&
                canPlantTargetZombie(t, {
                  row: t.row,
                  source: p
                })).map(t => Math.max(0, t.x - (col + .5)));
              if (nearby.length) {
                const nearestDist = Math.min(...nearby);
                const distFromStart = Math.max(0, Math.min(9, 9 - nearestDist));
                const distSteps = Math.floor(distFromStart / .5);
                prob += distSteps * .003
              }
            }
            prob = Math.min(lv >= 5 ? .0385 : .025, prob);
            if (s7BattleRandom() < prob) {
              s7ThreepeaterUlt(p, false);
              if (lv >= 3) {
                p.s7.ultProbBonus = Math.min(.025, (p.s7.ultProbBonus || 0) + .005);
                p.s7.threepeaterCdReduction = Math.min(.5, (p.s7.threepeaterCdReduction || 0) + .01)
              }
            }
          }
          return !!q
        }
        case "seashroom": {
          z = s7Nearest(row, col, {
            range: 8,
            source: p
          });
          if (!z || Math.abs(z.x - col) > 8) return false;
          const isClone = p.s7?.isClone;
          const dmg = lv >= 2 ? 15 : 10;
          const poisonChance = .75;
          const poisonLayers = 1;
          if (isClone) {
            s7ShootDelayed(p, z, dmg, {
              kind: "spore",
              poison: s7BattleRandom() < poisonChance ? poisonLayers : 0
            }, 0)
          } else {
            s7ShootDelayed(p, z, dmg, {
              kind: "spore",
              poison: s7BattleRandom() < poisonChance ? poisonLayers : 0
            }, 0);
            s7ShootDelayed(p, z, dmg, {
              kind: "spore",
              poison: s7BattleRandom() < poisonChance ? poisonLayers : 0
            }, 1)
          }
          return true
        }
        case "splitpea": {
          const front = s7Nearest(row, col, {
              range: 9
            }),
            back = s7Nearest(row, col, {
              back: true,
              front: false,
              range: 9
            });
          const smallPierce = lv >= 4 ? 2 : lv >= 2 ? 1 : 0;
          let did = false,
            trigger = false;
          if (front) {
            for (let i = 0; i < 2; i++) {
              s7Shoot(p, front, 0, {
                smallBurst: 5,
                smallPierce: smallPierce,
                kind: "pea",
                emoji: "💥🫛",
                delay: i * .2
              });
              if (lv >= 3 && s7BattleRandom() < .01) trigger = true
            }
            for (let i = 0; i < 2 + (lv >= 5 && p.s7.focus > 0 ? 1 : 0); i++) {
              s7Shoot(p, front, 20, {
                dx: -5,
                bounce: true,
                kind: "pea",
                delay: i * .2
              });
              if (lv >= 3 && s7BattleRandom() < .01) trigger = true
            }
            did = true
          } else if (back) {
            for (let i = 0; i < 2 + (lv >= 5 && p.s7.focus > 0 ? 1 : 0); i++) {
              s7Shoot(p, back, 20, {
                dx: -5,
                bounce: true,
                kind: "pea",
                delay: i * .2
              });
              if (lv >= 3 && s7BattleRandom() < .01) trigger = true
            }
            did = true
          }
          if (trigger) {
            p.s7.focus = 4;
            addEffect(row, col + .5, "专注4s", "#fef08a")
          }
          return did
        }
        case "cabbage": {
          const targets = s7UniqueTargets(row, col, 3, {
            range: 9,
            canHitDiving: true
          });
          if (!targets.length) return false;
          const times = lv >= 5 ? 3 : 1;
          const bounce = lv >= 3 ? 1 : 0;
          for (let t = 0; t < times; t++)
            for (const q of targets) addPultBullet(p, q, lv >= 4 ? 75 : lv >= 1 ? 73 : 70, {
              kind: "pult",
              pultBounceLeft: bounce,
              delay: t * .2
            });
          return true
        }
        case "cattail": {
          z = s7CattailGlobalTarget(p);
          if (!z) return false;
          s7Shoot(p, z, 20, {
            kind: "cattail",
            homing: true,
            airOk: true,
            delay: 0
          });
          s7Shoot(p, z, 20, {
            kind: "cattail",
            homing: true,
            airOk: true,
            delay: .2
          });
          return true
        }
        case "firelotus": {
          z = s7Nearest(row, col, {
            range: 9,
            source: p
          });
          if (!z) return false;
          const dmg = lv >= 4 ? 100 : lv >= 1 ? 80 : 60,
            fl = lv >= 2 ? 20 : 15;
          for (let i = 0; i < 3; i++) addPultBullet(p, z, dmg, {
            kind: "firelotus",
            fire: fl,
            firelotusAoe: 1.25,
            delay: i * .4,
            arcHeight: .95,
            arcTimeMultiplier: 1.5
          });
          return true
        }
        case "reverseRepeater": {
          z = s7Nearest(row, col, {
            back: true,
            front: false,
            range: 9
          }) || s7Nearest(row, col, {
            range: 9
          });
          if (!z) return false;
          const pool = [{
            d: 20
          }, {
            d: 40,
            fire: 5,
            kind: "fire"
          }, {
            d: 70,
            fire: 10,
            kind: "fire"
          }];
          if (lv >= 3) pool.push({
            d: 100,
            fire: 15,
            kind: "fire"
          });
          if (lv >= 5) pool.push({
            d: 100,
            fire: 20,
            kind: "fire",
            blackFire: true
          });
          for (let i = 0; i < 2; i++) {
            const b = s7BattleChoose(pool);
            s7Shoot(p, z, b.d, {
              dx: -5,
              bounce: true,
              kind: b.kind || "pea",
              fire: b.fire || 0,
              blackFire: b.blackFire,
              delay: i * .2
            })
          }
          return true
        }
        case "ghost": {
          if (!z) return false;
          s7TriggerUserGridPlantAction(p,.72);
          const arr = lv >= 2 ? [30, 20, 15] : [25, 15, 10];
          const randomBigStarThisAttack = s7BattleRandom() < S7_GHOST_RULE.bigStarChanceByLevel[lv];
          let volleySeq = 0;
          const fireVolley = (base, mode = "normal") => {
            // 基础攻击只滚一次7%/10%（同组至多1颗大星）；
            // 5级连射2次成功后的连击：每颗子弹独立10%概率大星（可多颗）。
            const useBigStar = mode === "base" && randomBigStarThisAttack;
            const bigStarSlot = useBigStar ? Math.floor(s7BattleRandom() * arr.length) : -1;
            const ghostVolleyId = `${p.id}:${state.frame}:${volleySeq++}`;
            arr.forEach((d, i) => {
              if (i === bigStarSlot || mode === "forced" && s7BattleRandom() < S7_GHOST_RULE.bigStarChanceByLevel[lv])
                s7Shoot(p, z, lv >= 1 ? 140 : 100, {
                kind: "star",
                bigStar: true,
                bigStarSplash: lv >= 2 ? 40 : 30,
                bigStarColdLayers: S7_GHOST_RULE.bigStarColdLayers,
                cold: S7_GHOST_RULE.bigStarColdLayers,
                ghostVolleyId: ghostVolleyId,
                emoji: "🌟",
                delay: base + i * .15
              });
              else s7Shoot(p, z, d, {
                kind: "spore",
                ghostVolleyId: ghostVolleyId,
                delay: base + i * .15
              })
            })
          };
          fireVolley(0, "base");
          const chainChance = lv >= 5 ? .3 : lv >= 3 ? .1 : 0;
          let extras = 0;
          while (chainChance > 0 && extras < S7_GHOST_RULE.maxChainRolls && s7BattleRandom() < chainChance) extras++;
          for (let e = 0; e < extras; e++) fireVolley((e + 1) * .5, lv >= 5 && e >= 2 ? "forced" : "normal");
          return true
        }
        case "sniper": {
          if ((p.s7.sniperAmmo || 0) <= 0) return false;
          z = s7SniperLockTarget(p);
          if (!z) return false;
          p.s7.sniperAmmo--;
          s7TriggerUserGridPlantAction(p,.52);
          s7Shoot(p, z, 480, {
            kind: "pea",
            homing: true,
            torchable: true,
            sniperBullet: true
          });
          p.s7.sniperLockId = null;
          return true
        }
        case "sunflower":
          return s7ActSunflower(p);
        case "sunshroom": {
          z = s7Nearest(row, col, {
            range: 9,
            canHitAir: true,
            source: p
          });
          if (!z) return false;
          const dmg = lv >= 4 ? 400 : lv >= 2 ? 300 : lv >= 1 ? 200 : 100,
            layers = lv >= 4 ? 4 : lv >= 3 ? 3 : lv >= 1 ? 2 : 1;
          const targets = state.zombies.filter(q => !q.dead && !q.friendly && q.row === row && Math.abs(q.x - z.x) <=
            1.5);
          for (const q of targets) {
            const suppressLumenChain = lv < 5;
            s7DirectHit(q, dmg, p, {
              noLumenChain: suppressLumenChain
            });
            if (!q.dead) s7DirectHit(q, dmg, p, {
              noLumenChain: suppressLumenChain
            });
            if (!q.dead) s7ApplyElement(q, "lumen", layers, p, {
              balloonAirBypass: true
            })
          }
          return true
        }
        case "hypno": {
          const bz = makeBlind(row, Math.min(COLS - .4, col + 1.5));
          bz.friendly = true;
          bz.dir = 1;
          if (lv >= 5) bz.s7CharmedBox = true;
          safePushZombie(bz, "hypno-box");
          s7GrantShineToIceStarHypno(row, 7.5, "召唤照耀");
          addEffect(row, col + .5, "魅惑盲盒", "#c084fc");
          return true
        }
        case "iceshroom": {
          for (const q of state.zombies) {
            if (q.dead || q.row !== row) continue;
            const wasAirBalloon = isBalloonAir(q);
            const applied = s7ApplyElement(q, "cold", 3, p, {
              ignoreTargetState: true,
              includeBobsled: true,
              balloonAirBypass: true
            });
            if (wasAirBalloon && applied && !q.dead) popBalloon(q, "寒冰菇击落")
          }
          addEffect(row, col + .5, "全行寒意+3", "#93c5fd");
          return true
        }
        case "kelp": {
          const readySlots = s7KelpReadySlots(p);
          if (!readySlots.length) return false;
          const poisonLayers = lv >= 2 ? 6 : 2;
          const range = [3, 4, 5, 6, 7, 8][lv];
          const targets = s7Targets(row, col, Math.max(readySlots.length, state.zombies.length), {
            range: range,
            source: p,
            canHitDiving: true
          }).filter(q => !q.s7KelpGrabbed && !q.s7KelpTargeting && !isBalloonAir(q) && !
            isUnderground(q)).slice(0, readySlots.length);
          if (!targets.length) return false;
          const fullCooldown = s7KelpSlotCooldown(p);
          for (let i = 0; i < targets.length; i++) {
            const q = targets[i];
            const slot = readySlots[i];
            slot.targetId = q.id;
            slot.cooldown = fullCooldown;
            q.s7KelpTargeting = true;
            q.s7KelpGrabbed = true;
            q.s7KelpGrabbedBy = p;
            q.s7KelpSlotIndex = slot.index;
            q.s7KelpPoison = {
              remain: 999999,
              tick: 1,
              layers: poisonLayers,
              source: p
            };
            q.lastPoisonSource = p;
            addEffect(q.row, q.x, `${isDiving(q)?"水下缠绕":"缠绕"}·槽位${slot.index+1}·持续中毒`, "#67e8f9")
          }
          return true
        }
        case "plantern": {
          const flatHeal = lv >= 2 ? 60 : 30;
          const healed = s7PlanternHealRow(p, flatHeal);
          const marked = s7PlanternApplyRowLumen(p);
          addEffect(row, col + .5, `本行治疗${flatHeal}+3%·光标${marked}`, "#fde047", .65);
          return true
        }
        case "blover": {
          p.s7.b03bGustTimer = 1.12;
          for (const q of state.zombies) {
            if (q.dead || q.dying || q.friendly || q.row !== row) continue;
            if (isS7FlyingZombie(q)) {
              killZombie(q, {
                source: p,
                noCritical: true,
                noTransform: true
              });
              continue
            }
            s7ApplyBloverKnockback(q);
            s7ApplyElement(q, "cold", 2, p, {
              ignoreTargetState: true,
              includeBobsled: true
            })
          }
          if (lv >= 3) {
            for (const a of state.plants) {
              if (a.dead || a.row !== row || a === p) continue;
              a.s7 = a.s7 || {};
              a.s7.wind = lv >= 5 ? Number.POSITIVE_INFINITY : 3
            }
          }
          addEffect(row, col + .5, lv >= 5 ? "凛风·永久顺风" : lv >= 3 ? "凛风·顺风3秒" : "凛风", "#bae6fd");
          return true
        }
        case "magnet": {
          if (p.s7?.magnetState) return false;
          const IRON_EMOJI = {
            "铁门": "🚪",
            "变种铁门": "🚪",
            "射手铁门": "🚪",
            "防爆铁门": "🚪",
            "铁桶": "🪣",
            "鸭子铁桶": "🪣",
            "橄榄球帽": "🏈",
            "橄榄球头盔": "🏈",
            "黑橄榄头盔": "🏈",
            "防爆头盔": "🏈",
            "武装铁桶": "🪣",
            "武装铁门": "🚪",
            "矿工帽": "⛑️",
            "扶梯": "🪜",
            "跳跳杆": "🦘"
          };
          let cand = [];
          for (const pp of state.plants) {
            if (!pp.dead && pp.laddered) {
              cand.push({
                q: null,
                plant: pp,
                ar: null,
                kind: "plant_ladder",
                emoji: "🪜",
                d: Math.hypot(pp.col + .5 - (col + .5), pp.row - row)
              })
            }
          }
          for (const q of state.zombies)
            if (!q.dead && !q.friendly && !q.s7?.command && !q.vehicle) {
              const ar = q.armors.find(a => a.metal && a.hp > 0);
              if (ar) cand.push({
                q: q,
                ar: ar,
                kind: "armor",
                emoji: IRON_EMOJI[ar.name] || "🔩",
                d: Math.hypot(q.x - (col + .5), q.row - row)
              });
              else if (q.flags?.digger && q.hasPick && !s7HasCommand("raid", q.row)) cand.push({
                q: q,
                ar: null,
                kind: "pick",
                emoji: "⛏️",
                d: Math.hypot(q.x - (col + .5), q.row - row)
              });
              else if (q.flags?.jack && !q.s7?.boxStolen) cand.push({
                q: q,
                ar: null,
                kind: "box",
                emoji: "🎁",
                d: Math.hypot(q.x - (col + .5), q.row - row)
              })
            } cand = cand.filter(item => item.d <= 10);
          if (!cand.length) return false;
          cand.sort((a, b) => a.d - b.d);
          const {
            q: q,
            plant: plant,
            ar: ar,
            kind: kind,
            emoji: emoji
          } = cand[0];
          if (kind === "armor" && ar) {
            ar.hp = 0;
            q.armors = q.armors.filter(x => x.hp > 0);
            if (ar.name === "扶梯") {
              if (q.s7) q.s7.ladderUsesRemaining = 0;
              q.speed = SPEEDS.ordinary;
              setSpeedProfile(q, "ordinary", true)
            }
          } else if (kind === "pick") {
            q.hasPick = false
          } else if (kind === "box") {
            q.s7 = q.s7 || {};
            q.s7.boxStolen = true
          } else if (kind === "plant_ladder" && plant) {
            plant.laddered = false;
            plant.ladderExpire = 0;
            addEffect(plant.row, plant.col + .5, "磁力拆梯", "#93c5fd")
          }
          const pullTime = p.buff > 0 ? .56 : .72;
          p.s7.magnetState = "pulling";
          p.s7.magnetTimer = pullTime;
          p.s7.magnetItem = {
            emoji: emoji,
            kind: kind,
            armorName: ar?.name || null,
            damageStage: 0,
            maxDamageStages: 3
          };
          p.s7.magnetSourceZombieId = q?.id || null;
          p.s7.magnetSourcePlantId = plant?.id || null;
          p.s7.magnetFromX = q ? q.x : plant.col + .5;
          p.s7.magnetFromRow = q ? q.row : plant.row;
          p.s7.magnetCurX = p.s7.magnetFromX;
          p.s7.magnetCurRow = p.s7.magnetFromRow;
          p.s7.magnetPullTime = pullTime;
          return false
        }
        case "kernel": {
          return s7KernelStartThrow(p)
        }
        case "umbrella": {
          updateUmbrellaImpKill(row);
          let granted = 0;
          let upgraded = 0;
          for (const a of state.plants) {
            if (a === p || a.dead || a.row !== row || a.key === "umbrella") continue;
            const beforeAir = !!s7SmallUmbrellaState(a)?.airReady;
            if (s7GrantSmallUmbrella(a, lv >= 5, p)) granted++;
            else if (!beforeAir && s7SmallUmbrellaState(a)?.airReady) upgraded++
          }
          if (granted || upgraded) {
            addEffect(row, col + .5, `小伞+${granted}${upgraded?` 升级+${upgraded}`:""}`, "#bae6fd", .55)
          }
          addEffect(row, col + .5, "保护伞", "#bae6fd");
          return true
        }
        case "marigold":
          return s7Marigold(p);
        case "goldmagnet": {
          let marked = 0;
          for (const q of state.zombies) {
            if (q.dead || q.dying || q.friendly || q.row !== row || q.s7?.gilded || s7BattleRandom() >= .6) continue;
            q.s7Elem = s7Elem(q);
            q.s7 = q.s7 || {};
            q.s7.gilded = true;
            q.s7.gildedBy = p.id;
            q.s7.gildedLevel = lv;
            q.s7.gildedXpSettled = false;
            marked++;
            addEffect(q.row, q.x, "附金", "#facc15")
          }
          addEffect(row, col + .5, marked > 0 ? `附金×${marked}` : "附金未命中", "#fde047", .55);
          return true
        }
        case "timegrass": {
          if (p.s7.portal) return false;
          const target = timegrassFindLeftmostTarget(p);
          if (!target) return false;
          p.s7.portal = timegrassMakePortal(p, target);
          s7TriggerUserGridPlantAction(p,.82);
          timegrassStartSkillCooldown(p);
          addEffect(row, p.s7.portal.x, "传送门开启", "#c4b5fd");
          return true
        }
        case "barley":
          return false;
        case "starfruit": {
          const starTarget = s7StarTarget(p);
          if (!starTarget) return false;
          const dirs = [{
            dx: -1,
            dy: 0,
            n: "后"
          }, {
            dx: 0,
            dy: -1,
            n: "上"
          }, {
            dx: 0,
            dy: 1,
            n: "下"
          }, {
            dx: 1,
            dy: -1,
            n: "右上"
          }, {
            dx: 1,
            dy: 1,
            n: "右下"
          }];
          dirs.forEach((d, i) => addBullet({
            x: col + .5,
            y: row + .5,
            row: row,
            dx: d.dx * 4,
            dy: d.dy * 4,
            damage: lv >= 4 ? 30 : lv >= 2 ? 25 : 20,
            kind: "star",
            from: p,
            torchable: false,
            lumenLayers: s7BattleRandom() < .05 ? 1 : 0,
            starTurnAfter: 2,
            starTargetId: null,
            starOriginalDx: d.dx * 4,
            starOriginalDy: d.dy * 4,
            storedIndex: i,
            airOk: false,
            strictRow: true,
            starDirName: d.n
          }));
          p.s7.attack++;
          if (lv >= 3 && p.s7.attack % 100 === 0) {
            s7QueueStarBig(p, 1);
            s7TryFireQueuedBigStar(p, "保底大星")
          }
          // 5级：每获得1437经验挂起的大星随本次攻击附带释放（最快1s一个）。
          if (lv >= 5) s7TryFireQueuedBigStar(p, "经验大星")
          return true
        }
        case "fume": {
          const targets = s7FumeTargets(p);
          if (!targets.length) return false;
          const storedSouls = lv >= 3 ? Math.min(s7FumeSoulCap(lv), Math.max(0, Math.floor(p.s7.souls || 0))) : 0;
          if (storedSouls > 0) {
            p.s7.souls = 0;
            s7FireFumeSouls(p, targets[0], storedSouls, lv)
          }
          let hit = 0;
          for (const q of targets) {
            const dmg = s7FumeDirectDamage(p, q, lv);
            if (s7DirectHit(q, dmg, p, {
                ignore2: true
              })) hit++
          }
          if (lv >= 3) {
            const extracted = hit * (lv >= 5 ? S7_FUME_RULE.level5SoulMultiplier : 1);
            p.s7.souls = Math.min(s7FumeSoulCap(lv), extracted)
          }
          const farthest=targets.reduce((m,q)=>Math.max(m,finiteNumber(q.x,col+.5)),col+.5);
          const sprayRange=clamp(farthest-(col+.25),1,Math.max(1,DAMAGE_BOUNDARY_X-col));
          s7AddSpriteEffect('fumeSpray', row, col + .72, .56, {rangeCells:sprayRange,scale:1.0,opacity:.96});
          for (let c = col; c < COLS; c++) addGridEffect(row, c, "#a855f7", 2, false);
          addEffect(row, col + 1, `大喷群伤${lv>=3?`·存魂${p.s7.souls||0}`:""}`, "#a855f7");
          return true
        }
        case "gloom": {
          return s7StartGloomAttack(p)
        }
        case "potato": {
          return s7PotatoCast(p)
        }
        case "melon": {
          const groundTarget = s7Nearest(row, col, {
            range: 9,
            source: p,
            canHitDiving: true
          });
          const cannonTarget = lv >= 5 ? s7Nearest(row, col, {
            range: 9,
            source: p,
            canHitDiving: true,
            canAir: true
          }) : groundTarget;
          if (!groundTarget && !cannonTarget) return false;
          const chainChance = S7_MELON_RULE.chainChanceByLevel[lv] || 0;
          let shots = 1;
          while (shots < 64 && s7BattleRandom() < chainChance) shots++;
          let fired = 0;
          for (let i = 0; i < shots; i++) {
            const delay = i * .325;
            if (groundTarget && s7BattleRandom() < S7_MELON_RULE.goldChance) {
              addPultBullet(p, groundTarget, 0, {
                kind: "goldenMelon",
                goldenMelon: true,
                goldenHitIds: [],
                delay: delay,
                arcHeight: .62,
                emoji: "🌟🍉"
              });
              fired++;
              addEffect(row, col + .5, "金瓜", "#fbbf24", .45);
              continue
            }
            let growthCount = 0;
            if (lv >= 3) {
              while (growthCount < 64 && s7BattleRandom() < S7_MELON_RULE.growthChance) growthCount++;
              if (lv >= 5) growthCount = Math.max(1, growthCount)
            }
            const isCannon = lv >= 5 && growthCount >= S7_MELON_RULE.cannonGrowthThreshold;
            if (isCannon && cannonTarget) {
              const cannonDamage = S7_MELON_RULE.cannonBaseDamage + S7_MELON_RULE.cannonGrowthDamageBonus * growthCount;
              addPultBullet(p, cannonTarget, cannonDamage, {
                kind: "melonCannon",
                aoe: S7_MELON_RULE.cannonRadius,
                fullAoeDamage: true,
                melonGrowthCount: growthCount,
                melonCannon: true,
                airOk: true,
                delay: delay,
                arcHeight: .82,
                emoji: "💥🍉"
              });
              fired++;
              addEffect(row, col + .5, `西瓜大炮 ${cannonDamage}（增大${growthCount}）`, "#fb7185", .55);
              continue
            }
            if (!groundTarget) continue;
            const damage = S7_MELON_RULE.baseDamage + S7_MELON_RULE.growthDirectBonus * growthCount;
            addPultBullet(p, groundTarget, damage, {
              kind: "melon",
              aoe: S7_MELON_RULE.baseAoe,
              splashBonus: S7_MELON_RULE.growthSplashBonus * growthCount,
              melonGrowthCount: growthCount,
              delay: delay,
              emoji: "🍉"
            });
            fired++;
            if (growthCount > 0) addEffect(row, col + .5,
              `增大×${growthCount} 直击${damage} 溅射+${growthCount*S7_MELON_RULE.growthSplashBonus}`, "#86efac", .45)
          }
          return fired > 0
        }
        case "gatling": {
          if (!z) return false;
          p.s7.gatlingStars = clamp(p.s7.gatlingStars || 0, 0, S7_GATLING_RULE.maxStars);
          const ultChance = s7GatlingUltChance(p);
          const ultTriggered = lv >= 3 && s7BattleRandom() < ultChance;
          p.s7.b03bFireTimer = .60;
          p.s7.b03bUltTimer = ultTriggered ? 3 : 0;
          if (ultTriggered) {
            const starsBeforeUlt = lv >= 5 ? p.s7.gatlingStars : 0;
            const iceCount = S7_GATLING_RULE.ultBaseIcePeas + Math.min(S7_GATLING_RULE.starsWithIceBonus,
              starsBeforeUlt) * S7_GATLING_RULE.starIceBonus;
            s7FireGatlingBurst(p, z, S7_GATLING_RULE.ultPeas, iceCount, 3 / Math.max(1, S7_GATLING_RULE.ultPeas +
              iceCount - 1));
            p.hp = Math.min(p.maxHp, p.hp + S7_GATLING_RULE.ultSelfHeal);
            p.s7.gatlingStars = lv >= 5 ? Math.min(S7_GATLING_RULE.maxStars, starsBeforeUlt + 1) : 0;
            addEffect(row, col + .5, `机枪开大 ${S7_GATLING_RULE.ultPeas}豌豆+${iceCount}冰豆 ★${p.s7.gatlingStars}`, "#bfdbfe",
              1.1)
          } else {
            const total = S7_GATLING_RULE.normalPeas + S7_GATLING_RULE.normalIcePeas;
            for (let i = 0; i < total; i++) {
              const isIce = i >= S7_GATLING_RULE.normalPeas;
              s7ShootDelayed(p, z, 20, {
                kind: isIce ? "ice" : "pea",
                cold: isIce ? S7_GATLING_RULE.iceColdLayers : 0
              }, i)
            }
          }
          return true
        }
        case "winter": {
          z = s7Nearest(row, col, {
            range: 9,
            source: p,
            canHitDiving: true
          });
          if (!z) return false;
          const modeRoll = s7BattleRandom();
          if (lv >= 5 && modeRoll < .3) {
            const ts = s7UniqueTargets(row, col, 10, {
              range: 9,
              source: p,
              canHitDiving: true
            });
            const targets = ts.length ? ts : [z];
            for (const q of targets) addPultBullet(p, q, 25, {
              kind: "winter",
              aoe: 1,
              winterColdChance: 1,
              winterColdLayers: 1,
              winterFullAoe: true,
              delay: 0,
              emoji: "❄️"
            });
            return targets.length > 0
          }
          if (lv >= 3 && modeRoll < (lv >= 5 ? .6 : .3)) {
            const dmg = lv >= 4 ? 120 : 80,
              cold = lv >= 4 ? 20 : 10,
              ts = s7UniqueTargets(row, col, 3, {
                range: 9,
                source: p,
                canHitDiving: true
              });
            const targets = ts.length ? ts : [z];
            for (const q of targets) addPultBullet(p, q, dmg, {
              kind: "winter",
              aoe: 1,
              winterColdChance: 1,
              winterColdLayers: cold,
              winterFullAoe: true,
              delay: 0,
              emoji: "❄️🍉"
            });
            return targets.length > 0
          }
          addPultBullet(p, z, 80, {
            kind: "winter",
            aoe: .75,
            winterColdChance: [.4, .6, .8, .8, .8, .8][lv],
            winterColdLayers: 3,
            emoji: "🧊🍉"
          });
          return true
        }
      }
    }

