"use strict";

    /* ============================================================================
     * B04A common humanoid zombie sprite bridge.
     * Source: user-approved common 7x6 zombie sheet + independent cone armor states.
     * ========================================================================== */
    const S7_B04A_MANIFEST = {"body.walk":{"file":"body.walk.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"body.attack":{"file":"body.attack.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"body.head_drop":{"file":"body.head_drop.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"body.die":{"file":"body.die.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"body.ash":{"file":"body.ash.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.walk":{"file":"armor.cone.walk.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.walk.d1":{"file":"armor.cone.walk.d1.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.walk.d2":{"file":"armor.cone.walk.d2.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.attack":{"file":"armor.cone.attack.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.attack.d1":{"file":"armor.cone.attack.d1.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.cone.attack.d2":{"file":"armor.cone.attack.d2.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"detached.head":{"file":"detached.head.png","frameWidth":48,"frameHeight":47,"columns":1,"frameCount":1,"durations":[100]}};
    const S7_B04A_COMMON_TYPES = new Set(["normal","cone","bucket"]);

    function s7RegisterB04ACommonZombies() {
      const root='./assets/zombies_b04a/';
      for(const [key,m] of Object.entries(S7_B04A_MANIFEST))
        S7_SPRITES.register(`zombie.b04a.asset.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      function layer(asset,z=0) {
        const m=S7_B04A_MANIFEST[asset];
        return {asset:`zombie.b04a.asset.${asset}`,z,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,15,true)}}
      }
      function bodyClip(id,asset,opt={}) {
        const m=S7_B04A_MANIFEST[asset];
        const frames=opt.frames||15;
        S7_ANIM.registerClip({id,frames,loop:opt.loop!==false,source:{kind:'approved-zombie-sheet',asset},
          layers:{body:{asset:`zombie.b04a.asset.${asset}`,z:0,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,opt.loop!==false)}}}});
      }
      function coneClip(id,bodyAsset,armorAsset,opt={}) {
        const b=S7_B04A_MANIFEST[bodyAsset], a=S7_B04A_MANIFEST[armorAsset];
        const frames=opt.frames||15;
        S7_ANIM.registerClip({id,frames,loop:opt.loop!==false,source:{kind:'approved-body+armor',asset:bodyAsset},layers:{
          body:{asset:`zombie.b04a.asset.${bodyAsset}`,z:0,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(b.durations,frames,opt.loop!==false)}},
          armor:{asset:`zombie.b04a.asset.${armorAsset}`,z:2,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(a.durations,frames,opt.loop!==false)}}
        }});
      }
      bodyClip('zombie.b04a.move.full','body.walk');
      bodyClip('zombie.b04a.attack.full','body.attack');
      bodyClip('zombie.b04a.head.drop','body.head_drop',{loop:false,frames:15});
      bodyClip('zombie.b04a.die','body.die',{loop:false,frames:15});
      bodyClip('zombie.b04a.ash','body.ash',{loop:false,frames:15});
      coneClip('zombie.b04a.cone.move.full','body.walk','armor.cone.walk');
      coneClip('zombie.b04a.cone.attack.full','body.attack','armor.cone.attack');
      // Register damage aliases. Renderer swaps to .d1/.d2 while preserving frame timing.
      for(const motion of ['walk','attack']) {
        const base=`zombie.b04a.asset.armor.cone.${motion}`;
        for(const suffix of ['.d1','.d2']) {
          const m=S7_B04A_MANIFEST[`armor.cone.${motion}${suffix}`];
          S7_SPRITES.register(base+suffix,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount})
        }
      }
    }
    s7RegisterB04ACommonZombies();
    S7_SPRITES.register("zombie.b04a.detached.cone","./assets/zombies_b04a/detached.cone.png",{frameWidth:78,frameHeight:131,columns:1,frameCount:1});

    const S7_B04B_FLAG_MANIFEST = {"walk":{"file":"flag.walk.png","frameWidth":210,"frameHeight":210,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"attack":{"file":"flag.attack.png","frameWidth":210,"frameHeight":210,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"head_drop":{"file":"flag.head_drop.png","frameWidth":210,"frameHeight":210,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"die":{"file":"flag.die.png","frameWidth":210,"frameHeight":210,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"ash":{"file":"flag.ash.png","frameWidth":210,"frameHeight":210,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]}};
    function s7RegisterB04BFlag() {
      const root='./assets/zombies_b04b/';
      for(const [k,m] of Object.entries(S7_B04B_FLAG_MANIFEST))
        S7_SPRITES.register(`zombie.b04b.flag.${k}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      function clip(id,k,opt={}) {
        const m=S7_B04B_FLAG_MANIFEST[k], frames=opt.frames||15;
        S7_ANIM.registerClip({id,frames,loop:opt.loop!==false,source:{kind:'approved-flag-sheet',asset:k},layers:{body:{asset:`zombie.b04b.flag.${k}`,z:0,pixelScale:.00455,pivotX:.5,pivotY:.75,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,opt.loop!==false)}}}})
      }
      clip('zombie.b04b.flag.move.full','walk'); clip('zombie.b04b.flag.attack.full','attack');
      clip('zombie.b04b.flag.head.drop','head_drop',{loop:false}); clip('zombie.b04b.flag.die','die',{loop:false}); clip('zombie.b04b.flag.ash','ash',{loop:false});
    }
    s7RegisterB04BFlag();

    const S7_B04C_BUCKET_MANIFEST = {"armor.bucket.walk":{"file":"armor.bucket.walk.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.bucket.walk.d1":{"file":"armor.bucket.walk.d1.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.bucket.walk.d2":{"file":"armor.bucket.walk.d2.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.bucket.attack":{"file":"armor.bucket.attack.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.bucket.attack.d1":{"file":"armor.bucket.attack.d1.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"armor.bucket.attack.d2":{"file":"armor.bucket.attack.d2.png","frameWidth":200,"frameHeight":200,"columns":6,"frameCount":6,"durations":[100,100,100,100,100,100]},"detached.bucket":{"file":"detached.bucket.png","frameWidth":146,"frameHeight":143,"columns":1,"frameCount":1,"durations":[100]}};
    function s7RegisterB04CBucket() {
      const root='./assets/zombies_b04c/';
      for (const [k,m] of Object.entries(S7_B04C_BUCKET_MANIFEST))
        S7_SPRITES.register(`zombie.b04c.${k}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      function clip(id,bodyAsset,armorKey) {
        const b=S7_B04A_MANIFEST[bodyAsset], a=S7_B04C_BUCKET_MANIFEST[armorKey];
        S7_ANIM.registerClip({id,frames:15,loop:true,source:{kind:'approved-common-body+sealed-bucket',asset:armorKey},layers:{
          body:{asset:`zombie.b04a.asset.${bodyAsset}`,z:0,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(b.durations,15,true)}},
          armor:{asset:`zombie.b04c.${armorKey}`,z:2,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(a.durations,15,true)}}
        }});
      }
      clip('zombie.b04c.bucket.move.full','body.walk','armor.bucket.walk');
      clip('zombie.b04c.bucket.attack.full','body.attack','armor.bucket.attack');
    }
    s7RegisterB04CBucket();

    /* ============================================================================
     * B04R zombie motion refit: JSPVZ walk/bite is authoritative.
     * Arm-loss visuals are intentionally disabled by user decision.
     * ========================================================================== */
    const S7_B04R_MANIFEST = {"normal.walk":{"file":"normal.walk.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":22,"durations":[90,180,90,180,90,180,90,180,90,180,90,180,90,180,90,180,90,180,90,180,90,180],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/Zombie/Zombie.gif"},"normal.attack":{"file":"normal.attack.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":21,"durations":[150,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/Zombie/ZombieAttack.gif"},"flag.walk":{"file":"flag.walk.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":12,"durations":[180,180,180,180,180,180,180,180,180,180,180,180],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/FlagZombie/FlagZombie.gif"},"flag.attack":{"file":"flag.attack.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/FlagZombie/FlagZombieAttack.gif"}};
    function s7RegisterB04RZombies() {
      const root='./assets/zombies_b04r/';
      for(const [k,m] of Object.entries(S7_B04R_MANIFEST))
        S7_SPRITES.register(`zombie.b04r.${k}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      function clip(id,key) {
        const m=S7_B04R_MANIFEST[key];
        const total=m.durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        S7_ANIM.registerClip({id,frames,loop:true,source:{kind:'jspvz-zombie',asset:key},layers:{body:{asset:`zombie.b04r.${key}`,z:0,pixelScale:.00665,pivotX:.5,pivotY:.76,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,true)}}}});
      }
      function armored(id,key,armorAsset) {
        const m=S7_B04R_MANIFEST[key], a=(armorAsset.startsWith('armor.bucket')?S7_B04C_BUCKET_MANIFEST:S7_B04A_MANIFEST)[armorAsset];
        const total=m.durations.reduce((x,y)=>x+y,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        const armorPrefix=armorAsset.startsWith('armor.bucket')?'zombie.b04c.':'zombie.b04a.asset.';
        S7_ANIM.registerClip({id,frames,loop:true,source:{kind:'jspvz-body+independent-armor',asset:key},layers:{
          body:{asset:`zombie.b04r.${key}`,z:0,pixelScale:.00665,pivotX:.5,pivotY:.76,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,true)}},
          armor:{asset:armorPrefix+armorAsset,z:2,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack(a.durations,frames,true)}}
        }});
      }
      clip('zombie.b04r.normal.move','normal.walk');
      clip('zombie.b04r.normal.attack','normal.attack');
      clip('zombie.b04r.flag.move','flag.walk');
      clip('zombie.b04r.flag.attack','flag.attack');
      armored('zombie.b04r.cone.move','normal.walk','armor.cone.walk');
      armored('zombie.b04r.cone.attack','normal.attack','armor.cone.attack');
      armored('zombie.b04r.bucket.move','normal.walk','armor.bucket.walk');
      armored('zombie.b04r.bucket.attack','normal.attack','armor.bucket.attack');
    }
    s7RegisterB04RZombies();

    /* B04D Screen Door Zombie: JSPVZ held-door motion; after door loss, fall back to common JSPVZ body. */
    const S7_B04D_SCREEN_MANIFEST = {"screen.walk":{"file":"screen.walk.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":23,"durations":[180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombie.gif"},"screen.attack":{"file":"screen.attack.png","frameWidth":166,"frameHeight":157,"columns":8,"frameCount":12,"durations":[90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombieAttack.gif"},"screen.walk.d1":{"file":"screen.walk.d1.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":23,"durations":[180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombie.gif [procedural door damage]"},"screen.walk.d2":{"file":"screen.walk.d2.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":23,"durations":[180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombie.gif [procedural door damage]"},"screen.attack.d1":{"file":"screen.attack.d1.png","frameWidth":166,"frameHeight":157,"columns":8,"frameCount":12,"durations":[90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombieAttack.gif [procedural door damage]"},"screen.attack.d2":{"file":"screen.attack.d2.png","frameWidth":166,"frameHeight":157,"columns":8,"frameCount":12,"durations":[90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Zombies/ScreenDoorZombie/ScreenDoorZombieAttack.gif [procedural door damage]"}};
    function s7RegisterB04DScreen() {
      const root='./assets/zombies_b04d/';
      for(const [k,m] of Object.entries(S7_B04D_SCREEN_MANIFEST))
        S7_SPRITES.register(`zombie.b04d.${k}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      for(const [base,idBase] of [['screen.walk','zombie.b04d.screen.move'],['screen.attack','zombie.b04d.screen.attack']]) {
        for(const suffix of ['', '.d1', '.d2']) {
          const key=base+suffix, id=idBase+suffix, m=S7_B04D_SCREEN_MANIFEST[key];
          if(!m) continue;
          const total=m.durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
          S7_ANIM.registerClip({id,frames,loop:true,source:{kind:'jspvz-screen-door',asset:key},layers:{body:{asset:`zombie.b04d.${key}`,z:0,pixelScale:.00665,pivotX:.5,pivotY:.77,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,true)}}}});
        }
      }
    }
    s7RegisterB04DScreen();

    /* B05A Pole Vaulting Zombie: JSPVZ source motions; no arm-loss branch. */
    const S7_B05A_POLE_MANIFEST = {"pole.run":{"file":"pole_run.png","frameWidth":348,"frameHeight":218,"columns":8,"frameCount":10,"durations":[100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombie.gif"},"pole.walk":{"file":"pole_walk.png","frameWidth":348,"frameHeight":218,"columns":8,"frameCount":25,"durations":[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200],"source":"jspvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieWalk.gif"},"pole.attack":{"file":"pole_attack.png","frameWidth":348,"frameHeight":218,"columns":8,"frameCount":14,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieAttack.gif"},"pole.jump":{"file":"pole_jump.png","frameWidth":348,"frameHeight":218,"columns":8,"frameCount":10,"durations":[100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieJump.gif"},"pole.jump2":{"file":"pole_jump2.png","frameWidth":348,"frameHeight":218,"columns":7,"frameCount":7,"durations":[100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieJump2.gif"}};
    function s7RegisterB05APole() {
      const root='./assets/zombies_b05a/';
      for(const [k,m] of Object.entries(S7_B05A_POLE_MANIFEST))
        S7_SPRITES.register(`zombie.b05a.${k}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      const ids={
        'pole.run':'zombie.b05a.pole.run', 'pole.walk':'zombie.b05a.pole.walk', 'pole.attack':'zombie.b05a.pole.attack',
        'pole.jump':'zombie.b05a.pole.jump', 'pole.jump2':'zombie.b05a.pole.jump2'
      };
      for(const [key,id] of Object.entries(ids)) {
        const m=S7_B05A_POLE_MANIFEST[key], total=m.durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        S7_ANIM.registerClip({id,frames,loop:!key.includes('jump'),source:{kind:'jspvz-pole',asset:key},layers:{body:{asset:`zombie.b05a.${key}`,z:0,pixelScale:.0049,pivotX:.5,pivotY:.77,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,!key.includes('jump'))}}}});
      }
    }
    s7RegisterB05APole();

    /* B05A specials: Dancing/Backup/Jack JSPVZ motions; no arm-loss daily states. */
    const S7_B05A_SPECIAL_MANIFEST = {"dancer.slide":{"file":"dancer_slide.png","frameWidth":184,"frameHeight":176,"columns":8,"frameCount":21,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/DancingZombie/SlidingStep.gif"},"dancer.dance":{"file":"dancer_dance.png","frameWidth":184,"frameHeight":176,"columns":8,"frameCount":22,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/DancingZombie/Dancing.gif"},"dancer.attack":{"file":"dancer_attack.png","frameWidth":184,"frameHeight":176,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/DancingZombie/Attack.gif"},"dancer.summon":{"file":"dancer_summon.png","frameWidth":184,"frameHeight":176,"columns":3,"frameCount":3,"durations":[100,100,2000],"source":"jspvz/images/Zombies/DancingZombie/Summon.gif"},"backup.dance":{"file":"backup_dance.png","frameWidth":126,"frameHeight":152,"columns":8,"frameCount":22,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/BackupDancer/Dancing.gif"},"backup.attack":{"file":"backup_attack.png","frameWidth":126,"frameHeight":152,"columns":8,"frameCount":9,"durations":[100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/BackupDancer/Attack.gif"},"jack.walk":{"file":"jack_walk.png","frameWidth":196,"frameHeight":181,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/JackinTheBoxZombie/Walk.gif"},"jack.attack":{"file":"jack_attack.png","frameWidth":196,"frameHeight":181,"columns":7,"frameCount":7,"durations":[100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/JackinTheBoxZombie/Attack.gif"},"jack.open":{"file":"jack_open.png","frameWidth":196,"frameHeight":181,"columns":7,"frameCount":7,"durations":[100,100,100,100,100,100,10000],"source":"jspvz/images/Zombies/JackinTheBoxZombie/OpenBox.gif"}};
    function s7RegisterB05ASpecials() {
      const root='./assets/zombies_b05a/';
      const idMap={
        'dancer.slide':'zombie.b05a.dancer.slide','dancer.dance':'zombie.b05a.dancer.dance','dancer.attack':'zombie.b05a.dancer.attack','dancer.summon':'zombie.b05a.dancer.summon',
        'backup.dance':'zombie.b05a.backup.dance','backup.attack':'zombie.b05a.backup.attack',
        'jack.walk':'zombie.b05a.jack.walk','jack.attack':'zombie.b05a.jack.attack','jack.open':'zombie.b05a.jack.open'
      };
      for(const [key,m] of Object.entries(S7_B05A_SPECIAL_MANIFEST)) {
        S7_SPRITES.register(`zombie.b05a.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        let durations=m.durations.slice();
        if(key==='jack.open') durations=Array(m.frameCount).fill(120);
        if(key==='dancer.summon') durations=Array(m.frameCount).fill(300);
        const total=durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        const loop=!(key.endsWith('.summon')||key.endsWith('.open'));
        S7_ANIM.registerClip({id:idMap[key],frames,loop,source:{kind:'jspvz-special',asset:key},layers:{body:{asset:`zombie.b05a.${key}`,z:0,pixelScale:key.startsWith('dancer')?.0045:key.startsWith('backup')?.0048:.0051,pivotX:.5,pivotY:.77,tracks:{frameIndex:s7B03BNormalizedFrameTrack(durations,frames,loop)}}}});
      }
    }
    s7RegisterB05ASpecials();

    /* B05B JSPVZ water/runner/vehicle integration; no arm-loss branches. */
    const S7_B05B_MANIFEST = {"ducky.walk":{"file":"ducky_walk.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":16,"durations":[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200],"source":"jspvz/images/Zombies/DuckyTubeZombie1/Walk1.gif"},"ducky.attack":{"file":"ducky_attack.png","frameWidth":166,"frameHeight":144,"columns":8,"frameCount":10,"durations":[100,100,100,100,100,100,200,100,100,100],"source":"jspvz/images/Zombies/DuckyTubeZombie1/Attack.gif"},"snorkel.dive":{"file":"snorkel_dive.png","frameWidth":143,"frameHeight":210,"columns":8,"frameCount":10,"durations":[100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/SnorkelZombie/Walk2.gif"},"snorkel.surface":{"file":"snorkel_surface.png","frameWidth":143,"frameHeight":210,"columns":8,"frameCount":20,"durations":[50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50],"source":"jspvz/images/Zombies/SnorkelZombie/Walk1.gif"},"snorkel.attack":{"file":"snorkel_attack.png","frameWidth":143,"frameHeight":210,"columns":8,"frameCount":12,"durations":[100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/SnorkelZombie/Attack.gif"},"snorkel.sink":{"file":"snorkel_sink.png","frameWidth":143,"frameHeight":210,"columns":7,"frameCount":7,"durations":[100,100,100,100,100,100,20000],"source":"jspvz/images/Zombies/SnorkelZombie/Sink.gif"},"dolphin.ride":{"file":"dolphin_ride.png","frameWidth":282,"frameHeight":210,"columns":8,"frameCount":14,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/DolphinRiderZombie/Walk1.gif"},"dolphin.jumpUp":{"file":"dolphin_jumpUp.png","frameWidth":282,"frameHeight":210,"columns":5,"frameCount":5,"durations":[100,100,100,100,10000],"source":"jspvz/images/Zombies/DolphinRiderZombie/Jump2.gif"},"dolphin.air":{"file":"dolphin_air.png","frameWidth":282,"frameHeight":210,"columns":8,"frameCount":26,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,10000],"source":"jspvz/images/Zombies/DolphinRiderZombie/Jump.gif"},"dolphin.land":{"file":"dolphin_land.png","frameWidth":282,"frameHeight":210,"columns":8,"frameCount":18,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,10000],"source":"jspvz/images/Zombies/DolphinRiderZombie/Jump3.gif"},"dolphin.walk":{"file":"dolphin_walk.png","frameWidth":282,"frameHeight":210,"columns":8,"frameCount":14,"durations":[120,120,120,120,120,120,120,120,120,120,120,120,120,120],"source":"jspvz/images/Zombies/DolphinRiderZombie/Walk4.gif"},"dolphin.attack":{"file":"dolphin_attack.png","frameWidth":282,"frameHeight":210,"columns":8,"frameCount":13,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/DolphinRiderZombie/Attack.gif"},"football.run":{"file":"football_run.png","frameWidth":154,"frameHeight":160,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"jspvz/images/Zombies/FootballZombie/FootballZombie.gif"},"football.attack":{"file":"football_attack.png","frameWidth":154,"frameHeight":160,"columns":8,"frameCount":10,"durations":[90,90,90,90,90,90,90,90,90,90],"source":"jspvz/images/Zombies/FootballZombie/FootballZombieAttack.gif"},"football.noHelmetRun":{"file":"football_noHelmetRun.png","frameWidth":156,"frameHeight":160,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"jspvz/images/Zombies/FootballZombie/FootballZombieOrnLost.gif"},"football.noHelmetAttack":{"file":"football_noHelmetAttack.png","frameWidth":154,"frameHeight":160,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"jspvz/images/Zombies/FootballZombie/FootballZombieOrnLostAttack.gif"},"imp.walk":{"file":"imp_walk.png","frameWidth":81,"frameHeight":110,"columns":8,"frameCount":12,"durations":[200,200,200,200,200,200,200,200,200,200,200,100],"source":"jspvz/images/Zombies/Imp/1.gif"},"imp.attack":{"file":"imp_attack.png","frameWidth":81,"frameHeight":110,"columns":7,"frameCount":7,"durations":[200,200,200,200,200,200,200],"source":"jspvz/images/Zombies/Imp/Attack.gif"},"zomboni.full":{"file":"zomboni_full.png","frameWidth":464,"frameHeight":364,"columns":8,"frameCount":12,"durations":[100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/Zomboni/1.gif"},"zomboni.d1":{"file":"zomboni_d1.png","frameWidth":464,"frameHeight":364,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/Zomboni/2.gif"},"zomboni.d2":{"file":"zomboni_d2.png","frameWidth":464,"frameHeight":364,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/Zomboni/3.gif"},"zomboni.critical":{"file":"zomboni_critical.png","frameWidth":464,"frameHeight":364,"columns":8,"frameCount":29,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"jspvz/images/Zombies/Zomboni/4.gif"},"zomboni.boom":{"file":"zomboni_boom.png","frameWidth":464,"frameHeight":364,"columns":8,"frameCount":16,"durations":[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200],"source":"jspvz/images/Zombies/Zomboni/BoomDie.gif"}};
    function s7RegisterB05B() {
      const root='./assets/zombies_b05b/';
      const scales={ducky:.0050,snorkel:.00445,dolphin:.00425,football:.00465,imp:.0062,zomboni:.00255};
      for(const [key,m] of Object.entries(S7_B05B_MANIFEST)) {
        const asset=`zombie.b05b.${key}`;
        S7_SPRITES.register(asset,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        let durations=m.durations.slice();
        const total=durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        const once=key.includes('jumpUp')||key.includes('.air')||key.includes('.land')||key.includes('.sink')||key.includes('.boom');
        const family=key.split('.')[0];
        S7_ANIM.registerClip({id:asset,frames,loop:!once,source:{kind:'jspvz-b05b',asset:key},layers:{body:{asset,z:0,pixelScale:scales[family]||.0048,pivotX:.5,pivotY:family==='zomboni'?.72:.77,tracks:{frameIndex:s7B03BNormalizedFrameTrack(durations,frames,!once)}}}});
      }
    }
    s7RegisterB05B();

    /* FINAL zombie runtime: only types that previously lacked approved JSPVZ animation use the user packs. */
    const S7_FINAL_ZOMBIE_MANIFEST = Object.freeze({
      "catapult_drive":{file:"catapult_drive.webp",frameWidth:288,frameHeight:258,columns:8,frameCount:16,frameMs:82,loop:true,family:"vehicle",pivotY:0.76},
      "catapult_throw":{file:"catapult_throw.webp",frameWidth:288,frameHeight:258,columns:8,frameCount:24,frameMs:70,loop:false,family:"vehicle",pivotY:0.76},
      "garg_walk":{file:"garg_walk.webp",frameWidth:320,frameHeight:216,columns:5,frameCount:10,frameMs:164,loop:true,family:"giant",pivotY:0.82},
      "garg_hammer":{file:"garg_hammer.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:24,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "garg_throw":{file:"garg_throw.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:24,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "garg_death":{file:"garg_death.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:22,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "giga_walk":{file:"giga_walk.webp",frameWidth:320,frameHeight:216,columns:5,frameCount:10,frameMs:164,loop:true,family:"giant",pivotY:0.82},
      "giga_hammer":{file:"giga_hammer.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:24,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "giga_throw":{file:"giga_throw.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:24,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "giga_death":{file:"giga_death.webp",frameWidth:320,frameHeight:216,columns:8,frameCount:22,frameMs:70,loop:false,family:"giant",pivotY:0.82},
      "balloon_fly":{file:"balloon_fly.webp",frameWidth:280,frameHeight:230,columns:8,frameCount:14,frameMs:82,loop:true,family:"air",pivotY:0.74},
      "balloon_pop":{file:"balloon_pop.webp",frameWidth:280,frameHeight:230,columns:8,frameCount:24,frameMs:70,loop:false,family:"air",pivotY:0.74},
      "balloon_walk":{file:"balloon_walk_new.webp",frameWidth:514,frameHeight:674,columns:5,frameCount:20,frameMs:80,loop:true,family:"air",pivotY:0.74,pixelScale:.006},
      "balloon_attack":{file:"balloon_attack.webp",frameWidth:280,frameHeight:230,columns:8,frameCount:16,frameMs:82,loop:true,family:"air",pivotY:0.74},
      "balloon_death":{file:"balloon_death.webp",frameWidth:280,frameHeight:230,columns:8,frameCount:23,frameMs:70,loop:false,family:"air",pivotY:0.74},
      "ladder_carry":{file:"ladder_carry.webp",frameWidth:240,frameHeight:311,columns:8,frameCount:15,frameMs:80,loop:true,family:"normal",pivotY:0.78},
      "ladder_walk":{file:"ladder_walk_new.webp",frameWidth:240,frameHeight:311,columns:5,frameCount:15,frameMs:125,loop:true,family:"normal",pivotY:0.78},
      "ladder_attack":{file:"ladder_attack_new.webp",frameWidth:240,frameHeight:311,columns:5,frameCount:14,frameMs:100,loop:true,family:"normal",pivotY:0.78},
      "ladder_carry_attack":{file:"ladder_carry_attack.webp",frameWidth:250,frameHeight:313,columns:5,frameCount:20,frameMs:100,loop:true,family:"normal",pivotY:0.78},
      "yeti_walk":{file:"yeti_walk.webp",frameWidth:280,frameHeight:214,columns:8,frameCount:7,frameMs:164,loop:true,family:"normal",pivotY:0.78},
      "yeti_attack":{file:"yeti_attack.webp",frameWidth:280,frameHeight:214,columns:8,frameCount:7,frameMs:164,loop:true,family:"normal",pivotY:0.78},
      "yeti_death":{file:"yeti_death.webp",frameWidth:280,frameHeight:214,columns:8,frameCount:23,frameMs:70,loop:false,family:"normal",pivotY:0.78},
      "bobsled_walk":{file:"bobsled_walk.webp",frameWidth:352,frameHeight:384,columns:8,frameCount:32,frameMs:82,loop:true,family:"normal",pivotY:0.78,pixelScale:.00298},
      "bobsled_attack":{file:"bobsled_attack.webp",frameWidth:352,frameHeight:384,columns:8,frameCount:36,frameMs:82,loop:true,family:"normal",pivotY:0.78,pixelScale:.00298},
      "bobsled_death":{file:"bobsled_death.webp",frameWidth:352,frameHeight:384,columns:8,frameCount:27,frameMs:70,loop:false,family:"normal",pivotY:0.78,pixelScale:.00298},
      "bobsled_sled":{file:"bobsled_sled.webp",frameWidth:384,frameHeight:192,columns:6,frameCount:6,frameMs:82,loop:true,family:"vehicle",pivotY:0.91},
      "bungee_descend":{file:"bungee_descend.webp",frameWidth:256,frameHeight:222,columns:8,frameCount:24,frameMs:82,loop:true,family:"air",pivotY:0.74},
      "bungee_grab":{file:"bungee_grab.webp",frameWidth:256,frameHeight:222,columns:8,frameCount:24,frameMs:70,loop:false,family:"air",pivotY:0.74},
      "bungee_ascend":{file:"bungee_ascend.webp",frameWidth:256,frameHeight:222,columns:8,frameCount:22,frameMs:70,loop:false,family:"air",pivotY:0.74},
      "digger_underground":{file:"digger_underground.webp",frameWidth:228,frameHeight:138,columns:8,frameCount:14,frameMs:80,loop:true,family:"normal",pivotY:0.78,pixelScale:.0041},
      "digger_surface":{file:"digger_surface.webp",frameWidth:272,frameHeight:430,columns:8,frameCount:16,frameMs:80,loop:false,family:"normal",pivotY:0.78,pixelScale:.0082},
      "digger_stun":{file:"digger_stun.webp",frameWidth:301,frameHeight:427,columns:8,frameCount:29,frameMs:80,loop:true,family:"normal",pivotY:0.78,pixelScale:.0082},
      "digger_walk":{file:"digger_walk.webp",frameWidth:303,frameHeight:414,columns:8,frameCount:32,frameMs:80,loop:true,family:"normal",pivotY:0.78,pixelScale:.0082},
      "digger_attack":{file:"digger_attack.webp",frameWidth:296,frameHeight:411,columns:8,frameCount:13,frameMs:80,loop:true,family:"normal",pivotY:0.78,pixelScale:.0082},
      "digger_death":{file:"digger_death.webp",frameWidth:308,frameHeight:373,columns:8,frameCount:31,frameMs:80,loop:false,family:"normal",pivotY:0.78,pixelScale:.0082},
      "pogo_move":{file:"pogo_move.webp",frameWidth:240,frameHeight:263,columns:8,frameCount:14,frameMs:82,loop:true,family:"normal",pivotY:0.78},
      "pogo_walk":{file:"pogo_walk_trimmed.webp",frameWidth:240,frameHeight:263,columns:8,frameCount:10,frameMs:82,loop:true,family:"normal",pivotY:0.78},
      "pogo_attack":{file:"pogo_attack.webp",frameWidth:240,frameHeight:263,columns:8,frameCount:16,frameMs:82,loop:true,family:"normal",pivotY:0.78},
      "pogo_death":{file:"pogo_death.webp",frameWidth:240,frameHeight:263,columns:8,frameCount:24,frameMs:70,loop:false,family:"normal",pivotY:0.78}
    });
    function s7RegisterFinalZombies() {
      const root='./assets/final_runtime/';
      const scales={normal:.00410,air:.00375,vehicle:.00345,giant:.00355};
      for (const [key,m] of Object.entries(S7_FINAL_ZOMBIE_MANIFEST)) {
        const asset=`zombie.final.${key}`;
        S7_SPRITES.register(asset,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        const durations=Array.from({length:m.frameCount},()=>m.frameMs);
        const total=durations.reduce((a,b)=>a+b,0);
        const frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        S7_ANIM.registerClip({
          id:asset,frames,loop:m.loop,
          source:{kind:'user-zombie-pack',asset:key},
          layers:{body:{asset,z:0,pixelScale:m.pixelScale||scales[m.family]||.0041,pivotX:.5,pivotY:m.pivotY,tracks:{frameIndex:s7B03BNormalizedFrameTrack(durations,frames,m.loop)}}}
        })
      }
    }
    s7RegisterFinalZombies();

    const S7_PLANT_HEAD_ZOMBIES = Object.freeze({
      peaz:{head:'peashooter_head.webp',scale:.00315,x:-.045,y:-.335},
      gatlingz:{head:'gatling_head.webp',scale:.00315,x:-.045,y:-.335},
      squashz:{head:'squash_head.webp',scale:.00310,x:-.035,y:-.335},
      jalapenoz:{head:'jalapeno_head.webp',scale:.00305,x:-.035,y:-.335},
      wallz:{head:'wallnut_head.webp',scale:.00305,x:-.035,y:-.335},
      tallz:{head:'tallnut_head.webp',scale:.00310,x:-.035,y:-.345},
      blind:{head:'imitater_head.webp',scale:.00305,x:-.035,y:-.335}
    });
    function s7RegisterPlantHeadZombies() {
      const root='./assets/final_runtime/';
      S7_SPRITES.register('zombie.planthead.body.walk',root+'planthead_body_walk.webp',{frameWidth:200,frameHeight:200,columns:6,frameCount:6});
      S7_SPRITES.register('zombie.planthead.body.attack',root+'planthead_body_attack.webp',{frameWidth:200,frameHeight:200,columns:6,frameCount:6});
      for (const [type,cfg] of Object.entries(S7_PLANT_HEAD_ZOMBIES)) {
        const headAsset=`zombie.planthead.head.${type}`;
        S7_SPRITES.register(headAsset,root+cfg.head,{frameWidth:128,frameHeight:128,columns:1,frameCount:1});
        for (const action of ['walk','attack']) {
          const frames=15, body=`zombie.planthead.body.${action}`;
          const layers={
            body:{asset:body,z:0,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack([100,100,100,100,100,100],frames,true)}},
            head:{asset:headAsset,z:1,x:cfg.x,y:cfg.y,pixelScale:cfg.scale,pivotX:.5,pivotY:.58,scaleX:1,scaleY:1}
          };
          if (cfg.cone) layers.armor={asset:`zombie.b04a.asset.armor.cone.${action==='walk'?'walk':'attack'}`,z:2,pixelScale:.00485,pivotX:.5,pivotY:.74,tracks:{frameIndex:s7B03BNormalizedFrameTrack([100,100,100,100,100,100],frames,true)}};
          S7_ANIM.registerClip({id:`zombie.planthead.${type}.${action}`,frames,loop:true,source:{kind:'headless-body+mirrored-plant-head',type,action},layers})
        }
      }
    }
    s7RegisterPlantHeadZombies();
