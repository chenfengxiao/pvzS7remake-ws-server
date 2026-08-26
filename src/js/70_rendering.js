"use strict";

    // -----------------------------------------------------------------------------

    // 核心模拟 / updateEffects

    // [原源码行 7541] 全局容量清理统一在本逻辑帧的末尾执行一次；避免每行重复扫描全部实体数组。

    // -----------------------------------------------------------------------------

    function updateEffects(dt) {
      const effects = state.effects = finiteArray(state.effects);
      // Effects spawned by a boom start updating on the next logic frame, matching the old snapshot loop.
      const initialLength = effects.length;
      for (let i = 0; i < initialLength; i++) {
        const e = effects[i];
        if (!e) continue;
        e.ttl = finiteNumber(e.ttl, 0) - dt;
        e.max = finitePositive(e.max, Math.max(.1, e.ttl));
        if (e.boom && e.ttl <= 0 && !e.done) {
          e.done = true;
          try {
            e.boom()
          } catch (err) {
            rememberRenderError(err, "effect.boom")
          }
        }
        if (e.ttl <= 0 && !e.crater) e.dead = true
      }
      compactArrayInPlace(effects, e => e && !e.dead && renderSafeRow(e.row) && renderSafeX(e.x))
    }

    function s7RefreshLadderCommandUses(z) {
      if (!z || z.type !== "ladder" || !z.armors?.some(a => a.name === "扶梯" && a.hp > 0)) {
        if (z?.type === "ladder" && z.s7) z.s7.ladderUsesRemaining = 0;
        return
      }
      z.s7 = z.s7 || {};
      if (!Number.isFinite(z.s7.ladderUsesRemaining) || z.s7.ladderUsesRemaining <= 0) z.s7.ladderUsesRemaining = 1;
      if (s7HasCommand("break", z.row)) z.s7.ladderUsesRemaining = Math.max(z.s7.ladderUsesRemaining, 2)
    }

    function s7RefreshZomboniIceTrails(z) {
      if (!state || !z || z.dead || z.type !== "zomboni") return;
      state.iceTrails = finiteArray(state.iceTrails);
      const ownCol = Math.max(-1, Math.min(PLANT_COLS - 1, Math.floor(finiteNumber(z.x, 0))));
      for (let c = ownCol + 1; c < PLANT_COLS; c++) {
        let trail = state.iceTrails.find(t => t && t.row === z.row && t.col === c);
        if (!trail) {
          trail = {
            row: z.row,
            col: c,
            ttl: 60,
            ownerId: z.id
          };
          state.iceTrails.push(trail)
        }
        trail.ttl = 60;
        trail.ownerId = z.id
      }
    }

    function s7IceTrailOwnerAlive(t) {
      return !!(t && t.ownerId != null && finiteArray(state?.zombies).some(z => z && !z.dead && z.id === t.ownerId && z.type === "zomboni"))
    }

    function s7ZombieOnIceTrail(z) {
      if (!z || !state) return false;
      const col = Math.floor(finiteNumber(z.x, -99));
      return finiteArray(state.iceTrails).some(t => t && t.row === z.row && t.col === col && t.ttl > 0)
    }

    function updateIceTrails(dt) {
      state.iceTrails = finiteArray(state.iceTrails);
      for (const t of state.iceTrails) {
        if (s7IceTrailOwnerAlive(t)) t.ttl = 60;
        else t.ttl = finiteNumber(t.ttl, 0) - dt
      }
      state.iceTrails = state.iceTrails.filter(t => t && t.ttl > 0 && t.row >= 0 && t.row < ROWS && t.col >= 0 && t
        .col < PLANT_COLS)
    }

    function updatePoisonPits(dt) {
      state.poisonPits = finiteArray(state.poisonPits);
      if (!state.poisonPits.length) return;
      for (const pit of state.poisonPits) {
        pit.ttl = finiteNumber(pit.ttl, 0) - dt;
        pit.max = finitePositive(pit.max, Math.max(.1, pit.ttl));
        for (const z of finiteArray(state.zombies)) {
          if (!z || z.dead || z.friendly) continue;
          if (z.row !== pit.row) continue;
          if (Math.abs(finiteNumber(z.x, 999) - (pit.col + .5)) < .65) s7ApplyElement(z, "poison", 2 * dt, null)
        }
      }
      state.poisonPits = state.poisonPits.filter(p => p && p.ttl > 0 && p.row >= 0 && p.row < ROWS && p.col >= 0 && p
        .col < PLANT_COLS)
    }

    function update(dt) {
      if (!state || !state.running || state.paused) return;
      const step = dt;
      state.frame = (state.frame || 0) + 1;
      if (!state.battle) {
        if (state.preRun) {
          state.time += step;
          reportQuadProgress(false);
          for (const t of state.teams) {
            if (!t || !t.alive) continue;
            try {
              // Manual/pre-run mode uses the same lane-indexed core as battle mode,
              // but deliberately skips automatic spawning.
              updateLaneTurn(t, step, false)
            } catch (err) {
              console.error("pre-run lane error", t.row, err);
              state.s7 = state.s7 || {};
              state.s7.lastLaneError = String(err?.message || err);
              state.s7.lastLaneErrorAt = state.time || 0;
              cleanupLane(t.row);
              sanitizeRenderState(true)
            }
          }
          cleanupFrameEntities();
          updateEffects(step);
          updateIceTrails(step);
          updatePoisonPits(step);
          updateShadowSpikes(step);
          updateS7Carts(step);
          updateGridEffects(step);
          s7UpdateSunflowerSuns(step);
          processPlantEvents();
          s7UpdateDetachedParts(step);
          s7AnimationTick();
          s7PerformanceCleanup();
          // 结束条件按 endMode 切换：lastLane=仅剩一路存活结束；allDead=全部淘汰才结束。
          const aliveCount = state.teams.filter(t => t && t.alive).length;
          const ended = state.endMode === "allDead" ? aliveCount === 0 : aliveCount <= 1;
          if (ended) finish()
        }
        return
      }
      state.time += step;
      reportQuadProgress(false);
      for (const t of state.teams) {
        try {
          if (t && t.alive) updateLaneTurn(t, step)
        } catch (err) {
          console.error("lane update error", t?.row, err);
          state.s7 = state.s7 || {};
          state.s7.lastLaneError = String(err?.message || err);
          state.s7.lastLaneErrorAt = state.time || 0;
          cleanupLane(t?.row ?? 0);
          sanitizeRenderState(true)
        }
      }
      cleanupFrameEntities();
      updateEffects(step);
      updateIceTrails(step);
      updatePoisonPits(step);
      updateShadowSpikes(step);
      updateS7Carts(step);
      updateGridEffects(step);
      s7UpdateSunflowerSuns(step);
      processPlantEvents();
      s7UpdateDetachedParts(step);
      s7AnimationTick();
      s7PerformanceCleanup();
      if (state.teams.every(t => !t.alive)) finish()
    }

    // -----------------------------------------------------------------------------

    // 渲染 / draw

    // [原源码行 7585] 布阵阶段默认静止；按“运行 R”后进入“无自动出怪战斗态”：时间、植物、手动僵尸、子弹、元素照常推进，只跳过自动出怪。

    // [原源码行 7629] v10：单行逻辑异常不能冻结整个 Canvas。

    // [原源码行 7630] 原版本一个植物/僵尸实体产生异常会直接跳出 update，导致模拟停止但 RAF/UI 仍运行，表现为“计时器走、画面卡死、异常保护”。

    // [原源码行 7656] RENDERING

    // -----------------------------------------------------------------------------

    const _drawStackMap = new Map();
    const _drawStackArrays = [];
    const _drawPlantGroups = [];
    function draw() {
      if (!state) return;
      sanitizeRenderState();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      drawBoard();
      safeDrawOne("iceTrails", null, () => drawIceTrails());
      safeDrawOne("gridEffects", null, () => drawGridEffects());
      safeDrawOne("poisonPits", null, () => drawPoisonPits());
      const c = layout.cell;
      const stackMap = _drawStackMap;
      stackMap.clear();
      let stackArrayCount = 0;
      for (const p of finiteArray(state.plants)) {
        if (!p || p.dead) continue;
        const key = p.row + "," + p.col;
        let arr = stackMap.get(key);
        if (!arr) {
          arr = _drawStackArrays[stackArrayCount] || (_drawStackArrays[stackArrayCount] = []);
          stackArrayCount++;
          arr.length = 0;
          stackMap.set(key, arr)
        }
        arr.push(p)
      }
      const plantGroups = _drawPlantGroups;
      plantGroups.length = 0;
      for (const group of stackMap.values()) plantGroups.push(group);
      plantGroups.sort((a, b) => a[0].row - b[0].row || a[0].col - b[0].col);
      for (const same of plantGroups) {
        same.sort((a, b) => plantRank(a) - plantRank(b));
        for (let idx = 0; idx < same.length; idx++) {
          const p = same[idx];
          const off = (idx - (same.length - 1) / 2) * c * .08;
          const sx = p.s7?.squashCurX != null ? layout.x + p.s7.squashCurX * c : layout.x + p.col * c + c * .5 + off;
          safeDrawOne("plant", p, drawPlant, p, finiteNumber(sx, layout.x + p.col * c + c * .5), finiteNumber(
            layout.y + p.row * c + c * .5, layout.y + c * .5), c)
        }
        if (same.length > 1) {
          const p = same[same.length - 1];
          ctx.fillStyle = "#e0f2fe";
          ctx.font = `${c*.1}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("×" + same.length, layout.x + p.col * c + c * .82, layout.y + p.row * c + c * .2)
        }
      }
      safeDrawOne("sunflowerSuns", null, () => drawSunflowerSuns());
      if (state.s7?.turrets)
        for (const t of finiteArray(state.s7.turrets)) safeDrawOne("turret", t, drawTurret);
      safeDrawOne("shadowSpikes", null, () => drawShadowSpikes());
      safeDrawOne("marigoldCarts", null, () => drawS7Carts());
      const visibleZombieCount = finiteArray(state.zombies).length;
      s7DenseZombieOverlayLevel = visibleZombieCount >= 320 ? 2 : visibleZombieCount >= 180 ? 1 : 0;
      // Dense legacy rendering uses one shared isolation scope. Ordinary battles
      // keep the original per-entity isolation path for exact visual compatibility.
      if (s7DenseZombieOverlayLevel > 0) ctx.save();
      for (const z of finiteArray(state.zombies)) safeDrawOne("zombie", z, drawZombie);
      if (s7DenseZombieOverlayLevel > 0) ctx.restore();
      safeDrawOne("detachedParts", null, () => s7DrawDetachedParts());
      safeDrawOne("sniperLocks", null, () => drawSniperLocks());
      for (const b of finiteArray(state.bullets)) safeDrawOne("bullet", b, drawBullet);
      for (const e of finiteArray(state.effects)) {
        if (e.crater) safeDrawOne("crater", e, drawCrater);
        else safeDrawOne("effect", e, drawEffect)
      }
      for (let r = 0; r < ROWS; r++) {
        const t = state.teams[r];
        if (!t.alive) {
          ctx.fillStyle = "rgba(0,0,0,.46)";
          ctx.fillRect(layout.x, layout.y + r * c, layout.w, c);
          ctx.fillStyle = "#ef4444";
          ctx.font = `bold ${c*.22}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("淘汰", layout.x + layout.w / 2, layout.y + r * c + c * .56)
        }
      }
    }

    function drawGridEffects() {
      if (!state.gridEffects || !state.gridEffects.length) return;
      ctx.save();
      for (const e of finiteArray(state.gridEffects)) {
        if (!e || !Number.isFinite(e.row) || !Number.isFinite(e.col)) continue;
        const x = layout.x + e.col * layout.cell,
          y = layout.y + e.row * layout.cell;
        const ratio = finiteNumber(e.ttl, 0) / finitePositive(e.max, 1);
        const alpha = e.stacking ? finiteNumber(e.intensity, .35) * .4 * ratio : .35 * ratio;
        ctx.globalAlpha = clamp(finiteNumber(alpha, 0), 0, .5);
        ctx.fillStyle = e.color;
        ctx.fillRect(x, y, layout.cell, layout.cell)
      }
      ctx.restore()
    }

    function drawIceTrails() {
      if (!state.iceTrails || !state.iceTrails.length) return;
      ctx.save();
      for (const t of finiteArray(state.iceTrails)) {
        if (!t || !Number.isFinite(t.row) || !Number.isFinite(t.col)) continue;
        const x = layout.x + t.col * layout.cell,
          y = layout.y + t.row * layout.cell;
        ctx.globalAlpha = clamp(finiteNumber(t.ttl, 0) / 150, 0, .6);
        ctx.fillStyle = "#a5f3fc";
        ctx.fillRect(x, y, layout.cell, layout.cell);
        ctx.strokeStyle = "rgba(125,211,252,.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, layout.cell, layout.cell)
      }
      ctx.restore()
    }

    function drawBoard() {
      ctx.save();
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      const themedTimelineBoard = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE && s7ThemeImageReady(S7_TIMELINE_THEME.poolBoard);
      if (themedTimelineBoard) {
        ctx.drawImage(S7_TIMELINE_THEME.poolBoard, layout.x, layout.y, layout.w, layout.h);
        ctx.fillStyle = "rgba(6,20,10,.18)";
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, 1, layout.cell);
            ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, 1);
            if (c === PLANT_COLS - 1) {
              ctx.fillStyle = "rgba(250,204,21,.08)";
              ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell);
              ctx.fillStyle = "rgba(6,20,10,.18)"
            }
            if (c === DAMAGE_BOUNDARY_X) {
              ctx.fillStyle = "rgba(15,23,42,.30)";
              ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell);
              ctx.fillStyle = "rgba(255,255,255,.70)";
              ctx.font = `${Math.max(8,layout.cell*.095)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("不可种", layout.x + (c + .5) * layout.cell, layout.y + r * layout.cell + layout.cell * .2);
              ctx.fillStyle = "rgba(6,20,10,.18)"
            }
          }
        }
      } else {
        ctx.fillStyle = "#7c2d12";
        ctx.fillRect(layout.x - layout.cell * .65, layout.y, layout.cell * .5, layout.h);
        ctx.fillStyle = "#fed7aa";
        ctx.font = `${Math.max(10,layout.cell*.14)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("房子", layout.x - layout.cell * .4, layout.y + layout.h / 2);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (c >= PLANT_COLS) {
              ctx.fillStyle = (r + c) % 2 ? "#31402f" : "#28362a"
            } else {
              ctx.fillStyle = (r + c) % 2 ? "#4f8f38" : "#447f32";
              if (c >= 5) ctx.fillStyle = (r + c) % 2 ? "#557f30" : "#4a742b"
            }
            ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell);
            ctx.strokeStyle = "rgba(6,20,10,.35)";
            ctx.strokeRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell);
            if (c === PLANT_COLS - 1) {
              ctx.fillStyle = "rgba(250,204,21,.16)";
              ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell)
            }
            if (c === DAMAGE_BOUNDARY_X) {
              ctx.fillStyle = "rgba(15,23,42,.45)";
              ctx.fillRect(layout.x + c * layout.cell, layout.y + r * layout.cell, layout.cell, layout.cell);
              ctx.fillStyle = "rgba(226,232,240,.55)";
              ctx.font = `${Math.max(8,layout.cell*.1)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("不可种", layout.x + (c + .5) * layout.cell, layout.y + r * layout.cell + layout.cell * .22)
            }
          }
          ctx.fillStyle = TEAM_COLORS[r];
          ctx.globalAlpha = .16;
          ctx.fillRect(layout.x, layout.y + r * layout.cell, layout.w, layout.cell);
          ctx.globalAlpha = 1
        }
      }
      for (let r = 0; r < ROWS; r++) {
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.textAlign = "left";
        ctx.font = `${Math.max(9,layout.cell*.12)}px sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,.35)";
        ctx.shadowBlur = 4;
        ctx.fillText(TEAM_NAMES[r], layout.x + 4, layout.y + r * layout.cell + 14)
        ctx.shadowBlur = 0
      }
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(layout.x + DAMAGE_BOUNDARY_X * layout.cell, layout.y);
      ctx.lineTo(layout.x + DAMAGE_BOUNDARY_X * layout.cell, layout.y + layout.h);
      ctx.stroke();
      ctx.fillStyle = "#facc15";
      ctx.font = `${Math.max(8,layout.cell*.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("9/10可伤线", layout.x + DAMAGE_BOUNDARY_X * layout.cell, layout.y - 8);
      ctx.restore()
    }

    function drawPlant(p, x, y, c) {
      const d = PLANTS[p.key] || PLANTS.barley;
      const barleyPepperDormant = !!p.s7?.barleyPepperDormant;
      const displayEmoji = barleyPepperDormant ? "🌶️💥" : d.emoji;
      ctx.save();
      const userGridPlant = s7HasUserGridPlant(p?.key);
      const squashSpriteDy = p.key === "squash" ? .4 * c : 0;
      if (!userGridPlant) s7ApplyCanvasAnimationPose(ctx, "plant", p, x, y - squashSpriteDy, c);
      if (isMushroomAsleep(p)) ctx.globalAlpha = .45;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (p.key === "squash" && p.s7?.squashYOffset && s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE) {
        y -= p.s7.squashYOffset * c
      }
      if (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) {
        const box = c * .62;
        ctx.fillStyle = "rgba(4,12,24,.68)";
        ctx.fillRect(x - box / 2, (y - squashSpriteDy) - box / 2, box, box);
        ctx.strokeStyle = "rgba(15,23,42,.90)";
        ctx.lineWidth = Math.max(1, c * .025);
        ctx.strokeRect(x - box / 2, (y - squashSpriteDy) - box / 2, box, box)
      }
      const scaredyHiding = p.key === "scaredy" && !!p.s7?.hiding;
      const scaredyAnimT = p.key === "scaredy" && p.s7?.hideAnim > 0 ? p.s7.hideAnim : 0;
      // B03A: any plant clip with real sprite layers can render through the shared timeline renderer.
      // Generic B01 clips have no layers and automatically fall back to the legacy Canvas visual.
      const userGridPlantSpriteDrawn = userGridPlant && s7DrawUserGridPlant(ctx,p,x,y - squashSpriteDy,c);
      const timelinePlantSpriteDrawn = !userGridPlantSpriteDrawn && s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE &&
        s7DrawLayeredSprite(ctx, "plant", p, x, (y - squashSpriteDy) - c * .015, c);
      if (!userGridPlantSpriteDrawn && !timelinePlantSpriteDrawn && s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) {
        let sz = scaredyHiding ? .21 : .32;
        let dy = scaredyHiding ? .08 : -.035;
        if (scaredyAnimT > .3) {
          const t = (scaredyAnimT - .3) / .2;
          const bounce = Math.sin(t * Math.PI);
          if (scaredyHiding) {
            sz += .08 * bounce;
            dy -= .04 * bounce
          } else {
            sz -= .06 * bounce;
            dy += .03 * bounce
          }
        }
        ctx.font = `${c*sz}px serif`;
        ctx.fillText(displayEmoji, x, (y - squashSpriteDy) + c * dy)
      }
      if (scaredyAnimT > .3) {
        const t = (scaredyAnimT - .3) / .2;
        ctx.globalAlpha = .6 * t;
        ctx.font = `${c*.15}px serif`;
        if (scaredyHiding) {
          ctx.fillText("💧", x - c * .22, y - c * .15 * t)
        } else {
          ctx.fillText("✨", x + c * .2, y - c * .12 * t)
        }
        ctx.globalAlpha = 1
      }
      if (scaredyHiding && Math.sin(p.age * 5) > .7) {
        ctx.globalAlpha = .45;
        ctx.font = `${c*.12}px serif`;
        ctx.fillText("💧", x + c * .18, y - c * .2);
        ctx.globalAlpha = 1
      }
      if (p.s7?.barleyOriginal) {
        ctx.save();
        ctx.fillStyle = barleyPepperDormant ? "#fdba74" : "#fef3c7";
        ctx.font = `bold ${c*.07}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const remain = Math.max(0, finiteNumber(p.s7.barleyTransformCd, 0));
        const label = barleyPepperDormant ? `辣椒休眠 ${remain.toFixed(1)}s` : p.key === "barley" ?
          `前摇 ${remain.toFixed(1)}s` : `下次变身 ${remain.toFixed(1)}s`;
        ctx.fillText(label, x, y + c * .18);
        ctx.restore()
      }
      if (p.key === "chomper") {
        const eatenLayers = Math.max(0, Math.floor(p.s7?.eaten || 0));
        const badgeX = x + c * .235;
        const badgeY = y - c * .015;
        ctx.save();
        ctx.globalAlpha = .96;
        ctx.fillStyle = "rgba(2,6,23,0.90)";
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = Math.max(1, c * .018);
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, c * .115, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fef3c7";
        ctx.font = `bold ${c*.088}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`吞×${eatenLayers}`, badgeX, badgeY + c * .004);
        ctx.restore()
      }
      if (p.laddered) {
        ctx.fillStyle = "#e5e7eb";
        ctx.font = `${c*.18}px serif`;
        ctx.fillText("🪜", x + c * .24, y - c * .24)
      }
      if (s7SmallUmbrellaActive(p)) {
        const smallUmbrella = s7SmallUmbrellaState(p);
        const anchor = s7SmallUmbrellaAnchor(p);
        ctx.save();
        ctx.globalAlpha = .72;
        ctx.font = `${c*.16}px serif`;
        const umbrellaX = layout.x + (anchor.col + .5) * c;
        const umbrellaY = layout.y + anchor.row * c + c * .5;
        ctx.fillText("☂️", umbrellaX + c * .26, umbrellaY - c * .26);
        ctx.fillStyle = "#e0f2fe";
        ctx.font = `bold ${c*.07}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(smallUmbrella.hp)}${smallUmbrella.airReady?"✦":""}`, umbrellaX + c * .31,
          umbrellaY - c * .12);
        ctx.restore()
      }
      if (p.key === "pumpkin") {
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - c * .29, y - c * .29, c * .58, c * .58)
      }
      if (d.cd < 900 && !d.instant) {
        if (p.key === "kelp") {
          const slots = s7KelpSyncSlots(p);
          const full = Math.max(.08, s7KelpSlotCooldown(p));
          const dual = slots.length >= 2;
          const barW = c * .58;
          const barH = dual ? c * .032 : c * .045;
          const firstY = dual ? y + c * .225 : y + c * .26;
          const gap = c * .052;
          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const ratio = slot.targetId != null ? 0 : clamp(1 - slot.cooldown / full, 0, 1);
            const barY = firstY + i * gap;
            ctx.fillStyle = "rgba(0,0,0,.62)";
            ctx.fillRect(x - barW / 2, barY, barW, barH);
            ctx.fillStyle = "#38bdf8";
            ctx.fillRect(x - barW / 2, barY, barW * ratio, barH);
            if (dual) {
              ctx.fillStyle = "#e0f2fe";
              ctx.font = `bold ${c*.065}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(String(i + 1), x - barW / 2 - c * .045, barY + barH / 2)
            }
          }
        } else {
          let ratio = 1;
          if (p.key === "timegrass") {
            ratio = timegrassSkillCooldownRatio(p)
          } else if (p.key === "chomper" && p.s7?.chomperPhase === "chew" && p.s7.chomperTime > 0) {
            ratio = clamp(1 - p.cd / p.s7.chomperTime, 0, 1)
          } else if (p.key === "chomper" && p.s7?.chomperPhase) {
            ratio = 1
          } else {
            const target = hasPotentialTarget(p);
            if (target) {
              const cdMax = PLANT_RULES[p.key] ? s7Cd(p) : p.key === "cob" && p.age < 8 ? d.firstCd || 7 : d.cd || 1;
              ratio = clamp(1 - p.cd / cdMax, 0, 1)
            }
          }
          ctx.fillStyle = "rgba(0,0,0,.55)";
          ctx.fillRect(x - c * .32, y + c * .26, c * .64, c * .045);
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(x - c * .32, y + c * .26, c * .64 * ratio, c * .045)
        }
      }
      drawHpBar(x, y + c * .36, p.hp, p.maxHp, "#22c55e");
      if (isMushroomAsleep(p)) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = `${c*.12}px sans-serif`;
        ctx.fillText("Zzz", x, y - c * .25)
      }
      if (scaredyHiding) {
        ctx.font = `${c*.14}px serif`;
        ctx.fillText("🙈", x, y - c * .24)
      }
      if (PLANT_RULES[p.key] && p.s7) {
        const badgeReady = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE && s7ThemeImageReady(S7_TIMELINE_THEME.levelBadges);
        const level = clamp(Math.floor(finiteNumber(p.s7.level, 0)), 0, 5);
        if (p.s7.level !== level) p.s7.level = level;
        if (badgeReady) {
          const sheet = S7_TIMELINE_THEME.levelBadges;
          const cols = 3;
          const rows = 2;
          const sw = sheet.naturalWidth / cols;
          const sh = sheet.naturalHeight / rows;
          const sx = (level % cols) * sw;
          const sy = Math.floor(level / cols) * sh;
          const size = c * .28;
          const dx = x - c * .37;
          const dy = y + c * .06;
          ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, size, size)
        } else {
          ctx.fillStyle = level >= 5 ? "#fef08a" : level >= 3 ? "#bfdbfe" : "#e5e7eb";
          ctx.font = `bold ${c*.1}px sans-serif`;
          ctx.fillText(`${level}阶`, x, y - c * .36)
        }
        const th = s7Thresholds(p.key);
        const next = th[Math.min(5, level + 1)] || th[5];
        const prev = th[level] || 0;
        const ratio = level >= 5 ? 1 : clamp(((p.s7.exp || 0) - prev) / (next - prev || 1), 0, 1);
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(x - c * .32, y + c * .43, c * .64, 4);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(x - c * .32, y + c * .43, c * .64 * ratio, 4);
        if (p.shield > 0) {
          ctx.fillStyle = "#fde68a";
          ctx.font = `${c*.1}px sans-serif`;
          ctx.fillText("盾" + Math.round(p.shield), x, y + c * .55)
        }
        if (p.key === "starfruit" && p.s7.level >= 5) {
          const starCount = clamp(Math.floor(p.s7.orbitStars || 0), 0, 5);
          ctx.save();
          ctx.font = `${c*.105}px serif`;
          ctx.fillStyle = "#fde047";
          ctx.shadowColor = "#facc15";
          ctx.shadowBlur = c * .06;
          const phase = finiteNumber(state?.time, 0) * 2.2;
          for (let i = 0; i < starCount; i++) {
            const angle = phase + Math.PI * 2 * i / 5 - Math.PI / 2;
            const sx = x + Math.cos(angle) * c * .27;
            const sy = y + Math.sin(angle) * c * .23;
            ctx.fillText("★", sx, sy)
          }
          ctx.restore();
          ctx.fillStyle = "#fde047";
          ctx.font = `${c*.075}px sans-serif`;
          ctx.fillText(`星环${starCount}/5`, x, y + c * .66)
        }
        if (p.s7.fakeDeath > 0) {
          ctx.fillStyle = "#a3e635";
          ctx.font = `${c*.08}px sans-serif`;
          ctx.fillText("假死" + Math.ceil(p.s7.fakeDeath), x, y + c * .66)
        }
        if (p.s7.clones > 0) {
          ctx.fillStyle = "#67e8f9";
          ctx.fillText("分身×" + p.s7.clones, x, y - c * .24)
        }
        if (p.key === "seashroom" && p.s7?.isClone) {
          ctx.fillStyle = "#67e8f9";
          ctx.font = `${c*.08}px sans-serif`;
          ctx.fillText("分身", x, y - c * .24)
        }
        if (p.key === "timegrass" && p.s7?.portal) {
          const portal = p.s7.portal;
          const r = c * .35 * Math.max(.2, portal.remaining / portal.duration);
          const px = x + (finiteNumber(portal.x, finiteNumber(portal.cell, p.col + 1) + .5) - (p.col + .5)) * c;
          const portalFrames=Math.max(1,finiteNumber(S7_CUSTOM_PLANT_MANIFEST.timegrassPortal?.frameCount,1));
          const portalFrame=Math.floor(finiteNumber(state?.time,0)/.09)%portalFrames;
          const portalDrawn = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE &&
            s7DrawSpriteAsset(ctx, 'plant.custom.timegrassPortal', px, y, c, {frameIndex:portalFrame,pixelScale:.00405, scale:.88, pivotX:.5, pivotY:.5, opacity:Math.max(.35, Math.min(.95, portal.remaining / portal.duration))});
          if (!portalDrawn) {
            ctx.save();
            ctx.globalAlpha = .5;
            ctx.strokeStyle = "#c4b5fd";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = .2;
            ctx.fillStyle = "#c4b5fd";
            ctx.beginPath();
            ctx.arc(px, y, r * .6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle = "#c4b5fd";
          ctx.font = `${c*.09}px sans-serif`;
          ctx.fillText("门" + portal.remaining.toFixed(1) + "s", px, y + c * .55);
          const remain = portal.maxTeleports === Infinity ? "∞" : Math.max(0, portal.maxTeleports - portal.teleported);
          ctx.fillText("剩" + remain, px, y + c * .66)
        }
        if (p.key === "magnet" && p.s7?.magnetState && p.s7?.magnetItem) {
          const ix = layout.x + p.s7.magnetCurX * layout.cell;
          const iy = cy(p.s7.magnetCurRow);
          ctx.save();
          ctx.globalAlpha = .85;
          ctx.font = `${c*.28}px serif`;
          ctx.fillText(p.s7.magnetItem.emoji, ix, iy);
          ctx.restore();
          ctx.fillStyle = "#93c5fd";
          ctx.font = `${c*.08}px sans-serif`;
          const stateLabel = {
            pulling: "吸",
            holding: "待",
            flying: "飞",
            hitting: "砸",
            returning: "回",
            idle_wait: "寻"
          } [p.s7.magnetState] || "";
          ctx.fillText(stateLabel, x, y + c * .55)
        }
      }
      drawEntityTextBadge(plantShortName(p), x, y - c * .01, c, "#dcfce7");
      ctx.restore()
    }

    // -----------------------------------------------------------------------------

    // 渲染 / drawSniperLocks

    // [原源码行 8074] 将现存小星星真实画在杨桃周围；被消耗后对应星星立即消失，随后每秒补1颗。

    // -----------------------------------------------------------------------------

    function drawSniperLocks() {
      if (!state) return;
      ctx.save();
      for (const p of finiteArray(state.plants)) {
        if (!p || p.dead || p.key !== "sniper" || !p.s7?.sniperLockId) continue;
        const z = getZombieById(p.s7.sniperLockId);
        if (!z || z.row !== p.row || !renderSafeX(z.x)) continue;
        const zx = layout.x + z.x * layout.cell,
          zy = cy(z.row),
          px = layout.x + (p.col + .5) * layout.cell,
          py = cy(p.row);
        ctx.strokeStyle = "rgba(250,204,21,.75)";
        ctx.lineWidth = Math.max(1.5, layout.cell * .025);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(px, py - layout.cell * .25);
        ctx.lineTo(zx, zy - layout.cell * .18);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#fef08a";
        ctx.lineWidth = Math.max(2, layout.cell * .03);
        ctx.beginPath();
        ctx.arc(zx, zy, layout.cell * .28, 0, Math.PI * 2);
        ctx.moveTo(zx - layout.cell * .38, zy);
        ctx.lineTo(zx - layout.cell * .16, zy);
        ctx.moveTo(zx + layout.cell * .16, zy);
        ctx.lineTo(zx + layout.cell * .38, zy);
        ctx.moveTo(zx, zy - layout.cell * .38);
        ctx.lineTo(zx, zy - layout.cell * .16);
        ctx.moveTo(zx, zy + layout.cell * .16);
        ctx.lineTo(zx, zy + layout.cell * .38);
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.font = `${layout.cell*.09}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("锁定", zx, zy - layout.cell * .45)
      }
      ctx.restore()
    }

    function s7ZombieFallbackGlyphScale(z, renderMode=s7AnimationRenderMode) {
      const base = .48;
      if (renderMode === S7_ANIMATION_RENDER_MODES.TIMELINE) {
        return base*s7VisualScaleMultiplier('zombie',z,'body')
      }
      // 旧版绘制保持原尺寸，避免本次时间轴调整改变传统 Emoji 模式。
      if (z?.s7?.superGiga) return .82;
      if (z?.s7?.hugeGarg) return .74;
      return base
    }

    let s7DenseZombieOverlayLevel = 0;

    function drawZombie(z) {
      if (!z || !renderSafeX(z.x) || !renderSafeRow(z.row)) return;
      z.flags = z.flags || {};
      z.armors = finiteArray(z.armors);
      const polePacing = z.type === "polecmd" && z.s7?.poleCommandPhase === "pacing";
      const paceElapsed = Math.max(0, finiteNumber(z.s7?.poleCommandPaceElapsed, 0));
      const paceVisualOffset = polePacing ? Math.sin(paceElapsed * Math.PI * 4) * layout.cell * .055 : 0;
      const x = layout.x + finiteNumber(z.x, DAMAGE_BOUNDARY_X) * layout.cell + paceVisualOffset,
        y = cy(Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(z.row, 0)))));
      const timelineZombieMode = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE;
      const zombieHitFlash = s7ZombieHitFlashActive(z);
      const zombieFrozen = finiteNumber(z.freeze, 0) > 0;
      // Plain legacy zombies need no transform/effect isolation. Avoiding one
      // save/restore pair per zombie is a major win in dense hordes.
      const isolatedCanvasState = s7DenseZombieOverlayLevel === 0 || timelineZombieMode || !!z.underground || zombieHitFlash || zombieFrozen || z.dir > 0;
      let zombieSpriteBaseAlpha = 1;
      if (isolatedCanvasState) {
        ctx.save();
        if (timelineZombieMode) s7ApplyCanvasAnimationPose(ctx, "zombie", z, x, y, layout.cell);
        if (z.underground) ctx.globalAlpha = .45;
        zombieSpriteBaseAlpha = ctx.globalAlpha;
        if (zombieHitFlash) ctx.globalAlpha = zombieSpriteBaseAlpha * ZOMBIE_HIT_FLASH_ALPHA;
        if (zombieFrozen) ctx.shadowColor = "#93c5fd", ctx.shadowBlur = 12;
        if (z.dir > 0) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
      } else {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.filter = "none";
        // ctx.save/restore previously reset these before every entity. Reset the
        // paint state explicitly so Emoji antialiasing remains pixel-identical.
        ctx.fillStyle = "#000000";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const zombieGlyphScale = s7ZombieFallbackGlyphScale(z);
      ctx.font = `${layout.cell*zombieGlyphScale}px serif`;
      if (timelineZombieMode) {
        const zombieFrameEffect = z.s7?.command || z.s7?.variant || z.s7?.immortalGraveActive;
        if (zombieFrameEffect) {
          ctx.save();
          if (z.s7?.immortalGraveActive) {
            ctx.filter = 'sepia(1) saturate(4) hue-rotate(320deg) brightness(1.05)';
          } else if (z.type === 'blackolive' && finiteNumber(z.hp, 0) > finiteNumber(z.maxHp, 1) * 0.5) {
            ctx.filter = 'saturate(0) brightness(0.85)';
          } else if (z.s7?.command) {
            ctx.filter = 'sepia(0.6) saturate(2.5) hue-rotate(-15deg)';
          } else {
            ctx.filter = 'sepia(.45) saturate(2.1) hue-rotate(55deg) brightness(1.02)';
          }
        }
        s7DrawLayeredSprite(ctx, "zombie", z, x, y - layout.cell*.015, layout.cell);
        if (zombieFrameEffect) ctx.restore();
      } else {
        ctx.fillText(z.emoji, x, y - 2);
      }
      ctx.globalAlpha = zombieSpriteBaseAlpha;
      if (z.dir > 0) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
      if (z.blind) {
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - layout.cell * .32, y - layout.cell * .32, layout.cell * .64, layout.cell * .64)
      }
      if (z.friendly) {
        ctx.fillStyle = "#86efac";
        ctx.font = `${layout.cell*.14}px sans-serif`;
        ctx.fillText("友", x, y - layout.cell * .36)
      }
      if (z.s7?.variant || z.s7?.command) {
        ctx.fillStyle = z.s7.command ? "#f87171" : "#fef08a";
        ctx.font = `${layout.cell*.1}px sans-serif`;
        ctx.fillText(z.s7.command ? "指令" : "变种", x, y - layout.cell * .45)
      }
      if (polePacing) {
        const remain = Math.max(0, POLE_COMMAND_RULE.pacingSeconds - paceElapsed);
        ctx.fillStyle = "#fde68a";
        ctx.font = `${layout.cell*.1}px sans-serif`;
        ctx.fillText(`踱步 ${remain.toFixed(1)}s`, x, y + layout.cell * .55)
      }
      let currentTotalHp = finiteNumber(z.hp, 0);
      let maximumTotalHp = finitePositive(z.maxHp, 1);
      let armorLabel = "";
      let armorDamaged = false;
      for (let i = 0; i < z.armors.length; i++) {
        const armorLayer = z.armors[i];
        if (!armorLayer) continue;
        const armorHp = finiteNumber(armorLayer.hp, 0);
        const armorMax = finiteNumber(armorLayer.max, 0);
        currentTotalHp += armorHp;
        maximumTotalHp += armorMax;
        armorDamaged ||= armorHp < armorMax - .5;
        if (armorLabel) armorLabel += "/";
        armorLabel += (armorLayer.name || "甲") + Math.ceil(armorHp)
      }
      const totalHpDamaged = currentTotalHp < maximumTotalHp - .5;
      const hasImportantZombieState = !!(z.dying || z.friendly || z.s7?.command || z.s7?.variant || z.blind || zombieFrozen || z.slow > 0);
      if (s7DenseZombieOverlayLevel < 2 || totalHpDamaged || hasImportantZombieState) {
        drawHpBar(x, y + layout.cell * .38, currentTotalHp, maximumTotalHp, z.dying ? "#9ca3af" : "#ef4444")
      }
      // Dense-mode LOD only removes redundant full-health armor numbers.
      // Damaged armor and special/variant entities remain labelled.
      const showArmorLabel = armorLabel && (s7DenseZombieOverlayLevel === 0 || armorDamaged || z.s7?.command || z.s7?.variant);
      if (showArmorLabel) {
        ctx.fillStyle = "#e5e7eb";
        ctx.font = `${layout.cell*.11}px sans-serif`;
        ctx.fillText(armorLabel, x, y - layout.cell * .38)
      }
      const e = z.s7Elem;
      if (e && entityTextVisible) {
        let parts = [];
        if (e.cold > 0) parts.push("寒" + Math.floor(e.cold));
        if (e.fire > 0) parts.push("焰" + Math.floor(e.fire));
        if (e.poison > 0) parts.push("毒" + Math.floor(e.poison));
        if (e.lumen > 0) parts.push("光" + Math.floor(e.lumen));
        if (e.dark > 0) parts.push("暗" + Math.floor(e.dark));
        if (z.s7Vuln) parts.push("弱" + Math.round(z.s7Vuln * 100) + "%");
        if (parts.length) {
          ctx.fillStyle = "#e0f2fe";
          ctx.font = `${layout.cell*.1}px sans-serif`;
          ctx.fillText(parts.join(" "), x, y + layout.cell * .55)
        }
      }
      drawEntityTextBadge(zombieShortName(z), x, y - layout.cell * .01, layout.cell, z.s7?.command ? "#fde68a" : z.s7
        ?.variant ? "#fef08a" : "#fee2e2");
      if (isolatedCanvasState) ctx.restore()
    }

    function drawHpBar(x, y, val, max, color) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const w = layout.cell * .65,
        h = 5;
      const ratio = clamp(finiteNumber(val, 0) / finitePositive(max, 1), 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(x - w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y, w * ratio, h)
    }

    function drawBullet(b) {
      if (!b || !renderSafeX(b.x) || !Number.isFinite(b.y)) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const melonScale = b.melonCannon ? .25 : b.goldenMelon ? .22 : b.melonGrowthCount > 0 ? Math.min(.23, .16 + b
        .melonGrowthCount * .018) : .16;
      const bulletScale = s7VisualScaleMultiplier('bullet', b);
      ctx.font = `${layout.cell*melonScale*bulletScale}px serif`;
      let s = b.emoji || "•";
      if (!b.emoji) {
        if (b.kind === "iceLance" || b.iceLance) s = "🧊";
        else if (b.kind === "ice") s = "❄";
        else if (b.kind === "fire") s = "🔥";
        else if (b.kind === "star") s = "★";
        else if (b.kind === "pult") s = "🥬";
        else if (b.kind === "kernel") s = "🌽";
        else if (b.kind === "basketball") s = "🏀";
        else if (b.kind === "butter") s = "🧈";
        else if (b.kind === "winter" || b.kind === "melon") s = "🍉";
        else if (b.kind === "goldenMelon") s = "🌟🍉";
        else if (b.kind === "melonCannon") s = "💥🍉";
        else if (b.kind === "cattail") s = "大刺";
        else if (b.kind === "cattailSmall") s = "小刺";
        else if (b.kind === "miniPea") s = "•";
        else if (b.kind === "firelotus") s = "🪷";
        else if (b.kind === "cactus") s = "刺";
        else if (b.iceLance) s = "🧊";
        else if (b.poisonFire) s = "🟢";
        else if (b.kind === "spore") s = "孢"
      }
      ctx.fillStyle = b.poisonFire ? "#4ade80" : b.goldenMelon ? "#fbbf24" : b.melonCannon ? "#fb7185" : b.kind === "fire" ? "#fb923c" : ["ice",
        "icefire", "iceflame"
      ].includes(b.kind) ? "#bfdbfe" : "#dcfce7";
      const bx = layout.x + finiteNumber(b.x, 0) * layout.cell;
      const by = layout.y + finiteNumber(b.y, 0) * layout.cell;
      let b06BulletDrawn = false;
      if (s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE) {
        // 火红莲明确保留Emoji弹体，不被时间轴弹体资源替换。
        if (b.kind !== "firelotus") b06BulletDrawn = s7DrawB06Projectile(ctx,b,bx,by,layout.cell);
        // Preserve the already-approved B02A originals as a safety fallback only.
        if (!b06BulletDrawn && b.kind === "kernel") b06BulletDrawn = s7DrawSpriteAsset(ctx, "corn.kernel", bx, by, layout.cell, {pixelScale:.0085,scale:.82});
        else if (!b06BulletDrawn && b.kind === "butter") b06BulletDrawn = s7DrawSpriteAsset(ctx, "corn.butter", bx, by, layout.cell, {pixelScale:.0068,scale:.78});
        else if (!b06BulletDrawn && b.kind === "bigButter") b06BulletDrawn = s7DrawSpriteAsset(ctx, "corn.butter", bx, by, layout.cell, {pixelScale:.0076,scale:1.0});
      }
      // 火红莲没有时间轴弹体贴图时仍必须显示其Emoji弹体；其他弹体维持原有
      // “时间轴资源优先、旧版Emoji兜底”规则。
      if (!b06BulletDrawn && (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE || b.kind === "firelotus")) ctx.fillText(s, bx, by);
      ctx.restore()
    }

    function drawTurret(t) {
      if (!t || !renderSafeX(t.x) || !renderSafeRow(t.row)) return;
      ctx.save();
      const x = layout.x + finiteNumber(t.x, 0) * layout.cell,
        y = cy(Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(t.row, 0)))));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${layout.cell*.22}px serif`;
      ctx.fillText("🐾", x, y - layout.cell * .22);
      ctx.fillStyle = "#bae6fd";
      ctx.font = `${layout.cell*.08}px sans-serif`;
      ctx.fillText(`${Math.max(0,Math.floor(finiteNumber(t.roundsLeft,0)))}轮`, x, y - layout.cell * .48);
      ctx.restore()
    }

    function drawEffect(e) {
      if (!e || !renderSafeX(e.x) || !renderSafeRow(e.row)) return;
      const ratio = finiteNumber(e.ttl, 0) / finitePositive(e.max, 1);
      const x = layout.x + finiteNumber(e.x, 0) * layout.cell,
        y = cy(Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(e.row, 0))))) - layout.cell * .28 * (1 - ratio);
      ctx.save();
      ctx.globalAlpha = clamp(ratio, 0, 1) * clamp(finiteNumber(e.opacity,1),0,1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE && e.spriteKind && S7_BILIBILI_EFFECT_MANIFEST[e.spriteKind]) {
        const spec=S7_BILIBILI_EFFECT_MANIFEST[e.spriteKind];
        const elapsed=Math.max(0, finiteNumber(e.max,1)-finiteNumber(e.ttl,0));
        const frame=(Math.floor(elapsed*finiteNumber(spec.fps,16))+finiteNumber(e.frameOffset,0))%Math.max(1,finiteNumber(spec.frameCount,1));
        const scaleX=e.spriteKind==='fumeSpray' ? Math.max(.75, finiteNumber(e.rangeCells,1)) : finiteNumber(e.scale,1);
        s7DrawSpriteAsset(ctx,`effect.bili.${e.spriteKind}`,x,y+layout.cell*.28,layout.cell,{frameIndex:frame,pixelScale:spec.pixelScale,scaleX,scaleY:finiteNumber(e.scale,1),pivotX:spec.pivotX,pivotY:spec.pivotY});
      } else if (e.bigStarVisual) {
        const pulse = .82 + .18 * Math.sin((1 - ratio) * Math.PI * 5);
        const rowY = cy(Math.max(0, Math.min(ROWS - 1, Math.round(e.row))));
        const grad = ctx.createLinearGradient(layout.x, rowY, layout.x + layout.w, rowY);
        grad.addColorStop(0, "rgba(253,224,71,0)");
        grad.addColorStop(.25, `rgba(253,224,71,${.16*ratio})`);
        grad.addColorStop(.5, `rgba(255,255,255,${.34*ratio})`);
        grad.addColorStop(.75, `rgba(253,224,71,${.16*ratio})`);
        grad.addColorStop(1, "rgba(253,224,71,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(layout.x, rowY - layout.cell * .26, layout.w, layout.cell * .52);
        ctx.shadowColor = "#fde047";
        ctx.shadowBlur = layout.cell * .35;
        ctx.font = `${layout.cell*.56*pulse}px serif`;
        ctx.fillStyle = "#fff7ae";
        ctx.fillText("🌟", x, rowY);
        ctx.shadowBlur = 0;
        ctx.font = `bold ${layout.cell*.095}px sans-serif`;
        ctx.fillStyle = "#fef9c3";
        const suffix = e.hitCount > 0 ? ` ×${e.hitCount}` : "";
        ctx.fillText(`${e.label||"大星星"}${suffix}`, x, rowY - layout.cell * .39)
      } else if (e.potatoMarker) {
        const rowY = cy(Math.max(0, Math.min(ROWS - 1, Math.round(e.row))));
        const pulse = 1 + .18 * Math.sin((1 - ratio) * Math.PI * 6);
        ctx.shadowColor = "rgba(250,204,21,0.85)";
        ctx.shadowBlur = layout.cell * .22 * ratio;
        ctx.font = `${layout.cell*.38*pulse}px serif`;
        ctx.fillStyle = "#fff1a6";
        ctx.fillText("🥔", x, rowY + layout.cell * .02);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(251,191,36,${.85*ratio})`;
        ctx.lineWidth = Math.max(1, layout.cell * .025);
        ctx.beginPath();
        ctx.arc(x, rowY + layout.cell * .02, layout.cell * (.18 + .06 * (1 - ratio)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `bold ${layout.cell*.1}px sans-serif`;
        ctx.fillStyle = "#fef3c7";
        ctx.fillText(e.label || "土豆雷", x, rowY - layout.cell * .34)
      } else {
        ctx.fillStyle = e.color;
        ctx.font = `${layout.cell*.13}px sans-serif`;
        ctx.fillText(e.text, x, y)
      }
      ctx.restore()
    }

    // -----------------------------------------------------------------------------

    // 渲染 / drawCrater

    // [原源码行 8380] 明确的大星星贴图与仅限本行的横向闪光；不会覆盖或误导到相邻行。

    // -----------------------------------------------------------------------------

    function drawCrater(e) {
      if (!e || !renderSafeX(e.x) || !renderSafeRow(e.row)) return;
      ctx.save();
      ctx.globalAlpha = .25;
      ctx.fillStyle = "#1c1917";
      ctx.beginPath();
      ctx.ellipse(layout.x + finiteNumber(e.x, 0) * layout.cell, cy(Math.max(0, Math.min(ROWS - 1, Math.round(
        finiteNumber(e.row, 0))))), layout.cell * .45, layout.cell * .2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore()
    }

    function drawPoisonPits() {
      if (!state.poisonPits) return;
      for (const pit of finiteArray(state.poisonPits)) {
        if (!pit || !Number.isFinite(pit.row) || !Number.isFinite(pit.col)) continue;
        const ratio = finiteNumber(pit.ttl, 0) / finitePositive(pit.max, 1);
        const x = layout.x + (pit.col + .5) * layout.cell;
        const y = cy(Math.max(0, Math.min(ROWS - 1, Math.round(pit.row))));
        ctx.save();
        ctx.globalAlpha = clamp(.35 * ratio, 0, .35);
        ctx.fillStyle = "#84cc16";
        ctx.beginPath();
        ctx.ellipse(x, y, layout.cell * .42, layout.cell * .18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = clamp(.6 * ratio, 0, .6);
        ctx.fillStyle = "#a3e635";
        ctx.font = `${layout.cell*.1}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("毒坑", x, y + layout.cell * .04);
        ctx.restore()
      }
    }

    let _lastUiStatusMarkup = "";
    let _lastUiRankMarkup = "";
    let _lastUiStatusAt = -Infinity;
    let _lastUiRankAt = -Infinity;

    function s7SetTextIfChanged(el, text) {
      if (el && el.textContent !== text) el.textContent = text
    }

    function redrawUi() {
      if (!state || !state.running) return;
      const now = performance.now();
      s7SetTextIfChanged(document.getElementById("clock"), fmt(state.time));
      const sg = document.getElementById("statusGrid");
      if (sg && now - _lastUiStatusAt >= 500) {
        _lastUiStatusAt = now;
        const m = (state.time / 60).toFixed(1),
          it = s7SpawnInterval(state.time).toFixed(1),
          cp = Math.round(s7CommandProb(state.time) * 100);
        const statusMarkup = state.teams.map(t =>
          `<div class="stat"><b style="color:${TEAM_COLORS[t.row]}">${t.name}</b><br>${t.alive?"存活":"淘汰 "+fmt(t.defeatAt)}<br>开盒 ${t.transforms}｜击杀 ${t.kills}<br>下个 ${Math.max(0,t.spawn).toFixed(1)}s</div>`
          ).join("") +
          `<div class="stat"><b>S7</b><br>${state.battle?"出怪中":state.preRun?"运行中":"布阵静止"}｜${m} min<br>盲盒间隔 ${it}s｜指令概率 ${cp}%<br>速度 ${state.speed||1}×</div>`;
        if (statusMarkup !== _lastUiStatusMarkup) {
          sg.innerHTML = statusMarkup;
          _lastUiStatusMarkup = statusMarkup
        }
      }
      const rankEl = document.getElementById("rank");
      if (rankEl && now - _lastUiRankAt >= 1000) {
        _lastUiRankAt = now;
        const rank = [...state.teams].sort((a, b) => (b.alive ? state.time : b.defeatAt || 0) - (a.alive ? state.time : a
          .defeatAt || 0) || b.transforms - a.transforms || b.kills - a.kills || b.damage - a.damage);
        const rankMarkup = "<tr><th>#</th><th>路线</th><th>存活</th><th>开盒</th><th>击杀</th><th>伤害</th></tr>" + rank.map((t, i) =>
          `<tr><td>${i+1}</td><td>${t.name}</td><td>${fmt(t.alive?state.time:t.defeatAt)}</td><td>${t.transforms}</td><td>${t.kills}</td><td>${Math.round(t.damage)}</td></tr>`
          ).join("");
        if (rankMarkup !== _lastUiRankMarkup) {
          rankEl.innerHTML = rankMarkup;
          _lastUiRankMarkup = rankMarkup
        }
      }
      s7SetTextIfChanged(document.getElementById("selectedText"), selectedToolLabel());
      const tg = document.getElementById("toggleCardsBtn");
      s7SetTextIfChanged(tg, MOBILE_DEVICE ? "总卡槽 H" : cardMode === "plant" ? "僵尸卡槽 H" : "植物卡槽 H");
      const bs = document.getElementById("btnSpeed");
      s7SetTextIfChanged(bs, (state.speed || 1) + "×")
    }

    function finish() {
      if (!state || !state.running) return;
      // 联机对战模式：不停止模拟，不弹出结束界面，等房主手动停止
      if (window._mpBattleActive) return;
      state.running = false;
      const rank = [...state.teams].sort((a, b) => (b.alive ? state.time : b.defeatAt || 0) - (a.alive ? state.time : a
        .defeatAt || 0) || b.transforms - a.transforms || b.kills - a.kills || b.damage - a.damage);
      if (QUAD_CHILD_MODE) {
        reportQuadChild("quadFinished", {
          time: state.time || 0,
          formatted: fmt(state.time || 0),
          aliveLanes: 0
        });
        return
      }
      document.getElementById("resultTitle").textContent =
        `冠军：${rank[0].name}，存活 ${fmt(rank[0].alive?state.time:rank[0].defeatAt)}`;
      document.getElementById("resultBody").innerHTML =
        '<table class="miniTable"><tr><th>名次</th><th>路线</th><th>存活</th><th>盲盒变身</th><th>击杀</th><th>总伤害</th></tr>' + rank
        .map((t, i) =>
          `<tr><td>${i+1}</td><td>${t.name}</td><td>${fmt(t.alive?state.time:t.defeatAt)}</td><td>${t.transforms}</td><td>${t.kills}</td><td>${Math.round(t.damage)}</td></tr>`
          ).join("") + "</table>";
      document.getElementById("resultModal").classList.remove("hidden")
    }
    let lastQuadRenderAt = 0;
    let lastDrawCostMs = 0;
    let animationFrameId = 0;
    let quadRefreshPort = null;
    let quadRefreshWatchdogId = 0;
    let quadRefreshLastTickAt = 0;
    const quadRefreshBootAt = performance.now();

    let _cachedModalEl = null;
    function _modalEl() {
      if (!_cachedModalEl) _cachedModalEl = document.getElementById("modal");
      return _cachedModalEl;
    }

    function s7AdaptiveRenderIntervalMs() {
      const zombieCount = Array.isArray(state?.zombies) ? state.zombies.length : 0;
      // 渲染帧率与游戏速度绑定：1x=25FPS(40ms), 2x=50FPS(20ms), 4x=100FPS(10ms)
      const speed = Math.max(.25, finiteNumber(state?.speed || 1, 1));
      const baseInterval = 40 / speed;
      // 只在僵尸数量极大且绘制耗时超标时才降低渲染频率
      if (zombieCount < 320 || lastDrawCostMs <= 24) return baseInterval;
      return Math.min(80, Math.max(50, lastDrawCostMs * 1.35))
    }

    function runGameFrame(now = performance.now()) {
      now = finiteNumber(now, performance.now());
      const modalEl = _modalEl();
      if (modalEl && !modalEl.classList.contains("hidden")) {
        last = now;
        frameAcc = 0;
        return
      }
      if (state && !state.running) {
        last = now;
        frameAcc = 0;
        return
      }
      let steps = 0;
      try {
        const raw = Math.min(.16, Math.max(0, (now - last) / 1e3));
        last = now;
        frameAcc += raw;
        const pace = FIXED_FRAME_DT / Math.max(.25, finiteNumber(state?.speed || 1, 1));
        while (frameAcc >= pace && steps < PERF.MAX_STEPS_PER_FRAME) {
          frameAcc -= pace;
          if (state) update(FIXED_FRAME_DT);
          steps++
        }
        if (steps >= PERF.MAX_STEPS_PER_FRAME && frameAcc >= pace) frameAcc = 0
      } catch (err) {
        console.error(err);
        frameAcc = 0;
        if (state) {
          log("运行异常已被保护性捕获：" + (err?.message || err));
          addEffect(0, .5, "异常保护", "#fca5a5", 1);
          s7PerformanceCleanup(true);
          steps = 1
        }
      }
      const adaptiveRenderInterval = s7AdaptiveRenderIntervalMs();
      const requiredRenderInterval = QUAD_CHILD_MODE ? Math.max(QUAD_CHILD_RENDER_INTERVAL_MS, adaptiveRenderInterval) : adaptiveRenderInterval;
      const renderIntervalReady = now - lastQuadRenderAt >= requiredRenderInterval;
      const contentChanged = steps > 0 || now - lastQuadRenderAt >= PERF.MAX_UNCHANGED_RENDER_GAP_MS;
      const shouldRender = renderIntervalReady && contentChanged;
      if (state && shouldRender) {
        lastQuadRenderAt = now;
        try {
          const drawStartedAt = performance.now();
          draw();
          lastDrawCostMs = performance.now() - drawStartedAt
        } catch (err) {
          rememberRenderError(err, "draw.frame");
          sanitizeRenderState(true);
          try {
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            const viewport = viewportMetrics();
            ctx.clearRect(0, 0, viewport.width, viewport.height);
            drawBoard();
            addEffect(0, .5, "渲染已自动恢复", "#bae6fd", .8)
          } catch (_) {}
        }
      }
    }

    function browserAnimationLoop(now) {
      runGameFrame(now);
      animationFrameId = requestAnimationFrame(browserAnimationLoop)
    }

    function startBrowserAnimationLoop() {
      if (animationFrameId) return;
      last = performance.now();
      animationFrameId = requestAnimationFrame(browserAnimationLoop)
    }

    function stopBrowserAnimationLoop() {
      if (!animationFrameId) return;
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0
    }

    function attachQuadRefreshPort(port) {
      if (!QUAD_CHILD_MODE || !port) return false;
      try {
        quadRefreshPort?.close?.()
      } catch (_) {}
      quadRefreshPort = port;
      quadRefreshLastTickAt = performance.now();
      quadRefreshPort.onmessage = event => {
        if (event?.data?.type !== "quadRefreshTick") return;
        quadRefreshLastTickAt = performance.now();
        stopBrowserAnimationLoop();
        runGameFrame(quadRefreshLastTickAt)
      };
      try {
        quadRefreshPort.start?.()
      } catch (_) {}
      stopBrowserAnimationLoop();
      return true
    }

    function startQuadRefreshWatchdog() {
      if (!QUAD_CHILD_MODE || quadRefreshWatchdogId) return;
      quadRefreshWatchdogId = setInterval(() => {
        const now = performance.now();
        const stale = quadRefreshPort ? now - quadRefreshLastTickAt > 1200 : now - quadRefreshBootAt > 1600;
        if (stale) startBrowserAnimationLoop();
        else stopBrowserAnimationLoop()
      }, 400)
    }
    if (QUAD_CHILD_MODE) startQuadRefreshWatchdog();
    else startBrowserAnimationLoop();
    if (!QUAD_CHILD_MODE) {
      setInterval(() => {
        if (document.hidden) return;
        try {
          redrawUi()
        } catch (err) {
          console.error("ui redraw error", err)
        }
      }, 250)
    }
