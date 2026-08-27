"use strict";

    /* ============================================================================
     * FINAL: source-video Gatling + unified projectile registry + Bilibili source-backed fume/gloom effects.
     * Projectile art is stored as external atlases and selected by bullet.kind.
     * ========================================================================== */
    const S7_B06_PROJECTILE_MANIFEST = Object.freeze({
      pea:{file:'pea.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:12,pixelScale:.0050,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      ice:{file:'ice_pea.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:12,pixelScale:.0052,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      fire:{file:'fire_pea.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:14,pixelScale:.0052,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      cabbage:{file:'cabbage.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:13,pixelScale:.0061,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      kernel:{file:'kernel.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:13,pixelScale:.0052,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      butter:{file:'butter.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:12,pixelScale:.0055,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      melon:{file:'melon.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:12,pixelScale:.0060,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      winter:{file:'winter_melon.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:12,pixelScale:.0060,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      star:{file:'star.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:14,pixelScale:.0058,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null},
      cattail:{file:'cattail_spike.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:16,pixelScale:.0060,pivotX:.5,pivotY:.5,rotateAlongVelocity:true,hitAsset:null},
      cactus:{file:'cactus_spike.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:16,pixelScale:.0060,pivotX:.5,pivotY:.5,rotateAlongVelocity:true,hitAsset:null},
      spore:{file:'spore.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:13,pixelScale:.0050,pivotX:.5,pivotY:.5,rotateAlongVelocity:true,hitAsset:null},
      basketball:{file:'basketball.png',frameWidth:96,frameHeight:96,columns:6,frameCount:6,fps:14,pixelScale:.0056,pivotX:.5,pivotY:.5,rotateAlongVelocity:false,hitAsset:null}
    });
    const S7_BILIBILI_EFFECT_MANIFEST = Object.freeze({
      fumeSpray:{file:'fume_spray.png',frameWidth:343,frameHeight:62,columns:8,frameCount:8,fps:16,pixelScale:.0030,pivotX:0,pivotY:.5},
      gloomPulse:{file:'gloom_pulse.png',frameWidth:210,frameHeight:240,columns:10,frameCount:10,fps:22,pixelScale:.0042,pivotX:.5,pivotY:.5}
    });

    const S7_PROJECTILE_SPRITES = Object.freeze({
      pea:'pea',miniPea:'pea',
      ice:'ice',icefire:'ice',iceflame:'ice',iceLance:'ice',
      fire:'fire',
      pult:'cabbage',
      kernel:'kernel',
      butter:'butter',bigButter:'butter',
      melon:'melon',goldenMelon:'melon',melonCannon:'melon',
      winter:'winter',
      star:'star',
      cattail:'cattail',cattailSmall:'cattail',
      cactus:'cactus',cactusGold:'cactus',
      spore:'spore',soulSpore:'spore',
      basketball:'basketball'
    });
    function s7RegisterB06Projectiles() {
      const root='./assets/projectiles_b06/';
      for (const [key,m] of Object.entries(S7_B06_PROJECTILE_MANIFEST)) {
        S7_SPRITES.register(`projectile.b06.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      }
      for (const [key,m] of Object.entries(S7_BILIBILI_EFFECT_MANIFEST)) {
        S7_SPRITES.register(`effect.bili.${key}`,'./assets/effects_bili/'+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      }
      S7_SPRITES.register('plant.b06.gatling.attack','./assets/plants_b06/gatling_attack_video.png',{frameWidth:256,frameHeight:256,columns:8,frameCount:8});
      const gatlingFrames=16;
      S7_ANIM.registerClip({
        id:'plant.b03b.gatling.fire',frames:gatlingFrames,loop:false,
        source:{kind:'user-video',file:'sources/b06_video/7月28日.mov',segment:'03:49-03:56',asset:'gatling_attack_video'},
        layers:{body:{asset:'plant.b06.gatling.attack',z:0,pixelScale:.0039,pivotX:.5,pivotY:.84,
          tracks:{frameIndex:s7B03BNormalizedFrameTrack([80,80,80,80,80,80,80,80],gatlingFrames,false)}}}
      });
    }
    s7RegisterB06Projectiles();

    function s7ProjectileRegistryKey(b) {
      if (!b) return null;
      // 毒火豆复用火焰子弹贴图（绘制时加绿色滤镜），不使用孢子贴图。
      if (b.poisonFire) return 'fire';
      return S7_PROJECTILE_SPRITES[b.kind] || (b.iceLance ? 'ice' : null)
    }
    function s7ProjectileVariantScale(b) {
      if (!b) return 1;
      if (b.kind==='miniPea') return .72;
      if (b.kind==='cattailSmall') return .72;
      if (b.kind==='bigButter' || b.kernelBigButter) return 1.25;
      if (b.kind==='goldenMelon' || b.goldenMelon) return 1.16;
      if (b.kind==='melonCannon' || b.melonCannon) return 1.34;
      if (b.kind==='iceLance' || b.iceLance) return 1.30;
      if (b.kind==='cactusGold' || b.cactusGold) return 1.15;
      return 1
    }
    function s7DrawB06Projectile(ctx2d,b,x,y,cell) {
      const key=s7ProjectileRegistryKey(b), spec=key&&S7_B06_PROJECTILE_MANIFEST[key];
      if (!spec) return false;
      const frame=0;
      const vx=finiteNumber(b.renderDx,finiteNumber(b.dx,1)*(b.dir||1));
      const vy=finiteNumber(b.renderDy,finiteNumber(b.dy,0));
      const directional=new Set(['fire','ice','cabbage','kernel','butter','cattail','cactus','spore']);
      const rotation=directional.has(key) && Math.hypot(vx,vy)>1e-8 ? Math.atan2(vy,vx) : 0;
      const variant=s7ProjectileVariantScale(b)*s7VisualScaleMultiplier('bullet',b);
      ctx2d.save();
      if (b.poisonFire) ctx2d.filter='hue-rotate(95deg) saturate(1.5) brightness(1.05)';
      else if (b.kind==='goldenMelon' || b.goldenMelon || b.kind==='cactusGold' || b.cactusGold) ctx2d.filter='sepia(1) saturate(2.0) hue-rotate(345deg) brightness(1.12)';
      else if (b.kind==='icefire' || b.kind==='iceflame') ctx2d.filter='saturate(1.35) hue-rotate(310deg)';
      else if (key==='fire') {
        // 过火等级越高红色越深：炎豆(2)→橙红，焱豆(3)→深红，黑炎(4)→暗红近黑。
        const stage=Math.max(finiteNumber(b.torchStage,0),typeof s7PeaFireStage==="function"?s7PeaFireStage(b):0);
        if (stage>=4) ctx2d.filter='saturate(1.9) hue-rotate(-42deg) brightness(.68)';
        else if (stage===3) ctx2d.filter='saturate(1.7) hue-rotate(-30deg) brightness(.92)';
        else if (stage===2) ctx2d.filter='saturate(1.35) hue-rotate(-14deg)';
      }
      const ok=s7DrawSpriteAsset(ctx2d,`projectile.b06.${key}`,x,y,cell,{frameIndex:frame,pixelScale:spec.pixelScale,scale:variant,pivotX:spec.pivotX,pivotY:spec.pivotY,rotation});
      ctx2d.restore();
      return ok
    }

    function s7ZombieHasArmorName(z, names) {
      const arr=Array.isArray(names)?names:[names];
      return finiteArray(z?.armors).some(a=>a&&finiteNumber(a.hp,0)>0&&arr.includes(a.name));
    }

    function s7B04AIsCommon(z) { return !!(z && S7_B04A_COMMON_TYPES.has(z.type)) }

    function s7PlantAnimationRate(p) {
      if (!p || p.dead) return 0;
      if (p.key === "kernel" && p.s7?.kernelThrowPending && p.s7?.kernelThrowRate > 0) return p.s7.kernelThrowRate;
      if (p.slow > 0) return .5;
      // 视觉时钟仍是25Hz；增益通过每个逻辑帧推进更多“动画帧进度”实现。
      let rate = 1;
      if (p.buff > 0) rate *= 2;
      if (p.s7?.shine > 0) rate *= 2;
      if (p.s7?.wind > 0) rate *= 1.25;
      if (p.s7?.fertilizer > 0) rate *= 2;
      return Math.max(0, rate)
    }

    function s7ZombieAnimationRate(z) {
      if (!z || z.dead) return 0;
      if (finiteNumber(z.freeze, 0) > 0 || finiteNumber(s7Elem?.(z)?.iceBound, 0) > 0) return 0;
      let rate = 1;
      // 寒意统一使用与行为时钟相同的倍率，确保走路、啃食、跳跃、砸击、投掷等
      // 游戏动作和时间轴视觉不会出现一快一慢。
      rate *= typeof s7ZombieColdActionRate === "function" ? s7ZombieColdActionRate(z) : 1;
      // Only use explicit, source-backed animation multipliers here. Movement multipliers are not copied blindly.
      if (z.s7?.variant && z.type === "pole") rate *= 1.3;
      if (z.s7?.variant && z.type === "gatlingz") rate *= 1.5;
      // B02B: newspaper attack damage is emitted by timeline events, so hard control must
      // pause the timeline and variant rage stacks must accelerate the same clock.
      if (z.type === "newspaper" && finiteNumber(z.stun, 0) > 0) return 0;
      if (z.type === "newspaper" && z.s7?.variant && z.enraged && z.s7?.newspaperRagePhase === "sprinting")
        rate *= 1 + Math.min(1, Math.max(0, finiteNumber(z.s7?.rageStacks, 0)) * .1);
      if (z.s7?.animationRate != null) rate *= Math.max(0, finiteNumber(z.s7.animationRate, 1));
      return Math.max(0, rate)
    }

    function s7ResolvePlantAnimation(p) {
      const forced = p?.s7?.animState;
      if (forced) return { state:String(forced), clipId:p.s7.animClip || `plant.${forced}` };
      if (p?.key === "kernel") return { state:"kernel_idle", clipId:"plant.kernel.idle" };
      if (p?.key === "firelotus") return { state:"custom_firelotus", clipId:"plant.custom.firelotus" };
      if (p?.key === "sunflower") return {state:"b03c_idle",clipId:S7_B03C_DEFAULT_CLIPS.sunflower};
      const videoSkillKey=p?.s7?.videoSkillKey || p?.key;
      if (finiteNumber(p?.s7?.videoSkillTimer,0)>0 && S7_VIDEO_DUAL_CLIPS.skill[videoSkillKey]) return {state:"video_dual_skill",clipId:S7_VIDEO_DUAL_CLIPS.skill[videoSkillKey]};
      if (finiteNumber(p?.s7?.videoSkillTimer,0)>0 && S7_VIDEO_SKILL_CLIPS[videoSkillKey]) return {state:"video_skill",clipId:S7_VIDEO_SKILL_CLIPS[videoSkillKey]};
      if (isMushroomAsleep(p)) {
        const sleepClip = S7_B03C_SLEEP_CLIPS[p.key] || S7_B03A_SLEEP_CLIPS[p.key];
        return sleepClip ? {state:"source_sleep",clipId:sleepClip} : { state:"sleep", clipId:"plant.sleep" }
      }
      if (S7_VIDEO_DUAL_CLIPS.idle[p.key]) return {state:"video_dual_idle",clipId:S7_VIDEO_DUAL_CLIPS.idle[p.key]};
      if (p.key === "chomper") {
        if (p.s7?.chomperPhase === "chew") return {state:"chomper_digest",clipId:S7_B03C_STATE_CLIPS.chomperDigest};
        if (["swallow","recover"].includes(p.s7?.chomperPhase)) return {state:"chomper_attack",clipId:S7_B03C_STATE_CLIPS.chomperAttack};
        return {state:"b03c_idle",clipId:S7_B03C_DEFAULT_CLIPS.chomper}
      }
      if (p.key === "garlic") {
        const ratio=finiteNumber(p.hp,0)/finitePositive(p.maxHp,1);
        if (ratio<=1/3) return {state:"garlic_d3",clipId:S7_B03C_STATE_CLIPS.garlicD3};
        if (ratio<=2/3) return {state:"garlic_d2",clipId:S7_B03C_STATE_CLIPS.garlicD2};
        return {state:"b03c_idle",clipId:S7_B03C_DEFAULT_CLIPS.garlic}
      }
      if (p.key === "scaredy") {
        if (p.s7?.hiding) return {state:"scaredy_cry",clipId:S7_B03C_STATE_CLIPS.scaredyCry};
        return {state:"b03c_idle",clipId:S7_B03C_DEFAULT_CLIPS.scaredy}
      }
      if (p.key === "squash") {
        return {state:"b03b_idle",clipId:S7_B03B_DEFAULT_CLIPS.squash}
      }
      if (p.key === "threepeater") {
        if ((p.s7?.ultTimer||0)>0) return {state:"threepeater_ult",clipId:"plant.b03b.threepeater.ult"};
        if ((p.s7?.b03bFireTimer||0)>0) return {state:"threepeater_fire",clipId:"plant.b03b.threepeater.fire"};
        return {state:"b03b_idle",clipId:S7_B03B_DEFAULT_CLIPS.threepeater}
      }
      if (p.key === "blover") {
        if ((p.s7?.b03bGustTimer||0)>0) return {state:"blover_gust",clipId:"plant.b03b.blover.gust"};
        return {state:"b03b_idle",clipId:S7_B03B_DEFAULT_CLIPS.blover}
      }
      if (p.key === "gatling") {
        if ((p.s7?.b03bUltTimer||0)>0) return {state:"gatling_ult",clipId:"plant.b03b.gatling.ult"};
        return {state:"b03b_idle",clipId:S7_B03B_DEFAULT_CLIPS.gatling}
      }
      if (p.key === "reverseRepeater") {
        const mirroredClip = S7_B03A_DEFAULT_CLIPS.reverseRepeater || S7_B03A_DEFAULT_CLIPS.repeater;
        return {state:"b03a_mirrored_idle",clipId:mirroredClip}
      }
      if (p.key === "explodenut") {
        const b03bClip = S7_B03B_DEFAULT_CLIPS.explodenut;
        if (b03bClip) return {state:"b03b_idle",clipId:b03bClip};
      }
      if (p.key === "magnet" && p.s7?.magnetState) return { state:`magnet_${p.s7.magnetState}`, clipId:"plant.special" };
      const b03cClip = S7_B03C_DEFAULT_CLIPS[p.key];
      if (b03cClip) return {state:"b03c_idle",clipId:b03cClip};
      const b03aClip = S7_B03A_DEFAULT_CLIPS[p.key];
      if (b03aClip) return {state:"b03a_idle",clipId:b03aClip};
      return { state:"idle", clipId:"plant.idle" }
    }

    function s7ResolveZombieAnimation(z) {
      const forced = z?.s7?.animState;
      if (forced) return { state:String(forced), clipId:z.s7.animClip || `zombie.${forced}` };
      // Unified attacking check: front plant OR (friendly zombie with hostile zombie in bite range)
      const frontPlant = typeof frontPlantForZombie === "function" ? frontPlantForZombie(z) : null;
      let attacking = !!(frontPlant && !z?.underground && !isBalloonAir(z));
      if (!attacking && z?.friendly && !z?.vehicle) {
        const enemy = typeof nearestHostileForFriendly === "function" ? nearestHostileForFriendly(z) : null;
        if (enemy && Math.abs(z.x - enemy.x) < .46) attacking = true;
      }
      if (z?.type === "immortal" && z.s7?.immortalGraveActive) {
        return {state:"grave.red",clipId:"zombie.b04r.normal.move"};
      }
      if (z?.type === "newspaper") {
        z.s7 = z.s7 || {};
        if (z.dying) return {state:"die",clipId:"zombie.newspaper.die"};
        const phase = z.s7.newspaperRagePhase;
        if (phase === "paper_break") return {state:"paper.break",clipId:"zombie.newspaper.paper.break"};
        if (phase === "transition") return {state:"transition.invuln",clipId:"zombie.newspaper.transition.invuln"};
        const p = typeof frontPlantForZombie === "function" ? frontPlantForZombie(z) : null;
        const attacking = !!(p && !z.underground && !isBalloonAir(z));
        if (z.s7.newsHeadVisible === false) return attacking ? {state:"attack.lostHead",clipId:"zombie.newspaper.attack.lostHead"} : {state:"walk.lostHead",clipId:"zombie.newspaper.walk.lostHead"};
        if (z.enraged && phase === "sprinting") return attacking ? {state:"attack.rage",clipId:"zombie.newspaper.attack.rage"} : {state:"run.rage",clipId:"zombie.newspaper.run.rage"};
        return attacking ? {state:"attack.paper",clipId:"zombie.newspaper.attack.paper"} : {state:"walk.paper",clipId:"zombie.newspaper.walk.paper"}
      }
      if (z?.type === "ducky") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const shooting=finiteNumber(z.s7?.duckyAttackUntil,0)>finiteNumber(state?.time,0);
        return shooting ? {state:"attack.water",clipId:"zombie.b05b.ducky.attack"} : {state:"move.water",clipId:"zombie.b05b.ducky.walk"};
      }
      if (z?.type === "snorkel") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if (z.diving) return {state:"dive",clipId:"zombie.b05b.snorkel.dive"};
        return attacking ? {state:"attack.surface",clipId:"zombie.b05b.snorkel.attack"} : {state:"move.surface",clipId:"zombie.b05b.snorkel.surface"};
      }
      if (z?.type === "dolphin") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if ((z.jumpMove||0)>0 || z.jumping) {
          const initial=Math.max(.01,finiteNumber(z.s7?.dolphinJumpInitial,finiteNumber(z.jumpMove,1)));
          const ratio=clamp(finiteNumber(z.jumpMove,0)/initial,0,1);
          if (ratio>.67) return {state:"vault.up",clipId:"zombie.b05b.dolphin.jumpUp"};
          if (ratio>.30) return {state:"vault.air",clipId:"zombie.b05b.dolphin.air"};
          return {state:"vault.land",clipId:"zombie.b05b.dolphin.land"};
        }
        if (!z.jumped) return {state:"ride",clipId:"zombie.b05b.dolphin.ride"};
        return attacking ? {state:"attack.noDolphin",clipId:"zombie.b05b.dolphin.attack"} : {state:"walk.noDolphin",clipId:"zombie.b05b.dolphin.walk"};
      }
      if (z?.type === "football") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const helmet=finiteArray(z.armors).find(a=>a&&a.hp>0&&(a.name==="橄榄球帽"||a.name==="橄榄头盔"));
        if (helmet) return attacking ? {state:"attack.helmet",clipId:"zombie.b05b.football.attack"} : {state:"run.helmet",clipId:"zombie.b05b.football.run"};
        return attacking ? {state:"attack.noHelmet",clipId:"zombie.b05b.football.noHelmetAttack"} : {state:"run.noHelmet",clipId:"zombie.b05b.football.noHelmetRun"};
      }
      if (z?.type === "imp") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if (z.flyingImp || z.air || finiteNumber(z.airTimer,0)>0) return {state:"airborne",clipId:"zombie.airborne"};
        return attacking ? {state:"attack",clipId:"zombie.b05b.imp.attack"} : {state:"walk",clipId:"zombie.b05b.imp.walk"};
      }
      if (z?.type === "zomboni") {
        if (z.dying || z.dead) return {state:"boom",clipId:"zombie.b05b.zomboni.boom"};
        const ratio=finiteNumber(z.hp,0)/finitePositive(z.maxHp,1);
        if (ratio<=Math.max(.06,finiteNumber(z.crit,0)/finitePositive(z.maxHp,1))) return {state:"critical",clipId:"zombie.b05b.zomboni.critical"};
        if (ratio<=1/3) return {state:"drive.d2",clipId:"zombie.b05b.zomboni.d2"};
        if (ratio<=2/3) return {state:"drive.d1",clipId:"zombie.b05b.zomboni.d1"};
        return {state:"drive.full",clipId:"zombie.b05b.zomboni.full"};
      }
      if (PLANT_ZOMBIE_TYPES.has(z?.type) || z?.type === "blind") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const type=z.type === "blind" ? "blind" : z.type;
        return attacking ? {state:"attack.plantHead",clipId:`zombie.planthead.${type}.attack`} : {state:"move.plantHead",clipId:`zombie.planthead.${type}.walk`};
      }
      if (z?.type === "digger") {
        if (z.dying) return {state:"die",clipId:"zombie.final.digger_death"};
        if (z.underground) return {state:"move.underground",clipId:"zombie.final.digger_underground"};
        if (z.stun > 0) return {state:"stun",clipId:"zombie.final.digger_stun"};
        if (z.s7?.diggerJustSurfaced) return {state:"surface",clipId:"zombie.final.digger_surface"};
        return attacking ? {state:"attack",clipId:"zombie.final.digger_attack"} : {state:"walk",clipId:"zombie.final.digger_walk"};
      }
      if (z?.type === "pogo") {
        if (z.dying) return {state:"die",clipId:"zombie.final.pogo_death"};
        const hasPogo=s7ZombieHasArmorName(z,["跳跳杆"]);
        if ((z.jumpMove||0)>0 || z.jumping || hasPogo) return {state:"move.pogo",clipId:"zombie.final.pogo_move"};
        return attacking ? {state:"attack.noPogo",clipId:"zombie.final.pogo_attack"} : {state:"move.noPogo",clipId:"zombie.final.pogo_walk"};
      }
      if (z?.type === "balloon") {
        if (z.dying) return {state:"die",clipId:"zombie.final.balloon_death"};
        if (isBalloonAir(z) || z.air) return {state:"move.fly",clipId:"zombie.final.balloon_fly"};
        if (z.s7?.balloonLanding || z.s7?.balloonJustPopped) return {state:"pop",clipId:"zombie.final.balloon_pop"};
        return attacking ? {state:"attack.ground",clipId:"zombie.final.balloon_attack"} : {state:"move.ground",clipId:"zombie.final.balloon_walk"};
      }
      if (z?.type === "yeti") {
        if (z.dying) return {state:"die",clipId:"zombie.final.yeti_death"};
        return attacking ? {state:"attack",clipId:"zombie.final.yeti_attack"} : {state:"walk.escape",clipId:"zombie.final.yeti_walk"};
      }
      if (z?.type === "ladder") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const hasLadder=s7ZombieHasArmorName(z,["扶梯"]) && finiteNumber(z.s7?.ladderUsesRemaining,1)>0;
        if (hasLadder) return attacking ? {state:"attack.carry",clipId:"zombie.final.ladder_carry_attack"} : {state:"move.carry",clipId:"zombie.final.ladder_carry"};
        return attacking ? {state:"attack.noLadder",clipId:"zombie.final.ladder_attack"} : {state:"move.noLadder",clipId:"zombie.final.ladder_walk"};
      }
      if (z?.type === "bobsled") {
        if (z.dying) return {state:"die",clipId:"zombie.final.bobsled_death"};
        return attacking ? {state:"attack.member",clipId:"zombie.final.bobsled_attack"} : {state:"move.member",clipId:"zombie.final.bobsled_walk"};
      }
      if (z?.type === "bobsledSled") return {state:"move.sled",clipId:"zombie.final.bobsled_sled"};
      if (z?.type === "bungee") {
        if (z.s7?.bungeePhase === 'grab' || z.s7?.grabPlantId || z.grabbedPlantId) return {state:"grab",clipId:"zombie.final.bungee_grab"};
        if (z.s7?.bungeePhase === 'rise' || z.s7?.rising) return {state:"rise",clipId:"zombie.final.bungee_ascend"};
        return {state:"descend",clipId:"zombie.final.bungee_descend"};
      }
      if (z?.type === "catapult") {
        const throwing=!z.drive&&finiteNumber(z.s7?.catapultThrowUntil,0)>finiteNumber(state?.time,0);
        return throwing ? {state:"attack.throw",clipId:"zombie.final.catapult_throw"} : {state:z.drive?"move.drive":"idle.loaded",clipId:"zombie.final.catapult_drive"};
      }
      if (z?.type === "garg" || z?.type === "giga") {
        const base = z.type === "giga" ? "giga" : "garg";
        if (z.dying) return {state:"die",clipId:`zombie.final.${base}_death`};
        if (z.s7?.gargThrowPhase === 'windup') return {state:"special.throw",clipId:`zombie.final.${base}_throw`};
        if (z.s7?.gargSmashTargetId != null) return {state:"attack.smash",clipId:`zombie.final.${base}_hammer`};
        return {state:"move.walk",clipId:`zombie.final.${base}_walk`};
      }
      if (z?.type === "pole") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if ((z.jumpMove||0)>0 || z.jumping) {
          const initial=Math.max(.01,finiteNumber(z.s7?.poleJumpInitial,finiteNumber(z.jumpMove,1)));
          const ratio=clamp(finiteNumber(z.jumpMove,0)/initial,0,1);
          return ratio>.45 ? {state:"vault.up",clipId:"zombie.b05a.pole.jump"} : {state:"vault.down",clipId:"zombie.b05a.pole.jump2"};
        }
        if (!z.jumped) return {state:"run.withPole",clipId:"zombie.b05a.pole.run"};
        return attacking ? {state:"attack.noPole",clipId:"zombie.b05a.pole.attack"} : {state:"walk.noPole",clipId:"zombie.b05a.pole.walk"};
      }
      if (z?.type === "dancer") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if (finiteNumber(z.s7?.dancerSummonUntil,0)>finiteNumber(state?.time,0)) return {state:"summon",clipId:"zombie.b05a.dancer.summon"};
        if (attacking) return {state:"attack",clipId:"zombie.b05a.dancer.attack"};
        return z.s7?.variant ? {state:"slide",clipId:"zombie.b05a.dancer.slide"} : {state:"dance",clipId:"zombie.b05a.dancer.dance"};
      }
      if (z?.type === "backup") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        return attacking ? {state:"attack",clipId:"zombie.b05a.backup.attack"} : {state:"dance",clipId:"zombie.b05a.backup.dance"};
      }
      if (z?.type === "jack") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if (!z.s7?.boxStolen && finiteNumber(z.jackCd,99)<=.9) return {state:"open",clipId:"zombie.b05a.jack.open"};
        return attacking ? {state:"attack",clipId:"zombie.b05a.jack.attack"} : {state:"walk",clipId:"zombie.b05a.jack.walk"};
      }
      if (z?.type === "flag") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        return attacking ? {state:"attack.jspvz",clipId:"zombie.b04r.flag.attack"} : {state:"move.jspvz",clipId:"zombie.b04r.flag.move"}
      }
      if (z?.type === "screen") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const door=finiteArray(z.armors).find(a=>a&&a.hp>0&&(a.name==="铁门"||a.name==="防爆铁门"||a.name==="射手铁门"));
        if (door) {
          const ratio=finiteNumber(door.hp,0)/finitePositive(door.max??door.maxHp,1);
          const suffix=ratio<=1/3?'.d2':ratio<=2/3?'.d1':'';
          return attacking ? {state:`attack.door${suffix}.jspvz`,clipId:`zombie.b04d.screen.attack${suffix}`} : {state:`move.door${suffix}.jspvz`,clipId:`zombie.b04d.screen.move${suffix}`};
        }
        return attacking ? {state:"attack.noDoor.jspvz",clipId:"zombie.b04r.normal.attack"} : {state:"move.noDoor.jspvz",clipId:"zombie.b04r.normal.move"}
      }
      if (s7B04AIsCommon(z)) {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if (z.type === "cone") return attacking ? {state:"attack.jspvz",clipId:"zombie.b04r.cone.attack"} : {state:"move.jspvz",clipId:"zombie.b04r.cone.move"};
        if (z.type === "bucket") return attacking ? {state:"attack.jspvz",clipId:"zombie.b04r.bucket.attack"} : {state:"move.jspvz",clipId:"zombie.b04r.bucket.move"};
        return attacking ? {state:"attack.jspvz",clipId:"zombie.b04r.normal.attack"} : {state:"move.jspvz",clipId:"zombie.b04r.normal.move"}
      }
      if (z?.type === "bombdoor") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        return attacking ? {state:"attack.cmdBombdoor",clipId:"zombie.b04r.bucket.attack"} : {state:"move.cmdBombdoor",clipId:"zombie.b04r.bucket.move"};
      }
      if (z?.type === "blackolive") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        const hasHelmet = finiteNumber(z.hp,0) > finiteNumber(z.maxHp,1) * 0.5;
        if (hasHelmet) return attacking ? {state:"attack.cmdBlackolive",clipId:"zombie.b05b.football.attack"} : {state:"run.cmdBlackolive",clipId:"zombie.b05b.football.run"};
        return attacking ? {state:"attack.cmdBlackoliveNoHelmet",clipId:"zombie.b05b.football.noHelmetAttack"} : {state:"run.cmdBlackoliveNoHelmet",clipId:"zombie.b05b.football.noHelmetRun"};
      }
      if (z?.type === "polecmd") {
        if (z.s7?.poleCommandPhase === "pacing") return {state:"pacing",clipId:"zombie.pacing"};
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        if ((z.jumpMove||0)>0 || z.jumping) {
          const initial=Math.max(.01,finiteNumber(z.s7?.poleJumpInitial,finiteNumber(z.jumpMove,1)));
          const ratio=clamp(finiteNumber(z.jumpMove,0)/initial,0,1);
          return ratio>.45 ? {state:"vault.up.cmdPolecmd",clipId:"zombie.b05a.polecmd.pole.jump"} : {state:"vault.down.cmdPolecmd",clipId:"zombie.b05a.polecmd.pole.jump2"};
        }
        if (!z.jumped) return {state:"run.withPole.cmdPolecmd",clipId:"zombie.b05a.polecmd.pole.run"};
        return attacking ? {state:"attack.noPole.cmdPolecmd",clipId:"zombie.b05a.polecmd.pole.attack"} : {state:"walk.noPole.cmdPolecmd",clipId:"zombie.b05a.polecmd.pole.walk"};
      }
      if (z?.type === "warflag" || z?.type === "tacticflag") {
        if (z.dying) return {state:"head.drop",clipId:"zombie.b04a.head.drop"};
        return attacking ? {state:"attack.cmdFlag",clipId:"zombie.b04r.flag.attack"} : {state:"move.cmdFlag",clipId:"zombie.b04r.flag.move"};
      }
      if (z.dying) return { state:"dying", clipId:"zombie.stunned" };
      if (finiteNumber(z.freeze, 0) > 0 || finiteNumber(z.stun, 0) > 0) return { state:"stunned", clipId:"zombie.stunned" };
      if (z.air || z.s7?.airborne || z.s7?.jumping || z.s7?.gargThrowPhase === "airborne") return { state:"airborne", clipId:"zombie.airborne" };
      if (z.s7?.gargThrowPhase === "windup" || z.s7?.squashZWindup || z.s7?.newspaperRagePhase === "windup") return { state:"special", clipId:"zombie.attack" };
      if (attacking) return { state:"attack", clipId:"zombie.attack" };
      return { state:"move", clipId:"zombie.move" }
    }

    const _animAliveKeys = new Set();
    function s7AnimationTick() {
      if (!state) return;
      S7_ANIM.stats.ticks++;
      const aliveKeys = _animAliveKeys;
      aliveKeys.clear();
      const timelineVisuals = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE;
      for (const p of finiteArray(state.plants)) {
        if (!p || p.dead) continue;
        if (p.s7 && finiteNumber(p.s7.videoSkillTimer,0)>0) {
          p.s7.videoSkillTimer=Math.max(0,p.s7.videoSkillTimer-S7_ANIMATION_FIXED_DT);
          if (p.s7.videoSkillTimer<=0) p.s7.videoSkillKey=null;
        }
        // In legacy rendering, only pending kernel throws need EventTrack advancement.
        // All other plant timelines are visual-only and are intentionally skipped.
        if (!timelineVisuals && !p.s7?.kernelThrowPending) continue;
        const spec = s7ResolvePlantAnimation(p);
        S7_ANIM.setState("plant", p, spec.state, S7_ANIM.getClip(spec.clipId) ? spec.clipId : "plant.idle");
        S7_ANIM.advance("plant", p, s7PlantAnimationRate(p));
        aliveKeys.add(`plant:${p.id}`)
      }
      for (const z of finiteArray(state.zombies)) {
        if (!z || z.dead) continue;
        // Newspaper bite/rage/detach transitions are gameplay events. Other zombie
        // timelines are visual-only and do not run while the legacy renderer is active.
        if (!timelineVisuals && z.type !== "newspaper") continue;
        const spec = s7ResolveZombieAnimation(z);
        S7_ANIM.setState("zombie", z, spec.state, S7_ANIM.getClip(spec.clipId) ? spec.clipId : "zombie.move");
        S7_ANIM.advance("zombie", z, s7ZombieAnimationRate(z));
        aliveKeys.add(S7_ANIM.runtimeKey ? S7_ANIM.runtimeKey("zombie", z) : `zombie:${z.id}`)
      }
      S7_ANIM.purge(aliveKeys)
    }

    function s7AnimationPose(kind, entity) {
      if (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) return null;
      const snap = S7_ANIM.snapshot(kind, entity);
      return snap?.pose || null
    }

    function s7ApplyCanvasAnimationPose(ctx2d, kind, entity, pivotX, pivotY, cell) {
      const pose = s7AnimationPose(kind, entity);
      if (!pose || !pose.visible) return pose;
      const c = Math.max(1, finiteNumber(cell, 1));
      ctx2d.translate(finiteNumber(pose.x, 0) * c, finiteNumber(pose.y, 0) * c);
      ctx2d.translate(pivotX, pivotY);
      ctx2d.rotate(finiteNumber(pose.rotation, 0));
      ctx2d.scale(Math.max(.05, finiteNumber(pose.scaleX, 1)), Math.max(.05, finiteNumber(pose.scaleY, 1)));
      ctx2d.translate(-pivotX, -pivotY);
      ctx2d.globalAlpha *= Math.max(0, Math.min(1, finiteNumber(pose.opacity, 1)));
      return pose
    }

    function s7DrawLayeredSprite(ctx2d, kind, entity, pivotX, pivotY, cell) {
      if (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) return false;
      const snapshot = S7_ANIM.snapshot(kind, entity);
      const pose = snapshot?.pose || null;
      if (!pose || !pose.visible || !Array.isArray(pose.layers) || !pose.layers.length) return false;
      const c = Math.max(1, finiteNumber(cell, 1));
      let groupScale=1;
      const animState = snapshot?.state || '';
      const bodyLayer=pose.layers.length===1?pose.layers[0]:pose.layers.find(layer=>layer&&layer.visible&&layer.name==='body');
      const mayNormalize=(kind==='plant'||kind==='zombie')&&pose.layers.length<=3&&bodyLayer&&!String(bodyLayer.asset||'').startsWith('corn.');
      if (mayNormalize) {
        const bodyMeta=S7_SPRITES.meta(bodyLayer.asset)||{};
        const visualHeight=typeof s7VisualHeightForMeta==='function'?s7VisualHeightForMeta(bodyMeta):0;
        const basePixelScale=Math.max(.001,finiteNumber(bodyLayer.pixelScale,.01));
        if (visualHeight>0) {
          const targetHeight=kind==='plant'?.72:.76;
          groupScale=clamp(targetHeight/(visualHeight*basePixelScale),.35,3.2);
        }
      }
      let drawn = 0;
      for (const layer of pose.layers) {
        if (!layer || !layer.visible || !(layer.opacity > 0) || !layer.asset) continue;
        let assetId = layer.asset;
        // B02B: NewspaperZombie keeps head/arm/newspaper as independently hideable logical layers.
        if (entity?.type === "newspaper") {
          if (layer.name === "head" && entity.s7?.newsHeadVisible === false) continue;
          // B04R: arm-loss visuals disabled; arm layer always remains visible.
          if (layer.name === "newspaper") {
            const paperArmor = finiteArray(entity.armors).find(a => a && a.hp > 0 && (a.name === "报纸" || a.name === "狂暴报纸"));
            if (!paperArmor || entity.enraged) continue;
            const ratio = clamp(finiteNumber(paperArmor.hp, 0) / finitePositive(paperArmor.max, 1), 0, 1);
            if (ratio <= 1/3 && S7_SPRITES.meta(assetId + ".d2")) assetId += ".d2";
            else if (ratio <= 2/3 && S7_SPRITES.meta(assetId + ".d1")) assetId += ".d1";
          }
        }
        if (layer.name === "armor" && (["cone","bucket","blind"].includes(entity?.type))) {
          const armorName = entity.type === "cone" ? "路障" : entity.type === "blind" ? "盲盒路障" : "铁桶";
          const a=finiteArray(entity.armors).find(q=>q && q.hp>0 && q.name === armorName);
          if (!a) continue;
          const ratio=clamp(finiteNumber(a.hp,0)/finitePositive(a.max,1),0,1);
          if (ratio <= 1/3 && S7_SPRITES.meta(assetId+".d2")) assetId += ".d2";
          else if (ratio <= 2/3 && S7_SPRITES.meta(assetId+".d1")) assetId += ".d1";
        }
        const img = S7_SPRITES.image(assetId);
        if (!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)) continue;
        const meta = S7_SPRITES.meta(assetId) || {};
        const fw = Math.max(1, finiteNumber(meta.frameWidth, img.naturalWidth));
        const fh = Math.max(1, finiteNumber(meta.frameHeight, img.naturalHeight));
        const cols = Math.max(1, Math.floor(finiteNumber(meta.columns, 1)));
        const frameCount = Math.max(1, Math.floor(finiteNumber(meta.frameCount, 1)));
        const fi = Math.max(0, Math.min(frameCount - 1, Math.floor(finiteNumber(layer.frameIndex, 0))));
        const sx = (fi % cols) * fw, sy = Math.floor(fi / cols) * fh;
        const pxScale = Math.max(.001, finiteNumber(layer.pixelScale, .01)) * c * groupScale;
        const scaleBreakdown = typeof s7VisualScaleBreakdown === 'function'
          ? s7VisualScaleBreakdown(kind, entity, snapshot, layer.name)
          : { final:s7VisualScaleMultiplier(kind, entity, layer.name), death:null, overall:1, single:1 };
        const visualScale = Math.max(.05, Math.min(12, finiteNumber(scaleBreakdown?.final, 1)));
        const w = fw * pxScale * visualScale;
        const h = fh * pxScale * visualScale;
        ctx2d.save();
        ctx2d.globalAlpha *= Math.max(0, Math.min(1, finiteNumber(layer.opacity, 1)));
        // Layered entities scale as one connected illustration.  This is size
        // composition only; it never infers or rewrites a frame position.
        const layerOffsetScale=(kind==='plant'||kind==='zombie')?visualScale:1;
        ctx2d.translate(pivotX + finiteNumber(layer.x, 0) * c * layerOffsetScale,
          pivotY + finiteNumber(layer.y, 0) * c * layerOffsetScale);
        ctx2d.rotate(finiteNumber(layer.rotation, 0));
        ctx2d.scale(finiteNumber(layer.scaleX, 1), finiteNumber(layer.scaleY, 1));
        if (frameCount > 1 || fw !== img.naturalWidth || fh !== img.naturalHeight)
          ctx2d.drawImage(img, sx, sy, fw, fh, -w * finiteNumber(layer.pivotX, .5), -h * finiteNumber(layer.pivotY, .5), w, h);
        else ctx2d.drawImage(img, -w * finiteNumber(layer.pivotX, .5), -h * finiteNumber(layer.pivotY, .5), w, h);
        ctx2d.restore();
        drawn++
      }
      if (kind === 'zombie' && entity?.type === 'ducky' && animState === 'attack.water') {
        const headImg = S7_SPRITES.image('zombie.planthead.head.peaz');
        if (headImg && headImg.complete && headImg.naturalWidth > 0) {
          const hs = c * 0.28;
          ctx2d.save();
          ctx2d.globalAlpha *= 0.92;
          ctx2d.drawImage(headImg, -hs * 0.5, -hs * 0.95, hs, hs);
          ctx2d.restore();
          drawn++
        }
      }
      return drawn > 0
    }

    function s7DrawSpriteAsset(ctx2d, assetId, x, y, cell, opt = {}) {
      const img = S7_SPRITES.image(assetId);
      if (!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)) return false;
      const meta=S7_SPRITES.meta(assetId)||{};
      const fw=Math.max(1,finiteNumber(meta.frameWidth,img.naturalWidth));
      const fh=Math.max(1,finiteNumber(meta.frameHeight,img.naturalHeight));
      const cols=Math.max(1,Math.floor(finiteNumber(meta.columns,1)));
      const count=Math.max(1,Math.floor(finiteNumber(meta.frameCount,1)));
      const hasFrames=count>1&&fw<=img.naturalWidth&&fh<=img.naturalHeight;
      const fi=hasFrames?(((Math.floor(finiteNumber(opt.frameIndex,0))%count)+count)%count):0;
      const sx=hasFrames?(fi%cols)*fw:0,sy=hasFrames?Math.floor(fi/cols)*fh:0;
      const sw=hasFrames?fw:img.naturalWidth,sh=hasFrames?fh:img.naturalHeight;
      const scale = Math.max(.001, finiteNumber(opt.pixelScale, .01)) * Math.max(1, finiteNumber(cell, 1));
      const w = sw * scale * Math.max(.001, finiteNumber(opt.scaleX, finiteNumber(opt.scale, 1)));
      const h = sh * scale * Math.max(.001, finiteNumber(opt.scaleY, finiteNumber(opt.scale, 1)));
      ctx2d.save();
      ctx2d.globalAlpha *= Math.max(0, Math.min(1, finiteNumber(opt.opacity, 1)));
      ctx2d.translate(x, y);
      ctx2d.rotate(finiteNumber(opt.rotation, 0));
      if(hasFrames) ctx2d.drawImage(img,sx,sy,sw,sh,-w*finiteNumber(opt.pivotX,.5),-h*finiteNumber(opt.pivotY,.5),w,h);
      else ctx2d.drawImage(img, -w * finiteNumber(opt.pivotX, .5), -h * finiteNumber(opt.pivotY, .5), w, h);
      ctx2d.restore();
      return true
    }

    function s7AnimationModeLabel() {
      return s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE ? "动画：时间轴 V" : "动画：旧版 V"
    }

    function updateS7AnimationModeButton() {
      const label = s7AnimationModeLabel();
      const active = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE;
      const btn = document.getElementById("animModeBtn");
      if (btn) { btn.textContent = label; btn.classList.toggle("primary", active) }
      const battleBtn = document.getElementById("battleAnimBtn");
      if (battleBtn) { battleBtn.textContent = label; battleBtn.classList.toggle("primary", active) }
    }

    function updateEndModeButton() {
      const btn = document.getElementById("endModeBtn");
      if (!btn) return;
      const isAllDead = !state || state.endMode === "allDead";
      btn.textContent = isAllDead ? "结束条件：全灭 U" : "结束条件：剩1路 U";
      btn.classList.toggle("primary", !isAllDead)
    }

    function s7LegacyEventRuntimeKeys() {
      const keep = new Set();
      if (!state) return keep;
      for (const p of finiteArray(state.plants)) {
        if (p && !p.dead && p.s7?.kernelThrowPending) keep.add(S7_ANIM.runtimeKey("plant", p))
      }
      for (const z of finiteArray(state.zombies)) {
        if (z && !z.dead && z.type === "newspaper") keep.add(S7_ANIM.runtimeKey("zombie", z))
      }
      return keep
    }

    function s7SetAnimationRenderMode(mode, opt = {}) {
      const next = mode === S7_ANIMATION_RENDER_MODES.TIMELINE ? S7_ANIMATION_RENDER_MODES.TIMELINE : S7_ANIMATION_RENDER_MODES.LEGACY;
      const previous = s7AnimationRenderMode;
      s7AnimationRenderMode = next;
      if (previous !== next && next === S7_ANIMATION_RENDER_MODES.LEGACY) {
        // Do not wait for the next logic tick: a user may switch modes while paused.
        // Retain only runtimes whose EventTrack still drives combat behavior.
        S7_ANIM.purge(s7LegacyEventRuntimeKeys());
        S7_SPRITES.releaseImages?.();
        S7_TIMELINE_THEME.release?.()
      }
      try { localStorage.setItem(S7_ANIMATION_STORAGE_KEY, next) } catch (_) {}
      updateS7AnimationModeButton();
      if (!opt.silent) addEffect?.(2, 4.5, next === "timeline" ? "时间轴动画 ON" : "旧版绘制 ON", next === "timeline" ? "#38bdf8" : "#cbd5e1", .8);
      if (!opt.noBroadcast && !QUAD_CHILD_MODE) {
        document.querySelectorAll(".quadBoard iframe").forEach(frame => {
          try { frame.contentWindow?.postMessage({ type:"quadAnimMode", mode:next }, "*") } catch (_) {}
        })
      }
      return next
    }

    function toggleS7AnimationRenderMode() {
      return s7SetAnimationRenderMode(s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE ? S7_ANIMATION_RENDER_MODES.LEGACY : S7_ANIMATION_RENDER_MODES.TIMELINE)
    }

    // Public bridge: later B02/B04 clips and JSPVZ-imported frame sequences register here.
    window.S7Animation = Object.freeze({
      version: S7_ANIMATION_VERSION,
      fixedDt: S7_ANIMATION_FIXED_DT,
      fixedFps: 1 / S7_ANIMATION_FIXED_DT,
      engine: S7_ANIM,
      registerClip: def => S7_ANIM.registerClip(def),
      registerJspvzSequence: s7RegisterJspvzSequence,
      play(kind, entity, stateName, clipId, opt) { return S7_ANIM.setState(kind, entity, stateName, clipId, opt) },
      request(entity, stateName, clipId) {
        if (!entity) return false;
        entity.s7 = entity.s7 || {};
        entity.s7.animState = stateName;
        entity.s7.animClip = clipId || "";
        return true
      },
      clearRequest(entity) {
        if (!entity?.s7) return false;
        delete entity.s7.animState;
        delete entity.s7.animClip;
        return true
      },
      get mode() { return s7AnimationRenderMode },
      setMode: s7SetAnimationRenderMode,
      toggleMode: toggleS7AnimationRenderMode,
      selfTest: () => S7_ANIM.selfTest(),
      stats: S7_ANIM.stats,
      sprites: S7_SPRITES,
      audio: S7_AUDIO,
      registerSpriteAsset: (id, src, opt) => S7_SPRITES.register(id, src, opt),
      registerAudioAsset: (id, src, opt) => S7_AUDIO.register(id, src, opt)
    });

    window.S7B02A = Object.freeze({
      selfTest() {
        const result = {ok:false, clips:{}, assets:0, rate2Events:0, rate05Events:0, timing:{}, projectileByRate:{}};
        try {
          for (const id of ["plant.kernel.idle","plant.kernel.throw.kernel","plant.kernel.throw.butter","plant.kernel.throw.bigButter","plant.kernel.throw.cob"]) {
            const clip = S7_ANIM.getClip(id);
            result.clips[id] = !!clip && (id === "plant.kernel.idle" || (clip.events || []).some(ev => ev.type === "projectile_spawn"));
          }
          result.assets = [...S7_SPRITES.assets.keys()].filter(k => k.startsWith("corn.")).length;
          const run = rate => {
            const fake = {id:`__b02a_${rate}_${Math.random()}`,key:"__test__",_s7SelfTest:true,s7:{}};
            const before = S7_ANIM.stats.events;
            S7_ANIM.setState("plant", fake, "probe", "plant.kernel.throw.kernel", {restart:true});
            let guard = 0;
            while (!S7_ANIM.snapshot("plant", fake)?.completed && guard++ < 200) S7_ANIM.advance("plant", fake, rate);
            const delta = S7_ANIM.stats.events - before;
            S7_ANIM.runtime.delete(S7_ANIM.runtimeKey("plant", fake));
            return delta
          };
          result.rate2Events = run(2);
          result.rate05Events = run(.5);
          result.timing.normalLead = s7KernelWindupLeadCd({s7:{}}, 1);
          result.timing.slowLead = s7KernelWindupLeadCd({slow:1,s7:{}}, .5);
          result.timing.buffLead = s7KernelWindupLeadCd({buff:1,s7:{}}, 1);
          const timingOk = Math.abs(result.timing.normalLead - .24) < 1e-9 && Math.abs(result.timing.slowLead - .26) < 1e-9 && Math.abs(result.timing.buffLead - .12) < 1e-9;
          const oldState = state, oldUid = uid;
          try {
            const projectileRun = rate => {
              const z = {id:991,row:0,x:5,dead:false,dying:false,friendly:false,hp:100,maxHp:100,s7:{}};
              const p = {id:`__b02a_projectile_${rate}`,key:"kernel",row:0,col:0,dead:false,cd:0,slow:0,buff:0,s7:{level:0,
                kernelThrowPending:{kind:"kernel",targetId:z.id,targetX:z.x,targetRow:z.row,level:0,bounceCount:0},
                kernelThrowReleased:false,kernelAnimStats:{starts:1,events:0,projectiles:0}}};
              state = {frame:0,time:0,bullets:[],zombies:[z]};
              S7_ANIM.setState("plant", p, "kernel_throw_kernel", "plant.kernel.throw.kernel", {restart:true});
              let guard = 0;
              while (!S7_ANIM.snapshot("plant", p)?.completed && guard++ < 200) {
                state.frame++; state.time += S7_ANIMATION_FIXED_DT;
                S7_ANIM.advance("plant", p, rate)
              }
              const created = state.bullets.length;
              S7_ANIM.runtime.delete(S7_ANIM.runtimeKey("plant", p));
              return created
            };
            result.projectileByRate.normal = projectileRun(1);
            result.projectileByRate.fast = projectileRun(2);
            result.projectileByRate.slow = projectileRun(.5)
          } finally { state = oldState; uid = oldUid }
          const projectileOk = Object.values(result.projectileByRate).every(v => v === 1);
          result.ok = Object.values(result.clips).every(Boolean) && result.assets >= 22 && result.rate2Events === 3 && result.rate05Events === 3 && timingOk && projectileOk;
        } catch (err) { result.error = String(err?.message || err) }
        return result
      }
    });

    window.S7B02B = Object.freeze({
      selfTest() {
        const required=["zombie.newspaper.walk.paper","zombie.newspaper.attack.paper","zombie.newspaper.paper.break","zombie.newspaper.transition.invuln","zombie.newspaper.run.rage","zombie.newspaper.attack.rage","zombie.newspaper.walk.lostHead","zombie.newspaper.attack.lostHead","zombie.newspaper.die","zombie.newspaper.boomDie","zombie.newspaper.ashDie"];
        const result={ok:false,clips:{},assets:0,cornAssets:0,breakEvents:0,coldBites:0,normalBites:0,frozenBites:0,rage2xBites:0,factory:null};
        try {
          for(const id of required) result.clips[id]=!!S7_ANIM.getClip(id);
          result.assets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("news.")).length;
          result.cornAssets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("corn.")).length;
          const breakClip=S7_ANIM.getClip("zombie.newspaper.paper.break");
          result.breakEvents=breakClip?.events?.length||0;
          const countBites=rate=>{
            const fake={id:`__b02b_${rate}_${Math.random()}`,type:"newspaper",_s7SelfTest:true,s7:{}};
            const before=S7_ANIM.stats.events;
            S7_ANIM.setState("zombie",fake,"probe","zombie.newspaper.attack.rage",{restart:true});
            for(let i=0;i<25;i++) S7_ANIM.advance("zombie",fake,rate);
            const n=S7_ANIM.stats.events-before;
            S7_ANIM.runtime.delete(S7_ANIM.runtimeKey("zombie",fake)); return n
          };
          result.normalBites=countBites(1); result.coldBites=countBites(.5); result.frozenBites=countBites(0); result.rage2xBites=countBites(2);
          const probe=makeZombie("newspaper",2,8,{variant:false});
          result.factory={hp:probe.hp,armor:probe.armors?.[0]?.hp||0,head:probe.s7?.newsHeadVisible,arm:probe.s7?.newsArmVisible};
          const oldState=state, oldUid=uid, oldMode=s7AnimationRenderMode;
          try {
            const z=makeZombie("newspaper",2,6,{variant:false});
            z.armors=[];
            state={frame:0,time:0,zombies:[z],plants:[],bullets:[],effects:[],teams:Array.from({length:ROWS},()=>({alive:true,damage:0})),s7:{detachedParts:[]}};
            beginNewspaperRage(z,{});
            const phase0=z.s7.newspaperRagePhase, defense0=z.s7.newspaperRageDefense;
            for(let i=0;i<45;i++) {
              state.frame++; state.time+=S7_ANIMATION_FIXED_DT;
              const spec=s7ResolveZombieAnimation(z);
              S7_ANIM.setState("zombie",z,spec.state,spec.clipId);
              S7_ANIM.advance("zombie",z,s7ZombieAnimationRate(z));
              s7UpdateDetachedParts(S7_ANIMATION_FIXED_DT)
            }
            result.phaseFlow={start:phase0,startDefense:defense0,end:z.s7.newspaperRagePhase,endDefense:z.s7.newspaperRageDefense,
              defenseSynced:!!z.s7.newspaperDefenseSyncedByEvent,newspaperDrops:state.s7.detachedParts.filter(q=>q.kind==="newspaper").length};
            const phaseBeforeMode=z.s7.newspaperRagePhase;
            s7SetAnimationRenderMode("legacy",{silent:true,noBroadcast:true});
            s7SetAnimationRenderMode("timeline",{silent:true,noBroadcast:true});
            result.modeStable=phaseBeforeMode===z.s7.newspaperRagePhase;
            const x0=z.x; s7NewspaperDropArm(z); s7NewspaperDropHead(z);
            for(let i=0;i<30;i++) s7UpdateDetachedParts(S7_ANIMATION_FIXED_DT);
            result.dropFlow={head:z.s7.newsHeadVisible,arm:z.s7.newsArmVisible,count:state.s7.detachedParts.length,
              xStable:state.s7.detachedParts.every(q=>Math.abs(q.x-x0)<1e-9),landed:state.s7.detachedParts.filter(q=>q.kind!=="newspaper").every(q=>q.landed||q.ttl<=0)};
          } finally {
            s7AnimationRenderMode=oldMode; state=oldState; uid=oldUid;
            S7_ANIM.runtime.delete(S7_ANIM.runtimeKey("zombie",probe))
          }
          result.ok=Object.values(result.clips).every(Boolean)&&result.assets>=29&&result.cornAssets>=22&&result.breakEvents>=4&&
            result.normalBites===25&&result.coldBites>0&&result.coldBites<result.normalBites&&result.frozenBites===0&&result.rage2xBites>result.normalBites&&
            result.factory.hp===600&&result.factory.armor===1200&&result.factory.head===true&&result.factory.arm===true&&
            result.phaseFlow?.start==="paper_break"&&result.phaseFlow?.end==="sprinting"&&result.phaseFlow?.endDefense==null&&result.phaseFlow?.defenseSynced&&result.phaseFlow?.newspaperDrops===1&&
            result.modeStable===true&&result.dropFlow?.head===false&&result.dropFlow?.arm===false&&result.dropFlow?.xStable===true
        } catch(err){result.error=String(err?.message||err)}
        return result
      },
      dropArm:z=>s7NewspaperDropArm(z), dropHead:z=>s7NewspaperDropHead(z),
      spawnPart:(z,kind)=>s7SpawnNewspaperDetached(z,kind)
    });

    window.S7B03A = Object.freeze({
      selfTest() {
        const result={ok:false,defaults:{},sleep:{},assets:0};
        try {
          for (const [key,clipId] of Object.entries(S7_B03A_DEFAULT_CLIPS)) {
            const clip=S7_ANIM.getClip(clipId);
            result.defaults[key]=!!(clip && clip.layers?.length && clip.layers[0].tracks?.frameIndex?.length)
          }
          for (const [key,clipId] of Object.entries(S7_B03A_SLEEP_CLIPS)) {
            const clip=S7_ANIM.getClip(clipId);
            result.sleep[key]=!!(clip && clip.layers?.length && clip.layers[0].tracks?.frameIndex?.length)
          }
          result.assets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("plant.b03a.asset.")).length;
          result.ok=Object.keys(result.defaults).length===13 && Object.values(result.defaults).every(Boolean) &&
            Object.keys(result.sleep).length===4 && Object.values(result.sleep).every(Boolean) && result.assets===17
        } catch(err) { result.error=String(err?.message||err) }
        return result
      }
    });

    window.S7B03B = Object.freeze({
      selfTest() {
        const result={ok:false,assets:0,clips:{},resolve:{}};
        try {
          const ids=[
            "plant.b03b.squash.idle","plant.b03b.squash.targeting","plant.b03b.squash.air","plant.b03b.squash.impact",
            "plant.b03b.threepeater.idle","plant.b03b.threepeater.fire","plant.b03b.threepeater.ult",
            "plant.b03b.blover.idle","plant.b03b.blover.gust",
            "plant.b03b.gatling.idle","plant.b03b.gatling.fire","plant.b03b.gatling.ult"
          ];
          for(const id of ids) { const c=S7_ANIM.getClip(id); result.clips[id]=!!(c&&c.layers?.length&&c.layers[0].tracks?.frameIndex?.length) }
          result.assets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("plant.b03b.asset.")).length;
          const fake=k=>({key:k,dead:false,slow:0,buff:0,s7:{}});
          let q=fake("squash"); q.s7.squashState="attacking";q.s7.squashAttackSub="fall"; result.resolve.squash=s7ResolvePlantAnimation(q).clipId;
          q=fake("threepeater");q.s7.ultTimer=1; result.resolve.threepeater=s7ResolvePlantAnimation(q).clipId;
          q=fake("blover");q.s7.b03bGustTimer=1; result.resolve.blover=s7ResolvePlantAnimation(q).clipId;
          q=fake("gatling");q.s7.b03bUltTimer=1; result.resolve.gatling=s7ResolvePlantAnimation(q).clipId;
          result.ok=result.assets===5&&Object.values(result.clips).every(Boolean)&&result.resolve.squash==="plant.b03b.squash.impact"&&
            result.resolve.threepeater==="plant.b03b.threepeater.ult"&&result.resolve.blover==="plant.b03b.blover.gust"&&result.resolve.gatling==="plant.b03b.gatling.ult"
        } catch(err) { result.error=String(err?.message||err) }
        return result
      }
    });

    window.S7B03C = Object.freeze({
      selfTest() {
        const result={ok:false,assets:0,defaults:{},sleep:{},states:{}};
        try {
          result.assets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("plant.b03c.asset.")).length;
          for(const [k,id] of Object.entries(S7_B03C_DEFAULT_CLIPS)) result.defaults[k]=!!S7_ANIM.getClip(id);
          for(const [k,id] of Object.entries(S7_B03C_SLEEP_CLIPS)) result.sleep[k]=!!S7_ANIM.getClip(id);
          for(const [k,id] of Object.entries(S7_B03C_STATE_CLIPS)) result.states[k]=!!S7_ANIM.getClip(id);
          const f=(key,s7={},hp=300,maxHp=300)=>({key,dead:false,slow:0,buff:0,hp,maxHp,s7});
          result.resolve={
            chomper:s7ResolvePlantAnimation(f('chomper',{chomperPhase:'chew'})).clipId,
            garlic:s7ResolvePlantAnimation(f('garlic',{},20,300)).clipId,
            scaredy:s7ResolvePlantAnimation(f('scaredy',{hiding:true})).clipId,
            sunflower:s7ResolvePlantAnimation(f('sunflower')).clipId
          };
          result.ok=result.assets===19&&Object.keys(result.defaults).length===10&&Object.values(result.defaults).every(Boolean)&&
            Object.keys(result.sleep).length===4&&Object.values(result.sleep).every(Boolean)&&Object.values(result.states).every(Boolean)&&
            result.resolve.chomper===S7_B03C_STATE_CLIPS.chomperDigest&&result.resolve.garlic===S7_B03C_STATE_CLIPS.garlicD3&&
            result.resolve.scaredy===S7_B03C_STATE_CLIPS.scaredyCry&&result.resolve.sunflower===S7_B03C_DEFAULT_CLIPS.sunflower
        } catch(err) { result.error=String(err?.message||err) }
        return result
      }
    });

    window.S7B04A = Object.freeze({
      selfTest() {
        const required=["zombie.b04a.move.full","zombie.b04a.attack.full","zombie.b04a.head.drop","zombie.b04a.cone.move.full","zombie.b04a.cone.attack.full"];
        const clips=Object.fromEntries(required.map(id=>[id,!!S7_ANIM.getClip(id)]));
        const assets=[...S7_SPRITES.assets.keys()].filter(k=>k.startsWith("zombie.b04a.asset."));
        const oldState=state;
        let resolve={};
        try {
          state={plants:[],zombies:[],bullets:[],effects:[],teams:Array.from({length:ROWS},()=>({alive:true,damage:0})),s7:{}};
          const normal={id:"__b04n",type:"normal",hp:270,maxHp:270,crit:90,row:0,x:5,s7:{},armors:[]};
          const half={...normal,id:"__b04h",hp:120,s7:{}};
          const cone={...normal,id:"__b04c",type:"cone",armors:[{name:"路障",hp:150,max:300}]};
          resolve.normal=s7ResolveZombieAnimation(normal).clipId;
          resolve.half=s7ResolveZombieAnimation(half).clipId;
          resolve.cone=s7ResolveZombieAnimation(cone).clipId;
        } finally { state=oldState }
        return {ok:Object.values(clips).every(Boolean)&&assets.length>=12&&resolve.normal==="zombie.b04r.normal.move"&&resolve.half==="zombie.b04r.normal.move"&&resolve.cone==="zombie.b04r.cone.move",clips,assetCount:assets.length,resolve}
      }
    });

    window.S7B04B = Object.freeze({selfTest(){
      const ids=["zombie.b04b.flag.move.full","zombie.b04b.flag.attack.full","zombie.b04b.flag.head.drop"];
      const clips=Object.fromEntries(ids.map(id=>[id,!!S7_ANIM.getClip(id)])); const old=state; let resolve={};
      try{state={plants:[],zombies:[],bullets:[],effects:[],teams:Array.from({length:ROWS},()=>({alive:true,damage:0})),s7:{}};
        const z={id:"__flag",type:"flag",hp:270,maxHp:270,crit:90,row:0,x:5,s7:{},armors:[]}; resolve.full=s7ResolveZombieAnimation(z).clipId; z.hp=120;resolve.half=s7ResolveZombieAnimation(z).clipId;}finally{state=old}
      return {ok:Object.values(clips).every(Boolean)&&resolve.full==="zombie.b04r.flag.move"&&resolve.half==="zombie.b04r.flag.move",clips,resolve,assets:Object.keys(S7_B04B_FLAG_MANIFEST).length}
    }});

    function renderSafeRow(row) {
      return Number.isFinite(row) && row > -2 && row < ROWS + 2
    }

    function renderSafeX(x) {
      return Number.isFinite(x) && x > -4 && x < COLS + 5
    }

    function rememberRenderError(err, label = "draw") {
      if (!state) return;
      const msg = err?.message || String(err);
      state.s7 = state.s7 || {};
      const now = state.time || 0;
      if (state.s7.lastRenderErrorMsg !== msg || now - (state.s7.lastRenderErrorAt || -999) > 2) {
        state.s7.lastRenderErrorMsg = msg;
        state.s7.lastRenderErrorAt = now;
        console.error("render error", label, err);
        log("渲染异常已自动跳过：" + msg)
      }
    }

    let _lastSanitizeState = null;
    let _lastSanitizeFrame = -1;
    function sanitizeRenderState(force = false) {
      if (!state) return;
      const frame = Math.floor(finiteNumber(state.frame, 0));
      if (!force && _lastSanitizeState === state && _lastSanitizeFrame === frame) return;
      _lastSanitizeState = state;
      _lastSanitizeFrame = frame;
      state.plants = compactArrayInPlace(finiteArray(state.plants), p => p && !p.dead && renderSafeRow(p.row) && Number.isFinite(p.col) && p.col > -2 && p.col < COLS + 2);
      state.zombies = compactArrayInPlace(finiteArray(state.zombies), z => z && !z.dead && renderSafeRow(z.row) && renderSafeX(z.x));
      for (let i = 0; i < state.zombies.length; i++) {
        const z = state.zombies[i];
        z.flags = z.flags || {};
        if (!Array.isArray(z.armors)) z.armors = [];
        z.hp = finiteNumber(z.hp, 0);
        z.maxHp = finitePositive(z.maxHp, Math.max(1, z.hp || 1));
        z.x = finiteNumber(z.x, DAMAGE_BOUNDARY_X);
        z.row = Math.max(0, Math.min(ROWS - 1, Math.round(finiteNumber(z.row, 0))))
      }
      state.bullets = compactArrayInPlace(finiteArray(state.bullets), b => b && !b.dead && renderSafeX(b.x) && Number.isFinite(b.y) && b.y > -3 && b.y < ROWS + 3 && finitePositive(b.life, 0) > 0);
      trimBulletsForPerformance();
      state.effects = compactArrayInPlace(finiteArray(state.effects), e => e && renderSafeX(e.x) && renderSafeRow(e.row) && finitePositive(e.ttl, 0) > 0);
      if (state.effects.length > PERF.MAX_EFFECTS) state.effects.splice(0, state.effects.length - PERF.MAX_EFFECTS);
      state.gridEffects = compactArrayInPlace(finiteArray(state.gridEffects), e => e && renderSafeRow(e.row) && Number.isFinite(e.col) && e.col >= 0 && e.col < COLS && finitePositive(e.ttl, 0) > 0);
      if (state.gridEffects.length > PERF.MAX_GRID_EFFECTS) state.gridEffects.splice(0, state.gridEffects.length - PERF.MAX_GRID_EFFECTS);
      state.iceTrails = compactArrayInPlace(finiteArray(state.iceTrails), t => t && renderSafeRow(t.row) && Number.isFinite(t.col) && t.col >= 0 && t.col < COLS && finitePositive(t.ttl, 0) > 0);
      if (state.iceTrails.length > PERF.MAX_ICE_TRAILS) state.iceTrails.splice(0, state.iceTrails.length - PERF.MAX_ICE_TRAILS);
      state.poisonPits = compactArrayInPlace(finiteArray(state.poisonPits), p => p && renderSafeRow(p.row) && Number.isFinite(p.col) && p.col >= 0 && p.col < PLANT_COLS && finitePositive(p.ttl, 0) > 0);
      if (state.poisonPits.length > PERF.MAX_POISON_PITS) state.poisonPits.splice(0, state.poisonPits.length - PERF.MAX_POISON_PITS);
      state.shadowSpikes = compactArrayInPlace(finiteArray(state.shadowSpikes), s => s && renderSafeRow(s.row) && renderSafeX(s.x) && finitePositive(s.hp, 0) > 0);
      if (state.shadowSpikes.length > PERF.MAX_SHADOW_SPIKES) state.shadowSpikes.splice(0, state.shadowSpikes.length - PERF.MAX_SHADOW_SPIKES);
      if (state.s7) {
        state.s7.turrets = compactArrayInPlace(finiteArray(state.s7.turrets), t => t && renderSafeRow(t.row) && renderSafeX(t.x) && Math.floor(finiteNumber(t.roundsLeft, 0)) > 0);
        if (state.s7.turrets.length > PERF.MAX_TURRETS) state.s7.turrets.splice(0, state.s7.turrets.length - PERF.MAX_TURRETS);
        state.s7.sunflowerSuns = compactArrayInPlace(finiteArray(state.s7.sunflowerSuns), token => token && !token.dead && renderSafeRow(token.row) && renderSafeX(token.startX));
        if (state.s7.sunflowerSuns.length > PERF.MAX_SUNFLOWER_SUNS) state.s7.sunflowerSuns.splice(0, state.s7.sunflowerSuns.length - PERF.MAX_SUNFLOWER_SUNS)
      }
    }

    function safeDrawOne(label, item, fn, ...args) {
      try {
        if (args.length) fn(...args);
        else fn(item)
      } catch (err) {
        if (item && typeof item === "object") item.dead = true;
        rememberRenderError(err, label)
      }
    }
    const SPEEDS = {
      ordinary: .2347,
      ordinarySlow: .1402,
      pole: .4115,
      poleJump: .5556,
      football: .3125,
      jack: .4219,
      ladder: .3384,
      pogo: .5076,
      snorkel: .25,
      dolphin: 1.1364,
      dolphinSlow: .6423,
      dancer: .905,
      zomboni1: .2985,
      zomboni2: .2494,
      zomboni3: .2055,
      zomboni4: .1618,
      garg: .2358,
      gargSlow: .1338,
      diggerUnder: .6627,
      diggerUp: .0833,
      balloon: .4167,
      balloonSlow: .3521,
      flee: .5
    };
    const TIMES = {
      poleJumpLand: 1.8,
      dancerNaturalSummon: 3.43,
      dancerTouchSummon: .42,
      dancerSpawnRise: 1.5,
      snorkelDive: 1.81,
      dolphinJump: 1.37,
      dolphinLand: 2.31,
      diggerIceable: 13.58,
      diggerBiteHouse: 16.16,
      catapultReady: 4.74,
      catapultThrow: .73,
      gargThrow: 1.05,
      gargHammer: 1.34,
      pogoJumpInterval: .8,
      pogoVariantCharge: 1.5
    };
    const POLE_COMMAND_RULE = Object.freeze({
      pacingSeconds: 4,
      sprintInitialMultiplier: 1.3,
      sprintGrowthPerSecond: 1.1,
      sprintSpeedCapBeforeGlobalScale: 3 / .9,
      jumpInitialDistance: 2,
      jumpGrowthPerSecond: .05,
      jumpDistanceCap: 2.5,
      tallnutVaultThreshold: 1
    });

    window.S7B04C = Object.freeze({selfTest(){
      const ids=["zombie.b04c.bucket.move.full","zombie.b04c.bucket.attack.full"];
      const clips=Object.fromEntries(ids.map(id=>[id,!!S7_ANIM.getClip(id)]));
      const old=state; let resolve={};
      try{ state={plants:[],zombies:[],bullets:[],teams:[]}; const z={id:"__bucket",type:"bucket",hp:270,maxHp:270,crit:90,row:0,x:5,s7:{},armors:[{name:"铁桶",hp:600,max:600}]}; resolve.full=s7ResolveZombieAnimation(z).clipId; z.hp=120; resolve.half=s7ResolveZombieAnimation(z).clipId; } finally {state=old}
      return {ok:Object.values(clips).every(Boolean)&&resolve.full==="zombie.b04r.bucket.move"&&resolve.half==="zombie.b04r.bucket.move",clips,resolve,assets:Object.keys(S7_B04C_BUCKET_MANIFEST).length,sealedTop:true};
    }});
    const SPEED_PROFILES = {
      ordinary: {
        min: .1402,
        max: .2347
      },
      bombdoor: {
        min: .2103,
        max: .35205
      },
      warflag: {
        min: .02804,
        max: .04694
      },
      pole: {
        min: .4115,
        max: .4115
      },
      football: {
        min: .3125,
        max: .3125
      },
      jack: {
        min: .4219,
        max: .4219
      },
      ladder: {
        min: .3807,
        max: .3807
      },
      pogo: {
        min: .5076,
        max: .5076
      },
      snorkel: {
        min: .1075,
        max: .25
      },
      dolphin: {
        min: .6423,
        max: 1.1364
      },
      dancer: {
        min: .905,
        max: .905
      },
      garg: {
        min: .1338,
        max: .2358
      },
      diggerUnder: {
        min: .6627,
        max: .6627
      },
      diggerUp: {
        min: .0833,
        max: .0833
      },
      balloon: {
        min: .3521,
        max: .4167
      }
    };
    const SPAWN_DIST = {
      normal: 1.141,
      pole: 1.477,
      football: .846,
      dancer: [.778, 1.231],
      snorkel: .238,
      zomboni: .101,
      dolphin: 1.477,
      jack: .667,
      ladder: .624,
      digger: 9,
      balloon: .983,
      garg: .533
    };
