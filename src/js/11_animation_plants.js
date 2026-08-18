"use strict";

    /* ============================================================================
     * B02A Kernel-pult vertical slice
     * Real PVZ component PNGs + deterministic LayeredSpritePose + EventTrack.
     * ========================================================================== */
    const S7_KERNEL_ANIM = Object.freeze({
      releaseFrame: 7,
      frames: 16
    });

    function s7KernelWindupAdvanceCount(p) {
      const rate = Math.max(.001, s7PlantAnimationRate(p));
      // advance() runs once in the same logic tick that starts the clip.
      return Math.max(1, Math.ceil(S7_KERNEL_ANIM.releaseFrame / rate - 1e-9))
    }

    function s7KernelWindupLeadCd(p, slowFactor = 1) {
      // The first animation advance occurs in the start tick, after that tick already
      // consumed p.cd. Therefore only (advanceCount - 1) future cd decrements remain.
      const futureCdSteps = Math.max(0, s7KernelWindupAdvanceCount(p) - 1);
      return futureCdSteps * S7_ANIMATION_FIXED_DT * Math.max(0, finiteNumber(slowFactor, 1))
    }

    function s7RegisterB02AKernelAssetsAndClips() {
      const root = "./assets/cornpult/";
      const spriteFiles = {
        "corn.body":"Cornpult_body.png",
        "corn.blink1":"Cornpult_blink1.png",
        "corn.blink2":"Cornpult_blink2.png",
        "corn.eyebrow":"Cornpult_eyebrow.png",
        "corn.husk1":"Cornpult_husk1.png",
        "corn.husk2":"Cornpult_husk2.png",
        "corn.husk3":"Cornpult_husk3.png",
        "corn.husk4":"Cornpult_husk4.png",
        "corn.husk5":"Cornpult_husk5.png",
        "corn.husk6":"Cornpult_husk6.png",
        "corn.husktip1":"Cornpult_husktip1.png",
        "corn.husktip2":"Cornpult_husktip2.png",
        "corn.husktip3":"Cornpult_husktip3.png",
        "corn.stalk1":"Cornpult_stalk1.png",
        "corn.stalk2":"Cornpult_stalk2.png",
        "corn.stalk3":"Cornpult_stalk3.png",
        "corn.stalk4":"Cornpult_stalk4.png",
        "corn.kernel":"Cornpult_kernal.png",
        "corn.butter":"Cornpult_butter.png",
        "corn.butterSplat":"Cornpult_butter_splat.png",
        "corn.armIdle":"Cornpult_arm_video_idle.png",
        "corn.armVertical":"Cornpult_arm_video_vertical.png"
      };
      for (const [id, file] of Object.entries(spriteFiles)) S7_SPRITES.register(id, root + file);
      S7_AUDIO.register("kernelpult", "./assets/sfx/kernelpult.wav", { volume:.72 });
      S7_AUDIO.register("kernelpult2", "./assets/sfx/kernelpult2.wav", { volume:.72 });
      S7_AUDIO.register("butter", "./assets/sfx/butter.wav", { volume:.75 });
      S7_AUDIO.register("throw", "./assets/sfx/throw.wav", { volume:.66 });

      const idleLayers = {
        // The source archive does not contain synthetic head/basket files. The layer schema follows the real assets.
        body:{asset:"corn.body",z:20,x:.02,y:.035,pixelScale:.0102},
        huskBack:{asset:"corn.husk4",z:8,x:-.22,y:.255,rotation:-.16,pixelScale:.0105,scale:1.05},
        huskLeft:{asset:"corn.husk1",z:25,x:-.18,y:.235,rotation:.15,pixelScale:.0105},
        huskRight:{asset:"corn.husk2",z:25,x:.18,y:.245,rotation:-.05,pixelScale:.0105},
        huskTip:{asset:"corn.husktip1",z:27,x:-.31,y:.30,rotation:.12,pixelScale:.0108},
        // The four tiny Cornpult_stalk*.png files are source components, not four rigid segments
        // to draw simultaneously. For the vertical slice, original-video arm poses provide the
        // complete connected stalk+basket silhouette while body/husks/payload remain independent.
        armIdle:{asset:"corn.armIdle",z:11,x:-.01,y:-.285,pivotX:.95,pivotY:.89,pixelScale:.00445,scale:1.0},
        armVertical:{asset:"corn.armVertical",z:11,x:-.015,y:-.285,pivotX:.48,pivotY:1.0,pixelScale:.00445,scale:1.0,visible:false},
        payload:{asset:"corn.kernel",z:14,x:-.61,y:-.58,pixelScale:.0105,scale:.78},
        eyebrow:{asset:"corn.eyebrow",z:30,x:.045,y:-.205,rotation:-.05,pixelScale:.0103}
      };

      S7_ANIM.registerClip({
        id:"plant.kernel.idle", frames:24, loop:true, source:{kind:"pvz-components",asset:"Cornpult_*"},
        tracks:{ y:[{frame:0,value:0},{frame:6,value:-.008},{frame:12,value:0},{frame:18,value:.008},{frame:23,value:0}], rotation:[{frame:0,value:-.008},{frame:12,value:.008},{frame:23,value:-.008}] },
        layers:{
          ...idleLayers,
          armIdle:{...idleLayers.armIdle,tracks:{rotation:[{frame:0,value:0},{frame:6,value:.012},{frame:12,value:-.008},{frame:18,value:.01},{frame:23,value:0}]}},
          armVertical:{...idleLayers.armVertical,visible:false},
          payload:{...idleLayers.payload,tracks:{x:[{frame:0,value:-.61},{frame:12,value:-.60},{frame:23,value:-.61}],y:[{frame:0,value:-.58},{frame:12,value:-.59},{frame:23,value:-.58}]}}
        }
      });

      function throwClip(id, payloadAsset, projectileKind, soundId, payloadScale = 1) {
        const layers = {};
        for (const [name, def] of Object.entries(idleLayers)) layers[name] = {...def};
        layers.armIdle = {...layers.armIdle, tracks:{
          visible:[{frame:0,value:1,hold:true},{frame:4,value:1,hold:true},{frame:5,value:0,hold:true},{frame:10,value:0,hold:true},{frame:11,value:1,hold:true},{frame:15,value:1,hold:true}],
          x:[{frame:0,value:-.01},{frame:4,value:.015},{frame:11,value:.015},{frame:15,value:-.01}],
          y:[{frame:0,value:-.285},{frame:4,value:-.31},{frame:11,value:-.27},{frame:15,value:-.285}],
          rotation:[{frame:0,value:0},{frame:4,value:-.04},{frame:11,value:.035},{frame:15,value:0}]
        }};
        layers.armVertical = {...layers.armVertical, visible:true, tracks:{
          visible:[{frame:0,value:0,hold:true},{frame:4,value:0,hold:true},{frame:5,value:1,hold:true},{frame:10,value:1,hold:true},{frame:11,value:0,hold:true},{frame:15,value:0,hold:true}],
          x:[{frame:5,value:-.04},{frame:7,value:-.015},{frame:10,value:-.055}],
          y:[{frame:5,value:-.275},{frame:7,value:-.305},{frame:10,value:-.275}],
          rotation:[{frame:5,value:-.035},{frame:7,value:0},{frame:10,value:.05}]
        }};
        layers.payload = {...layers.payload, asset:payloadAsset, scale:finiteNumber(layers.payload.scale,1)*payloadScale,
          tracks:{
            x:[{frame:0,value:-.61},{frame:3,value:-.57},{frame:5,value:-.10},{frame:6,value:.02},{frame:7,value:.04},{frame:15,value:-.61}],
            y:[{frame:0,value:-.58},{frame:3,value:-.62},{frame:5,value:-.88},{frame:6,value:-1.00},{frame:7,value:-.98},{frame:8,value:-.70},{frame:15,value:-.58}],
            rotation:[{frame:0,value:0},{frame:6,value:-.22},{frame:8,value:.45},{frame:15,value:0}],
            visible:[{frame:0,value:1,hold:true},{frame:7,value:1,hold:true},{frame:7.01,value:0,hold:true},{frame:15,value:0,hold:true}]
          }};
        S7_ANIM.registerClip({
          id, frames:S7_KERNEL_ANIM.frames, loop:false, source:{kind:"pvz-components+0725-video",asset:"Cornpult_*"},
          tracks:{
            y:[{frame:0,value:0},{frame:4,value:.025},{frame:7,value:-.035},{frame:11,value:.012},{frame:15,value:0}],
            rotation:[{frame:0,value:0},{frame:5,value:-.035},{frame:8,value:.025},{frame:15,value:0}],
            scaleY:[{frame:0,value:1},{frame:5,value:.965},{frame:8,value:1.025},{frame:15,value:1}]
          },
          layers,
          events:[
            {frame:S7_KERNEL_ANIM.releaseFrame,type:"projectile_spawn",value:{plantKey:"kernel",kind:projectileKind}},
            {frame:S7_KERNEL_ANIM.releaseFrame,type:"sound",value:soundId},
            {frame:15,type:"kernel_throw_complete",value:{kind:projectileKind}}
          ]
        })
      }

      throwClip("plant.kernel.throw.kernel", "corn.kernel", "kernel", "kernelpult", .78);
      throwClip("plant.kernel.throw.butter", "corn.butter", "butter", "butter", .52);
      throwClip("plant.kernel.throw.bigButter", "corn.butter", "bigButter", "butter", .68);
      throwClip("plant.kernel.throw.cob", "corn.kernel", "cob", "kernelpult2", 1.25)
    }

    s7RegisterB02AKernelAssetsAndClips();


    /* ==========================================================================
     * B02B Newspaper Zombie vertical slice
     * JSPVZ GIFs are converted to PNG atlases at package-build time. Browser GIF
     * playback is never used for gameplay animation; the 25Hz timeline chooses
     * atlas frames, so cold/freeze/rate and EventTrack stay deterministic.
     * ========================================================================== */
    const S7_B02B_NEWS_MANIFEST = {"news.walk.paper.body":{"file":"walk.paper.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":38,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.walk.paper.newspaper":{"file":"walk.paper.newspaper.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":38,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.walk.paper.newspaper.d1":{"file":"walk.paper.newspaper.d1.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":38,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.walk.paper.newspaper.d2":{"file":"walk.paper.newspaper.d2.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":38,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.walk.paper.head":{"file":"walk.paper.head.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":19,"durations":[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,100]},"news.attack.paper.body":{"file":"attack.paper.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100]},"news.attack.paper.newspaper":{"file":"attack.paper.newspaper.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100]},"news.attack.paper.newspaper.d1":{"file":"attack.paper.newspaper.d1.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100]},"news.attack.paper.newspaper.d2":{"file":"attack.paper.newspaper.d2.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100]},"news.attack.paper.head":{"file":"attack.paper.head.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":8,"durations":[100,100,100,100,100,100,100,100]},"news.run.rage.body":{"file":"run.rage.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":16,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.run.rage.arm":{"file":"run.rage.arm.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":16,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.run.rage.head":{"file":"run.rage.head.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":14,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.attack.rage.body":{"file":"attack.rage.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":7,"durations":[100,100,100,100,100,100,100]},"news.attack.rage.arm":{"file":"attack.rage.arm.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":7,"durations":[100,100,100,100,100,100,100]},"news.attack.rage.head":{"file":"attack.rage.head.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":7,"durations":[100,100,100,100,100,100,100]},"news.walk.lostHead.body":{"file":"walk.lostHead.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":16,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.walk.lostHead.arm":{"file":"walk.lostHead.arm.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":16,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]},"news.attack.lostHead.body":{"file":"attack.lostHead.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":7,"durations":[100,100,100,100,100,100,100]},"news.attack.lostHead.arm":{"file":"attack.lostHead.arm.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":7,"durations":[100,100,100,100,100,100,100]},"news.paper.break.full":{"file":"paper.break.full.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,500]},"news.die.full":{"file":"die.full.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100]},"news.boomDie.full":{"file":"boomDie.full.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":20,"durations":[200,100,100,100,100,300,100,100,100,100,100,100,100,100,100,300,100,100,100,100]},"news.die.body":{"file":"die.body.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100]},"news.die.arm":{"file":"die.arm.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100]},"news.ashDie.full":{"file":"ashDie.full.png","frameWidth":216,"frameHeight":164,"columns":8,"frameCount":20,"durations":[200,100,100,100,100,300,100,100,100,100,100,100,100,100,100,300,100,100,100,100]},"news.detached.head":{"file":"detached.head.png","frameWidth":58,"frameHeight":43,"columns":1,"frameCount":1,"durations":[100]},"news.detached.arm":{"file":"detached.arm.png","frameWidth":64,"frameHeight":39,"columns":1,"frameCount":1,"durations":[100]},"news.detached.newspaper":{"file":"detached.newspaper.png","frameWidth":74,"frameHeight":72,"columns":1,"frameCount":1,"durations":[100]}};

    function s7B02BFrameTrack(durations, clipFrames, loopSource = true) {
      const ds = finiteArray(durations).map(v => Math.max(1, finiteNumber(v, 100)));
      if (!ds.length) return [{frame:0,value:0,hold:true}];
      const total = ds.reduce((a,b) => a+b, 0);
      const track = [];
      let last = -1;
      for (let t = 0; t < clipFrames; t++) {
        let ms = t * S7_ANIMATION_FIXED_DT * 1000;
        if (loopSource && total > 0) ms %= total; else ms = Math.min(ms, Math.max(0,total-1));
        let acc = 0, idx = ds.length - 1;
        for (let i=0;i<ds.length;i++) { acc += ds[i]; if (ms < acc) { idx=i; break } }
        if (idx !== last) { track.push({frame:t,value:idx,hold:true}); last=idx }
      }
      return track
    }

    function s7B02BRegisterNewspaperAssetsAndClips() {
      const root = "./assets/newspaper/";
      for (const [id, m] of Object.entries(S7_B02B_NEWS_MANIFEST))
        S7_SPRITES.register(id, root + m.file, {frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      S7_AUDIO.register("newspaper_rip", "./assets/sfx/newspaper_rip.wav", {volume:.82});
      S7_AUDIO.register("newspaper_rarrgh2", "./assets/sfx/newspaper_rarrgh2.wav", {volume:.9});
      S7_AUDIO.register("paper", "./assets/sfx/paper.wav", {volume:.72});

      const source = {kind:"jspvz-atlas+0724-crosscheck", asset:"NewspaperZombie"};
      const frameCount = (id, fallback=1) => Math.max(1, finiteNumber(S7_B02B_NEWS_MANIFEST[id]?.frameCount, fallback));
      const durs = id => S7_B02B_NEWS_MANIFEST[id]?.durations || [100];
      const clipFrames = id => Math.max(1, Math.round(durs(id).reduce((a,b)=>a+b,0) / (S7_ANIMATION_FIXED_DT*1000)));
      const layer = (name,id,frames,opt={}) => [name, {asset:id,z:opt.z||0,x:opt.x||0,y:opt.y||0,pixelScale:opt.pixelScale||.0062,pivotX:.5,pivotY:.62,tracks:{frameIndex:s7B02BFrameTrack(durs(id),frames,opt.loopSource!==false)}}];
      const bites = frames => Array.from({length:frames}, (_,i)=>({frame:i,type:"newspaper_bite",value:{}}));

      let frames = clipFrames("news.walk.paper.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.walk.paper",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.walk.paper.body",frames,{z:0}), layer("newspaper","news.walk.paper.newspaper",frames,{z:2}), layer("head","news.walk.paper.head",frames,{z:3})
      ])});
      frames = clipFrames("news.attack.paper.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.attack.paper",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.attack.paper.body",frames,{z:0}), layer("newspaper","news.attack.paper.newspaper",frames,{z:2}), layer("head","news.attack.paper.head",frames,{z:3})
      ]),events:bites(frames)});

      frames = clipFrames("news.run.rage.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.run.rage",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.run.rage.body",frames,{z:0}), layer("arm","news.run.rage.arm",frames,{z:1}), layer("head","news.run.rage.head",frames,{z:2})
      ])});
      frames = clipFrames("news.attack.rage.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.attack.rage",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.attack.rage.body",frames,{z:0}), layer("arm","news.attack.rage.arm",frames,{z:1}), layer("head","news.attack.rage.head",frames,{z:2})
      ]),events:bites(frames)});

      frames = clipFrames("news.walk.lostHead.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.walk.lostHead",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.walk.lostHead.body",frames,{z:0}), layer("arm","news.walk.lostHead.arm",frames,{z:1})
      ])});
      frames = clipFrames("news.attack.lostHead.body");
      S7_ANIM.registerClip({id:"zombie.newspaper.attack.lostHead",frames,loop:true,source,layers:Object.fromEntries([
        layer("body","news.attack.lostHead.body",frames,{z:0}), layer("arm","news.attack.lostHead.arm",frames,{z:1})
      ]),events:bites(frames)});

      // LostNewspaper lasts ~1.1s; S7 break protection lasts 1.5s. Split it into
      // source-backed paper.break + a short protected transition so the speed switch
      // is caused by EventTrack, not by an independent timer.
      const breakFrames = Math.max(2, Math.round(1.10 / S7_ANIMATION_FIXED_DT));
      S7_ANIM.registerClip({id:"zombie.newspaper.paper.break",frames:breakFrames,loop:false,source,layers:Object.fromEntries([
        layer("body","news.paper.break.full",breakFrames,{z:0,loopSource:false})
      ]),events:[
        {frame:1,type:"newspaper_defense_sync"},
        {frame:1,type:"sound",value:"newspaper_rip"},
        {frame:5,type:"newspaper_detach"},
        {frame:breakFrames-1,type:"newspaper_break_complete"}
      ]});
      const transitionFrames = Math.max(1, Math.round((1.5 - 1.10)/S7_ANIMATION_FIXED_DT));
      S7_ANIM.registerClip({id:"zombie.newspaper.transition.invuln",frames:transitionFrames,loop:false,source,layers:Object.fromEntries([
        layer("body","news.run.rage.body",transitionFrames,{z:0}), layer("arm","news.run.rage.arm",transitionFrames,{z:1}), layer("head","news.run.rage.head",transitionFrames,{z:2})
      ]),events:[{frame:Math.max(0,transitionFrames-1),type:"newspaper_rage_begin"},{frame:Math.max(0,transitionFrames-1),type:"sound",value:"newspaper_rarrgh2"}]});

      // Critical death is 70 HP draining at 100/s ~= .7s in the existing S7 baseline.
      // Compress the JSPVZ death sequence into that window and bind arm/head drops to it.
      const dieFrames = Math.max(2, Math.round(.72 / S7_ANIMATION_FIXED_DT));
      S7_ANIM.registerClip({id:"zombie.newspaper.die",frames:dieFrames,loop:false,source,layers:Object.fromEntries([
        layer("body","news.die.body",dieFrames,{z:0,loopSource:false}),
        layer("arm","news.die.arm",dieFrames,{z:1,loopSource:false}),
        ["head",{asset:"news.run.rage.head",z:2,pixelScale:.0062,pivotX:.5,pivotY:.62,tracks:{frameIndex:[{frame:0,value:0,hold:true}],rotation:[{frame:0,value:0},{frame:5,value:-.2}],y:[{frame:0,value:0},{frame:5,value:.04}]}}]
      ]),events:[
        {frame:Math.min(dieFrames-2,5),type:"newspaper_drop_head"}
      ]});
      for (const [id,asset] of [["boomDie","news.boomDie.full"],["ashDie","news.ashDie.full"]]) {
        const f=clipFrames(asset); S7_ANIM.registerClip({id:`zombie.newspaper.${id}`,frames:f,loop:false,source,layers:{body:{asset,pixelScale:.0062,pivotX:.5,pivotY:.62,tracks:{frameIndex:s7B02BFrameTrack(durs(asset),f,false)}}}})
      }
    }

    s7B02BRegisterNewspaperAssetsAndClips();

    /* ============================================================================
     * B03A plant atlas batch 1
     * Source GIFs are converted to PNG atlases and sampled by the fixed 40ms clock.
     * ========================================================================== */
    const S7_B03A_PLANT_MANIFEST = {"wallnut":{"file":"wallnut.png","frameWidth":65,"frameHeight":73,"columns":8,"frameCount":16,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/WallNut/WallNut.gif"},"tallnut":{"file":"tallnut.png","frameWidth":83,"frameHeight":119,"columns":8,"frameCount":14,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/TallNut/TallNut.gif"},"cactus":{"file":"cactus.png","frameWidth":86,"frameHeight":84,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Cactus/Cactus.gif"},"spikerock":{"file":"spikerock.png","frameWidth":84,"frameHeight":43,"columns":8,"frameCount":8,"durations":[180,180,180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Spikerock/Spikerock.gif"},"snowpea":{"file":"snowpea.png","frameWidth":71,"frameHeight":71,"columns":8,"frameCount":15,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SnowPea/SnowPea.gif"},"repeater":{"file":"repeater.png","frameWidth":73,"frameHeight":71,"columns":8,"frameCount":15,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Repeater/Repeater.gif"},"puff":{"file":"puff.png","frameWidth":40,"frameHeight":66,"columns":8,"frameCount":14,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/PuffShroom/PuffShroom.gif"},"puff_sleep":{"file":"puff_sleep.png","frameWidth":40,"frameHeight":66,"columns":8,"frameCount":17,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/PuffShroom/PuffShroomSleep.gif"},"seashroom":{"file":"seashroom.png","frameWidth":48,"frameHeight":99,"columns":8,"frameCount":25,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SeaShroom/SeaShroom.gif"},"seashroom_sleep":{"file":"seashroom_sleep.png","frameWidth":48,"frameHeight":99,"columns":8,"frameCount":22,"durations":[180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SeaShroom/SeaShroomSleep.gif"},"splitpea":{"file":"splitpea.png","frameWidth":92,"frameHeight":72,"columns":8,"frameCount":14,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SplitPea/SplitPea.gif"},"starfruit":{"file":"starfruit.png","frameWidth":77,"frameHeight":70,"columns":8,"frameCount":13,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Starfruit/Starfruit.gif"},"fume":{"file":"fume.png","frameWidth":100,"frameHeight":88,"columns":8,"frameCount":16,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/FumeShroom/FumeShroom.gif"},"fume_sleep":{"file":"fume_sleep.png","frameWidth":100,"frameHeight":88,"columns":8,"frameCount":14,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/FumeShroom/FumeShroomSleep.gif"},"gloom":{"file":"gloom.png","frameWidth":95,"frameHeight":83,"columns":8,"frameCount":12,"durations":[100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/GloomShroom/GloomShroom.gif"},"gloom_sleep":{"file":"gloom_sleep.png","frameWidth":95,"frameHeight":83,"columns":8,"frameCount":13,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/GloomShroom/GloomShroomSleep.gif"},"potato":{"file":"potato.png","frameWidth":75,"frameHeight":55,"columns":8,"frameCount":8,"durations":[200,200,200,200,200,200,200,200],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/PotatoMine/PotatoMine.gif"}};
    const S7_B03A_DEFAULT_CLIPS = Object.create(null);
    const S7_B03A_SLEEP_CLIPS = Object.create(null);
    const S7_B03A_MIRRORED_CLIPS = Object.create(null);

    function s7RegisterB03APlantAtlases() {
      const root = "./assets/plants_b03a/";
      const sleepKeys = new Set(["puff_sleep","seashroom_sleep","fume_sleep","gloom_sleep"]);
      for (const [sourceKey,m] of Object.entries(S7_B03A_PLANT_MANIFEST)) {
        const assetId = `plant.b03a.asset.${sourceKey}`;
        S7_SPRITES.register(assetId, root + m.file, {frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        const isSleep = sleepKeys.has(sourceKey);
        const plantKey = isSleep ? sourceKey.replace(/_sleep$/,"") : sourceKey;
        const totalMs = finiteArray(m.durations).reduce((a,b)=>a+Math.max(1,finiteNumber(b,100)),0);
        const frames = Math.max(1, Math.round(totalMs / (S7_ANIMATION_FIXED_DT*1000)));
        const pixelScale = .92 / Math.max(1, finiteNumber(m.frameWidth,1), finiteNumber(m.frameHeight,1));
        const clipId = `plant.b03a.${plantKey}.${isSleep ? "sleep" : "idle"}`;
        S7_ANIM.registerClip({
          id:clipId, frames, loop:true, source:{kind:"jspvz-atlas",asset:sourceKey},
          layers:{body:{asset:assetId,z:0,pixelScale,pivotX:.5,pivotY:.70,tracks:{frameIndex:s7B02BFrameTrack(m.durations,frames,true)}}}
        });
        if (isSleep) S7_B03A_SLEEP_CLIPS[plantKey] = clipId;
        else S7_B03A_DEFAULT_CLIPS[plantKey] = clipId
      }
    }

    function s7RegisterB03APlantMirrors() {
      const repeater = S7_B03A_PLANT_MANIFEST.repeater;
      if (!repeater) return;
      const totalMs = finiteArray(repeater.durations).reduce((a,b)=>a+Math.max(1,finiteNumber(b,100)),0);
      const frames = Math.max(1, Math.round(totalMs / (S7_ANIMATION_FIXED_DT*1000)));
      const pixelScale = .736 / Math.max(1, finiteNumber(repeater.frameWidth,1), finiteNumber(repeater.frameHeight,1));
      const clipId = 'plant.b03a.reverseRepeater.idle';
      S7_ANIM.registerClip({
        id:clipId, frames, loop:true, source:{kind:'jspvz-atlas-mirrored',asset:'repeater',mirrorOf:'repeater'},
        layers:{body:{asset:'plant.b03a.asset.repeater',z:0,pixelScale,pivotX:.5,pivotY:.70,scaleX:-1,tracks:{frameIndex:s7B02BFrameTrack(repeater.durations,frames,true)}}}
      });
      S7_B03A_DEFAULT_CLIPS.reverseRepeater = clipId;
      S7_B03A_MIRRORED_CLIPS.reverseRepeater = clipId
    }

    s7RegisterB03APlantAtlases();
    s7RegisterB03APlantMirrors();

    /* ============================================================================
     * B03B P0 plant action visuals
     * Squash / Threepeater / Blover / GatlingPea use real JSPVZ source frames.
     * Combat logic stays authoritative; this batch only maps existing combat states
     * to source-backed timeline clips.
     * ========================================================================== */
    const S7_B03B_MANIFEST = {"squash":{"file":"squash.png","frameWidth":100,"frameHeight":226,"columns":8,"frameCount":17,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Squash/Squash.gif"},"squash_attack":{"file":"squash_attack.png","frameWidth":100,"frameHeight":226,"columns":4,"frameCount":4,"durations":[360,90,270,900],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Squash/SquashAttack.gif"},"threepeater":{"file":"threepeater.png","frameWidth":73,"frameHeight":80,"columns":8,"frameCount":16,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Threepeater/Threepeater.gif"},"blover":{"file":"blover.png","frameWidth":118,"frameHeight":92,"columns":8,"frameCount":30,"durations":[90,90,90,90,90,180,90,90,90,90,90,90,90,90,180,90,90,90,90,90,90,90,90,90,90,90,90,180,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Blover/Blover.gif"},"gatling":{"file":"gatling.png","frameWidth":88,"frameHeight":84,"columns":8,"frameCount":13,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/GatlingPea/GatlingPea.gif"}};
    const S7_B03B_DEFAULT_CLIPS = Object.create(null);

    function s7B03BNormalizedFrameTrack(durations, frames, loopSource=true) {
      const ds = finiteArray(durations).map(x=>Math.max(1,finiteNumber(x,100)));
      if (!ds.length) return [{frame:0,value:0,hold:true}];
      const total=ds.reduce((a,b)=>a+b,0);
      let acc=0; const out=[];
      for (let i=0;i<ds.length;i++) {
        const f=Math.max(0,Math.min(frames-1,Math.round((acc/total)*Math.max(0,frames-1))));
        out.push({frame:f,value:i,hold:true}); acc+=ds[i]
      }
      if (!loopSource) out.push({frame:Math.max(0,frames-1),value:ds.length-1,hold:true});
      return out
    }

    function s7RegisterB03BP0Plants() {
      const root='./assets/plants_b03b/';
      for (const [key,m] of Object.entries(S7_B03B_MANIFEST)) {
        S7_SPRITES.register(`plant.b03b.asset.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount})
      }
      function layerFor(key,frames,track,opt={}) {
        const m=S7_B03B_MANIFEST[key];
        return {asset:`plant.b03b.asset.${key}`,z:0,pixelScale:finiteNumber(opt.pixelScale,.94/Math.max(m.frameWidth,m.frameHeight)),pivotX:.5,pivotY:finiteNumber(opt.pivotY,.72),tracks:{frameIndex:track, ...(opt.tracks||{})}}
      }
      function gifClip(id,key,opt={}) {
        const m=S7_B03B_MANIFEST[key];
        const sourceMs=m.durations.reduce((a,b)=>a+b,0);
        const frames=Math.max(1,opt.frames||Math.round(sourceMs/(S7_ANIMATION_FIXED_DT*1000)));
        const track=opt.track||s7B03BNormalizedFrameTrack(m.durations,frames,opt.loopSource!==false);
        S7_ANIM.registerClip({id,frames,loop:opt.loop!==false,source:{kind:'jspvz-atlas',asset:key},tracks:opt.rootTracks||{},layers:{body:layerFor(key,frames,track,opt)}});
        return id
      }
      S7_B03B_DEFAULT_CLIPS.squash=gifClip('plant.b03b.squash.idle','squash');
      S7_B03B_DEFAULT_CLIPS.threepeater=gifClip('plant.b03b.threepeater.idle','threepeater');
      S7_B03B_DEFAULT_CLIPS.blover=gifClip('plant.b03b.blover.idle','blover');
      S7_B03B_DEFAULT_CLIPS.gatling=gifClip('plant.b03b.gatling.idle','gatling');

      const attack=S7_B03B_MANIFEST.squash_attack;
      const attackAsset='plant.b03b.asset.squash_attack';
      const px=.94/Math.max(attack.frameWidth,attack.frameHeight);
      const mk=(id,frames,values,opt={})=>S7_ANIM.registerClip({id,frames,loop:!!opt.loop,source:{kind:'jspvz-atlas',asset:'squash_attack'},
        layers:{body:{asset:attackAsset,z:0,pixelScale:px,pivotX:.5,pivotY:.72,tracks:{frameIndex:values}}},tracks:opt.rootTracks||{}});
      mk('plant.b03b.squash.targeting',25,[{frame:0,value:0,hold:true},{frame:18,value:1,hold:true},{frame:24,value:1,hold:true}]);
      mk('plant.b03b.squash.air',8,[{frame:0,value:0,hold:true},{frame:7,value:0,hold:true}],{loop:true});
      mk('plant.b03b.squash.impact',4,[{frame:0,value:2,hold:true},{frame:2,value:3,hold:true},{frame:3,value:3,hold:true}]);

      gifClip('plant.b03b.threepeater.fire','threepeater',{frames:18,loop:false,loopSource:false,rootTracks:{scaleX:[{frame:0,value:1},{frame:7,value:1.035},{frame:17,value:1}],scaleY:[{frame:0,value:1},{frame:7,value:.97},{frame:17,value:1}]}});
      gifClip('plant.b03b.threepeater.ult','threepeater',{frames:18,loop:true,rootTracks:{rotation:[{frame:0,value:-.025},{frame:9,value:.025},{frame:17,value:-.025}],scaleX:[{frame:0,value:1},{frame:9,value:1.06},{frame:17,value:1}],scaleY:[{frame:0,value:1},{frame:9,value:1.06},{frame:17,value:1}]}});
      gifClip('plant.b03b.blover.gust','blover',{frames:28,loop:false,loopSource:false,rootTracks:{scaleX:[{frame:0,value:1},{frame:10,value:1.08},{frame:27,value:1}],scaleY:[{frame:0,value:1},{frame:10,value:1.08},{frame:27,value:1}]}});
      gifClip('plant.b03b.gatling.ult','gatling',{frames:15,loop:true,rootTracks:{x:[{frame:0,value:0},{frame:4,value:-.035},{frame:8,value:.018},{frame:14,value:0}],scaleX:[{frame:0,value:1},{frame:7,value:1.035},{frame:14,value:1}]}})

      S7_SPRITES.register('plant.b03b.asset.explodenut','./assets/plants_b03b/explodenut_red.png',{frameWidth:65,frameHeight:73,columns:8,frameCount:16});
      const _enDur=[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90];
      const _enFrames=Math.max(1,Math.round(_enDur.reduce((a,b)=>a+b,0)/(S7_ANIMATION_FIXED_DT*1000)));
      S7_ANIM.registerClip({id:'plant.b03b.explodenut.idle',frames:_enFrames,loop:true,source:{kind:'tinted-wallnut',asset:'explodenut'},layers:{body:{asset:'plant.b03b.asset.explodenut',z:0,pixelScale:.92/Math.max(65,73),pivotX:.5,pivotY:.70,tracks:{frameIndex:s7B02BFrameTrack(_enDur,_enFrames,true)}}}});
      S7_B03B_DEFAULT_CLIPS.explodenut='plant.b03b.explodenut.idle';
    }
    s7RegisterB03BP0Plants();

    /* ============================================================================
     * B03C baseline real-sprite coverage for ten more source-backed plants.
     * Includes Chomper / Garlic / Scaredy state variants and mushroom sleep clips.
     * ========================================================================== */
    const S7_B03C_MANIFEST = {"chomper":{"file":"chomper.png","frameWidth":130,"frameHeight":114,"columns":8,"frameCount":13,"durations":[180,180,180,180,180,180,180,180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Chomper/Chomper.gif"},"chomper_attack":{"file":"chomper_attack.png","frameWidth":130,"frameHeight":114,"columns":8,"frameCount":9,"durations":[90,90,90,90,90,90,180,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Chomper/ChomperAttack.gif"},"chomper_digest":{"file":"chomper_digest.png","frameWidth":130,"frameHeight":114,"columns":6,"frameCount":6,"durations":[180,180,180,180,180,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Chomper/ChomperDigest.gif"},"garlic":{"file":"garlic.png","frameWidth":60,"frameHeight":59,"columns":8,"frameCount":12,"durations":[90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Garlic/Garlic.gif"},"garlic_d2":{"file":"garlic_d2.png","frameWidth":60,"frameHeight":59,"columns":1,"frameCount":1,"durations":[0],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Garlic/Garlic_body2.gif"},"garlic_d3":{"file":"garlic_d3.png","frameWidth":60,"frameHeight":59,"columns":1,"frameCount":1,"durations":[0],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Garlic/Garlic_body3.gif"},"scaredy":{"file":"scaredy.png","frameWidth":57,"frameHeight":81,"columns":8,"frameCount":17,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/ScaredyShroom/ScaredyShroom.gif"},"scaredy_sleep":{"file":"scaredy_sleep.png","frameWidth":57,"frameHeight":81,"columns":8,"frameCount":16,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/ScaredyShroom/ScaredyShroomSleep.gif"},"scaredy_cry":{"file":"scaredy_cry.png","frameWidth":57,"frameHeight":81,"columns":8,"frameCount":11,"durations":[90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/ScaredyShroom/ScaredyShroomCry.gif"},"sunflower":{"file":"sunflower.png","frameWidth":73,"frameHeight":74,"columns":8,"frameCount":18,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SunFlower/SunFlower.gif"},"sunshroom":{"file":"sunshroom.png","frameWidth":59,"frameHeight":61,"columns":8,"frameCount":10,"durations":[100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SunShroom/SunShroom.gif"},"sunshroom_sleep":{"file":"sunshroom_sleep.png","frameWidth":59,"frameHeight":61,"columns":8,"frameCount":14,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/SunShroom/SunShroomSleep.gif"},"hypno":{"file":"hypno.png","frameWidth":68,"frameHeight":76,"columns":8,"frameCount":15,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/HypnoShroom/HypnoShroom.gif"},"hypno_sleep":{"file":"hypno_sleep.png","frameWidth":71,"frameHeight":80,"columns":8,"frameCount":13,"durations":[100,100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/HypnoShroom/HypnoShroomSleep.gif"},"iceshroom":{"file":"iceshroom.png","frameWidth":83,"frameHeight":75,"columns":8,"frameCount":11,"durations":[100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/IceShroom/IceShroom.gif"},"iceshroom_sleep":{"file":"iceshroom_sleep.png","frameWidth":83,"frameHeight":75,"columns":8,"frameCount":12,"durations":[100,100,100,100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/IceShroom/IceShroomSleep.gif"},"kelp":{"file":"kelp.png","frameWidth":90,"frameHeight":72,"columns":1,"frameCount":1,"durations":[0],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/TangleKlep/TangleKlep.gif"},"torchwood":{"file":"torchwood.png","frameWidth":73,"frameHeight":87,"columns":8,"frameCount":9,"durations":[100,100,100,100,100,100,100,100,100],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Torchwood/Torchwood.gif"},"plantern":{"file":"plantern.png","frameWidth":86,"frameHeight":88,"columns":8,"frameCount":19,"durations":[90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],"source":"/mnt/data/jspvz_src/jspvz/images/Plants/Plantern/Plantern.gif"}};
    const S7_B03C_DEFAULT_CLIPS = Object.create(null);
    const S7_B03C_SLEEP_CLIPS = Object.create(null);
    const S7_B03C_STATE_CLIPS = Object.create(null);

    function s7RegisterB03CPlants() {
      const root='./assets/plants_b03c/';
      for(const [key,m] of Object.entries(S7_B03C_MANIFEST))
        S7_SPRITES.register(`plant.b03c.asset.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      function clip(sourceKey,clipId,opt={}) {
        const m=S7_B03C_MANIFEST[sourceKey];
        const total=m.durations.reduce((a,b)=>a+b,0); const frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        const px=finiteNumber(opt.pixelScale,.94/Math.max(m.frameWidth,m.frameHeight));
        S7_ANIM.registerClip({id:clipId,frames,loop:opt.loop!==false,source:{kind:'jspvz-atlas',asset:sourceKey},
          layers:{body:{asset:`plant.b03c.asset.${sourceKey}`,z:0,pixelScale:px,pivotX:.5,pivotY:finiteNumber(opt.pivotY,.72),tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,opt.loop!==false)}}}});
        return clipId
      }
      for(const key of ['chomper','garlic','scaredy','sunflower','sunshroom','hypno','iceshroom','kelp','torchwood','plantern'])
        S7_B03C_DEFAULT_CLIPS[key]=clip(key,`plant.b03c.${key}.idle`);
      S7_B03C_STATE_CLIPS.chomperAttack=clip('chomper_attack','plant.b03c.chomper.attack',{loop:false});
      S7_B03C_STATE_CLIPS.chomperDigest=clip('chomper_digest','plant.b03c.chomper.digest');
      S7_B03C_STATE_CLIPS.garlicD2=clip('garlic_d2','plant.b03c.garlic.d2');
      S7_B03C_STATE_CLIPS.garlicD3=clip('garlic_d3','plant.b03c.garlic.d3');
      S7_B03C_STATE_CLIPS.scaredyCry=clip('scaredy_cry','plant.b03c.scaredy.cry');
      S7_B03C_SLEEP_CLIPS.scaredy=clip('scaredy_sleep','plant.b03c.scaredy.sleep');
      S7_B03C_SLEEP_CLIPS.sunshroom=clip('sunshroom_sleep','plant.b03c.sunshroom.sleep');
      S7_B03C_SLEEP_CLIPS.hypno=clip('hypno_sleep','plant.b03c.hypno.sleep');
      S7_B03C_SLEEP_CLIPS.iceshroom=clip('iceshroom_sleep','plant.b03c.iceshroom.sleep')
    }
    s7RegisterB03CPlants();

    /* ============================================================================
     * B03D video-derived active skill animations.
     * Source: 7月25日(3).mov, exact 49-plant almanac order.
     * Each clip is the highest-motion ~2s window from its source plant segment.
     * Custom S7-only identities are NOT silently mapped to unrelated PvZ plants.
     * Kernel-pult stays on the higher-quality B02A layered EventTrack implementation.
     * ========================================================================== */
    const S7_VIDEO_SKILL_MANIFEST = {"blover":{"index":27,"file":"27_blover.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[188.0,192.8],"selected":[190.97,192.77]},"cabbagepult":{"index":32,"file":"32_cabbagepult.png","frameWidth":429,"frameHeight":326,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[229.2,231.2],"selected":[229.2,231.2]},"cactus":{"index":26,"file":"26_cactus.png","frameWidth":335,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[179.2,186.6],"selected":[184.57,186.37]},"cattail":{"index":43,"file":"43_cattail.png","frameWidth":353,"frameHeight":269,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[295.4,298.2],"selected":[296.37,298.17]},"chomper":{"index":6,"file":"06_chomper.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[48.6,56.2],"selected":[50.97,52.77]},"fumeshroom":{"index":10,"file":"10_fumeshroom.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[73.8,79.0],"selected":[75.77,77.57]},"garlic":{"index":36,"file":"36_garlic.png","frameWidth":295,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[255.0,257.8],"selected":[255.57,257.37]},"gatlingpea":{"index":40,"file":"40_gatlingpea.png","frameWidth":430,"frameHeight":309,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[276.6,284.2],"selected":[281.17,282.97]},"gloomshroom":{"index":42,"file":"42_gloomshroom.png","frameWidth":350,"frameHeight":302,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[289.0,294.4],"selected":[292.57,294.37]},"goldmagnet":{"index":45,"file":"45_goldmagnet.png","frameWidth":430,"frameHeight":358,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[307.6,313.8],"selected":[310.77,312.57]},"hypnoshroom":{"index":12,"file":"12_hypnoshroom.png","frameWidth":310,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[85.0,88.2],"selected":[85.37,87.17]},"iceshroom":{"index":14,"file":"14_iceshroom.png","frameWidth":382,"frameHeight":353,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[97.6,100.6],"selected":[98.77,100.57]},"imitater":{"index":48,"file":"48_imitater.png","frameWidth":270,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[328.4,330.8],"selected":[328.97,330.77]},"magnetshroom":{"index":31,"file":"31_magnetshroom.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[216.6,227.6],"selected":[220.77,222.57]},"marigold":{"index":38,"file":"38_marigold.png","frameWidth":296,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[263.8,267.8],"selected":[264.17,265.97]},"melonpult":{"index":39,"file":"39_melonpult.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[269.6,275.4],"selected":[271.97,273.77]},"plantern":{"index":25,"file":"25_plantern.png","frameWidth":402,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[174.6,177.6],"selected":[175.77,177.57]},"potatomine":{"index":4,"file":"04_potatomine.png","frameWidth":418,"frameHeight":353,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[32.4,37.0],"selected":[32.77,34.57]},"puffshroom":{"index":8,"file":"08_puffshroom.png","frameWidth":185,"frameHeight":183,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[62.0,65.8],"selected":[62.57,64.37]},"repeater":{"index":7,"file":"07_repeater.png","frameWidth":388,"frameHeight":306,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[57.4,60.6],"selected":[57.77,59.57]},"scaredyshroom":{"index":13,"file":"13_scaredyshroom.png","frameWidth":293,"frameHeight":336,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[89.4,96.2],"selected":[91.37,93.17]},"seashroom":{"index":24,"file":"24_seashroom.png","frameWidth":236,"frameHeight":243,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[165.2,172.8],"selected":[166.77,168.57]},"snowpea":{"index":5,"file":"05_snowpea.png","frameWidth":324,"frameHeight":324,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[39.0,47.4],"selected":[45.57,47.37]},"spikerock":{"index":46,"file":"46_spikerock.png","frameWidth":430,"frameHeight":274,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[315.0,317.2],"selected":[315.37,317.17]},"splitpea":{"index":28,"file":"28_splitpea.png","frameWidth":407,"frameHeight":209,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[194.4,205.2],"selected":[199.37,201.17]},"squash":{"index":17,"file":"17_squash.png","frameWidth":430,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[116.2,122.0],"selected":[120.17,121.97]},"starfruit":{"index":29,"file":"29_starfruit.png","frameWidth":374,"frameHeight":340,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[206.8,209.8],"selected":[207.57,209.37]},"sunflower":{"index":1,"file":"01_sunflower.png","frameWidth":315,"frameHeight":315,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[16.6,21.4],"selected":[17.17,18.97]},"sunshroom":{"index":9,"file":"09_sunshroom.png","frameWidth":268,"frameHeight":269,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[67.2,72.2],"selected":[69.37,71.17]},"tanglekelp":{"index":19,"file":"19_tanglekelp.png","frameWidth":430,"frameHeight":298,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[137.6,141.8],"selected":[138.37,140.17]},"threepeater":{"index":18,"file":"18_threepeater.png","frameWidth":336,"frameHeight":289,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[123.6,135.8],"selected":[128.77,130.57]},"umbrellaleaf":{"index":37,"file":"37_umbrellaleaf.png","frameWidth":401,"frameHeight":360,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[259.2,261.4],"selected":[259.57,261.37]},"wintermelon":{"index":44,"file":"44_wintermelon.png","frameWidth":359,"frameHeight":346,"columns":5,"frameCount":10,"durations":[200,200,200,200,200,200,200,200,200,200],"segment":[300.6,306.2],"selected":[302.57,304.37]}};
    const S7_VIDEO_SKILL_SOURCE_BY_PLANT = {"cactus":"cactus","chomper":"chomper","garlic":"garlic","spikerock":"spikerock","snowpea":"snowpea","repeater":"repeater","puff":"puffshroom","scaredy":"scaredyshroom","squash":"squash","threepeater":"threepeater","seashroom":"seashroom","splitpea":"splitpea","cabbage":"cabbagepult","cattail":"cattail","sunshroom":"sunshroom","hypno":"hypnoshroom","iceshroom":"iceshroom","kelp":"tanglekelp","plantern":"plantern","blover":"blover","magnet":"magnetshroom","umbrella":"umbrellaleaf","marigold":"marigold","goldmagnet":"goldmagnet","barley":"imitater","starfruit":"starfruit","fume":"fumeshroom","gloom":"gloomshroom","potato":"potatomine","melon":"melonpult","gatling":"gatlingpea","winter":"wintermelon"};
    const S7_VIDEO_SKILL_CLIPS = Object.create(null);
    function s7RegisterVideoSkillClips() {
      const root='./assets/plants_video_skills/';
      for(const [sourceKey,m] of Object.entries(S7_VIDEO_SKILL_MANIFEST)) {
        const asset=`plant.video.skill.asset.${sourceKey}`;
        S7_SPRITES.register(asset,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      }
      for(const [plantKey,sourceKey] of Object.entries(S7_VIDEO_SKILL_SOURCE_BY_PLANT)) {
        const m=S7_VIDEO_SKILL_MANIFEST[sourceKey], asset=`plant.video.skill.asset.${sourceKey}`;
        const total=m.durations.reduce((a,b)=>a+b,0), frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
        const clipId=`plant.video.skill.${plantKey}`;
        const px=Math.min(.0105,.94/Math.max(1,m.frameWidth,m.frameHeight));
        S7_ANIM.registerClip({id:clipId,frames,loop:true,source:{kind:'source-video-active-window',file:'7月25日(3).mov',segment:m.segment,selected:m.selected,sourceKey},layers:{body:{asset,z:0,pixelScale:px,pivotX:.5,pivotY:.72,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,true)}}}});
        S7_VIDEO_SKILL_CLIPS[plantKey]=clipId;
      }
    }
    s7RegisterVideoSkillClips();

    const S7_CACTUS_NORMAL_ATTACK = Object.freeze({
      file:'26_cactus_normal.png',frameWidth:335,frameHeight:360,columns:5,frameCount:10,
      durations:[110,110,110,110,110,110,110,110,110,110],segment:[180.0,182.25],
      source:'7月25日(1).mov'
    });
    function s7RegisterCactusNormalAttack() {
      const m=S7_CACTUS_NORMAL_ATTACK;
      const asset='plant.video.skill.asset.cactusNormal';
      S7_SPRITES.register(asset,'./assets/plants_video_skills/'+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      const total=m.durations.reduce((a,b)=>a+b,0);
      const frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
      const clipId='plant.video.skill.cactusNormal';
      S7_ANIM.registerClip({id:clipId,frames,loop:false,source:{kind:'source-video-normal-cactus-attack',file:m.source,segment:m.segment},
        layers:{body:{asset,z:0,pixelScale:.94/Math.max(m.frameWidth,m.frameHeight),pivotX:.5,pivotY:.72,tracks:{frameIndex:s7B03BNormalizedFrameTrack(m.durations,frames,false)}}}});
      S7_VIDEO_SKILL_CLIPS.cactusNormal=clipId
    }
    s7RegisterCactusNormalAttack();

    /* ============================================================================
     * B05E：7月25日(4).mov 双片段植物接口。
     * 仅用于 JSPVZ/B03A-C 没有待机动画、但视频中同时存在待机与技能段的植物。
     * 待机与技能离线使用同一个固定根锚点和同一缩放/平移，不按动作帧特效重新居中。
     * ========================================================================== */
    const S7_VIDEO_DUAL_MANIFEST = Object.freeze({
      magnet:{idleFile:'magnet_idle.png',skillFile:'magnet_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[250,250,250,250,250,250,250,250,250,250],skillDurations:[635,635,635,635,635,635,635,635,635,635],pixelScale:0.003066667,pivotX:0.5,pivotY:0.875,skillDuration:6.35,sourceKey:'magnetshroom'},
      cabbage:{idleFile:'cabbage_idle.png',skillFile:'cabbage_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[330,330,330,330,330,330,330,330,330,330],skillDurations:[245,245,245,245,245,245,245,245,245,245],pixelScale:0.003630508,pivotX:0.5,pivotY:0.875,skillDuration:2.45,sourceKey:'cabbagepult'},
      umbrella:{idleFile:'umbrella_idle.png',skillFile:'umbrella_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[105,105,105,105,105,105,105,105,105,105],skillDurations:[90,90,90,90,90,90,90,90,90,90],pixelScale:0.020768834,pivotX:0.5,pivotY:0.875,skillDuration:0.9,sourceKey:'umbrellaleaf'},
      marigold:{idleFile:'marigold_idle.png',skillFile:'marigold_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[130,130,130,130,130,130,130,130,130,130],skillDurations:[65,65,65,65,65,65,65,65,65,65],pixelScale:0.003562432,pivotX:0.5,pivotY:0.875,skillDuration:0.65,sourceKey:'marigold'},
      melon:{idleFile:'melon_idle.png',skillFile:'melon_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[305,305,305,305,305,305,305,305,305,305],skillDurations:[255,255,255,255,255,255,255,255,255,255],pixelScale:0.003456284,pivotX:0.5,pivotY:0.875,skillDuration:2.55,sourceKey:'melonpult'},
      cattail:{idleFile:'cattail_idle.png',skillFile:'cattail_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[150,150,150,150,150,150,150,150,150,150],skillDurations:[90,90,90,90,90,90,90,90,90,90],pixelScale:0.003517457,pivotX:0.5,pivotY:0.875,skillDuration:0.9,sourceKey:'cattail'},
      winter:{idleFile:'winter_idle.png',skillFile:'winter_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[305,305,305,305,305,305,305,305,305,305],skillDurations:[235,235,235,235,235,235,235,235,235,235],pixelScale:0.003564478,pivotX:0.5,pivotY:0.875,skillDuration:2.35,sourceKey:'wintermelon'},
      goldmagnet:{idleFile:'goldmagnet_idle.png',skillFile:'goldmagnet_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[480,480,480,480,480,480,480,480,480,480],skillDurations:[110,110,110,110,110,110,110,110,110,110],pixelScale:0.002453334,pivotX:0.5,pivotY:0.875,skillDuration:1.1,sourceKey:'goldmagnet'},
      barley:{idleFile:'barley_idle.png',skillFile:'barley_skill.png',frameWidth:640,frameHeight:640,columns:5,frameCount:10,idleDurations:[100,100,100,100,100,100,100,100,100,100],skillDurations:[95,95,95,95,95,95,95,95,95,95],pixelScale:0.003066667,pivotX:0.5,pivotY:0.875,skillDuration:0.95,sourceKey:'imitater'}
    });
    const S7_VIDEO_DUAL_CLIPS = Object.freeze({idle:Object.create(null),skill:Object.create(null)});
    function s7RegisterVideoDualClips() {
      const root='./assets/plants_video_dual/';
      for (const [plantKey,m] of Object.entries(S7_VIDEO_DUAL_MANIFEST)) {
        const idleAsset=`plant.video.dual.asset.${plantKey}.idle`;
        const skillAsset=`plant.video.dual.asset.${plantKey}.skill`;
        S7_SPRITES.register(idleAsset,root+m.idleFile,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        S7_SPRITES.register(skillAsset,root+m.skillFile,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
        const makeClip=(mode,asset,durations,loop)=>{
          const total=durations.reduce((a,b)=>a+Math.max(1,finiteNumber(b,100)),0);
          const frames=Math.max(1,Math.round(total/(S7_ANIMATION_FIXED_DT*1000)));
          const clipId=`plant.video.dual.${plantKey}.${mode}`;
          S7_ANIM.registerClip({
            id:clipId,frames,loop,
            source:{kind:'source-video-dual-fixed-root',file:'7月25日(4).mov',sourceKey:m.sourceKey,mode},
            layers:{body:{asset,z:0,pixelScale:m.pixelScale,pivotX:m.pivotX,pivotY:m.pivotY,tracks:{frameIndex:s7B03BNormalizedFrameTrack(durations,frames,loop)}}}
          });
          S7_VIDEO_DUAL_CLIPS[mode][plantKey]=clipId;
        };
        makeClip('idle',idleAsset,m.idleDurations,true);
        makeClip('skill',skillAsset,m.skillDurations,false);
      }
    }
    s7RegisterVideoDualClips();
    function s7HasVideoDualPlant(key) { return !!S7_VIDEO_DUAL_MANIFEST[key] }

    /* ============================================================================
     * B05D visual normalization + dual animation interfaces
     * ========================================================================== */
    const S7_ENTITY_VISUAL_SCALE = {
      // Layer 1 / 整体大小：同一植物/僵尸所有动画共享的基础倍率。
      // 这里只放“整体基准”，不要再掺杂死亡动画或单动画补丁。
      plant:{
        wallnut:1.147,tallnut:1.294,cactus:1.100,explodenut:1.147,chomper:1.144,garlic:1.105,
        spikerock:.820,snowpea:1.198,repeater:1.176,puff:.852,scaredy:1.341,squash:1.440,
        threepeater:1.246,seashroom:1.09536,splitpea:1.060,cabbage:1.8915,cattail:1.036,
        firelotus:.7625,reverseRepeater:1.0584,ghost:1.000,sniper:1.040,sunflower:1.171,
        sunshroom:1.069,hypno:1.255,iceshroom:1.025,kelp:.996,torchwood:1.270,
        plantern:1.223,blover:1.464,magnet:.981,kernel:.896875,umbrella:1.016,
        marigold:1.0488,goldmagnet:.7632,timegrass:1.222,barley:1.300,starfruit:1.126,
        fume:1.077,gloom:1.012,potato:.63375,melon:1.230625,gatling:1.181,winter:1.215725
      },
      zombie:{
        normal:1.2,flag:1.2,ducky:1.2,snorkel:1.2,bobsled:.6,bobsledSled:1.125,imp:.8,backup:1.2,
        peaz:1,gatlingz:1,squashz:1,jalapenoz:1,blind:1,cone:1.2,bucket:1.2,newspaper:.8,
        screen:1.2,football:1.2,digger:.4*.6,pogo:1,pole:1.2,jack:1.2,ladder:1.667*.6,dolphin:1.2,dancer:1.2,
        balloon:1,wallz:1,tallz:1,zomboni:1.8,yeti:1,catapult:1.5,bungee:1,garg:1,giga:1,
        immortal:1.2,bombdoor:2,blackolive:2,polecmd:2,warflag:2,tacticflag:2
      },
      bullet:{pea:.86,miniPea:.78,ice:.86,fire:.9,star:.44,pult:.92,kernel:.92,butter:.92,melon:1.0,winter:1.0,cattail:.82,cattailSmall:.75,cactus:.82,firelotus:2.4}
    };
    // Layer 0 / 死亡动画大小：命中后直接返回最终倍率，完全独立于整体大小和单动画大小。
    // 规则：
    //   1) 先看 clip 级精确覆写；
    //   2) 再看实体级死亡基准；
    //   3) 若仍未命中，但当前快照属于死亡动画，则回退到“整体大小”当前值，
    //      这样旧有已调好的死亡体型不会因为重构而丢失；
    //   4) 一旦进入 Layer 0，就不再叠乘 Layer 1/2。
    const S7_DEATH_ANIMATION_VISUAL_SCALE = Object.freeze({
      plant: Object.freeze({
        byClip: Object.freeze({}),
        byKey: Object.freeze({})
      }),
      zombie: Object.freeze({
        byClip: Object.freeze({
          'zombie.b04a.die': 1.2,
          'zombie.b04a.head.drop': 1.2
        }),
        byType: Object.freeze({
          flag: 1.2,
          newspaper: .8,
          balloon: 1,
          bobsled: .6,
          digger: .24,
          pogo: 1,
          yeti: 1,
          garg: 1,
          giga: 1
        })
      })
    });
    // Layer 2 / 单个动画大小：只影响一个 clip，自身倍率乘在整体倍率之后。
    const S7_SINGLE_ANIMATION_VISUAL_SCALE = Object.freeze({
      plant: Object.freeze({
        byClip: Object.freeze({}),
        byState: Object.freeze({})
      }),
      zombie: Object.freeze({
        byClip: Object.freeze({
          'zombie.b05b.ducky.attack': .6,
          'zombie.b05b.snorkel.dive': .6,
          'zombie.b05b.snorkel.attack': .8,
          'zombie.final.balloon_fly': 1,
          'zombie.final.balloon_walk': .2,
          // 扶梯整体已经缩为 3/5；仅新增的“带梯走路”恢复到缩放前大小。
          'zombie.final.ladder_carry': 1 / .6
        }),
        byState: Object.freeze({})
      })
    });
    const S7_TIMELINE_ZOMBIE_SIZE_TIERS = Object.freeze({
      giantCharged: 1,
      giantNormal: 2,
      giantHuge: 3
    });
    function s7TimelineZombieSizeTier(entity) {
      if (!entity) return 1;
      if (!entity.flags?.garg) return 1;
      // 巨大化优先级最高；当前规则中巨大化巨人不会再获得突进，但这里仍保持防御性顺序。
      if (entity.s7?.superGiga || entity.s7?.hugeGarg) return S7_TIMELINE_ZOMBIE_SIZE_TIERS.giantHuge;
      if (entity.s7?.charged) return S7_TIMELINE_ZOMBIE_SIZE_TIERS.giantCharged;
      return S7_TIMELINE_ZOMBIE_SIZE_TIERS.giantNormal;
    }
    function s7VisualScaleMultiplier(kind, entity, layerName='') {
      const key = kind==='plant' ? entity?.key : kind==='zombie' ? entity?.type : entity?.kind;
      const table = S7_ENTITY_VISUAL_SCALE[kind] || null;
      let m = table && key && table[key] != null ? table[key] : 1;
      if (kind==='zombie' && entity?.flags?.garg) {
        // 巨人体系的大小仍属于“整体大小”层。
        m *= s7TimelineZombieSizeTier(entity);
      }
      const minScale = kind === 'bullet' ? .05 : .5;
      return Math.max(minScale, Math.min(6, finiteNumber(m,1)));
    }
    function s7IsDeathAnimationSnapshot(snapshot) {
      const state = String(snapshot?.state || '');
      const clipId = String(snapshot?.clipId || '');
      return state === 'die' || state === 'head.drop' || state === 'ash' || /(?:^|[._])death(?:$|[._])/i.test(clipId);
    }
    function s7DeathAnimationScale(kind, entity, snapshot, layerName='') {
      const config = S7_DEATH_ANIMATION_VISUAL_SCALE[kind] || null;
      if (!config || !snapshot || !s7IsDeathAnimationSnapshot(snapshot)) return null;
      const clipId = String(snapshot?.clipId || '');
      const key = kind === 'plant' ? entity?.key : kind === 'zombie' ? entity?.type : entity?.kind;
      let scale = null;
      let usedOverallFallback = false;
      if (clipId && config.byClip && config.byClip[clipId] != null) scale = config.byClip[clipId];
      else if (key && ((kind === 'plant' && config.byKey && config.byKey[key] != null) || (kind === 'zombie' && config.byType && config.byType[key] != null))) {
        scale = kind === 'plant' ? config.byKey[key] : config.byType[key];
      }
      else {
        // 安全回退：所有死亡动画都走 Layer 0；若未显式列出，则沿用当前整体大小作为死亡基准，
        // 但不再叠乘单动画大小，从而确保“死亡动画大小独立于后两层”。
        scale = s7VisualScaleMultiplier(kind, entity, layerName);
        usedOverallFallback = true;
      }
      if (kind === 'zombie' && entity?.flags?.garg && !usedOverallFallback && !(clipId && config.byClip && config.byClip[clipId] != null)) {
        // 巨人体系的巨大化/突进体型在死亡动画里也要保留。
        scale *= s7TimelineZombieSizeTier(entity);
      }
      return Math.max(.05, Math.min(12, finiteNumber(scale, 1)));
    }
    function s7SingleAnimationScaleMultiplier(kind, entity, snapshot) {
      const config = S7_SINGLE_ANIMATION_VISUAL_SCALE[kind] || null;
      if (!config) return 1;
      const clipId = String(snapshot?.clipId || '');
      if (clipId && config.byClip && config.byClip[clipId] != null) {
        return Math.max(.05, Math.min(12, finiteNumber(config.byClip[clipId], 1)));
      }
      const state = String(snapshot?.state || '');
      if (state && config.byState && config.byState[state] != null) {
        return Math.max(.05, Math.min(12, finiteNumber(config.byState[state], 1)));
      }
      return 1;
    }
    function s7VisualScaleBreakdown(kind, entity, snapshot, layerName='') {
      const death = s7DeathAnimationScale(kind, entity, snapshot, layerName);
      if (death != null) return { death, overall: 1, single: 1, final: death };
      const overall = s7VisualScaleMultiplier(kind, entity, layerName);
      const single = s7SingleAnimationScaleMultiplier(kind, entity, snapshot);
      return {
        death: null,
        overall,
        single,
        final: Math.max(.05, Math.min(12, finiteNumber(overall * single, 1)))
      };
    }

    const S7_CUSTOM_PLANT_MANIFEST = {
      firelotus:{file:'firelotus_sprite.png',frameWidth:352,frameHeight:316,columns:1,frameCount:1},
      timegrassPortal:{file:'timegrass_portal_sprite.png',frameWidth:256,frameHeight:256,columns:5,frameCount:5}
    };
    function s7RegisterCustomPlantAssets() {
      const root='./assets/custom_plants/';
      for (const [key,m] of Object.entries(S7_CUSTOM_PLANT_MANIFEST)) {
        S7_SPRITES.register(`plant.custom.${key}`, root + m.file, {frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.frameCount});
      }
      S7_ANIM.registerClip({id:'plant.custom.firelotus',frames:10,loop:true,source:{kind:'user-special-plant',asset:'firelotus'},layers:{body:{asset:'plant.custom.firelotus',z:0,pixelScale:.0028,pivotX:.5,pivotY:.82,tracks:{frameIndex:[{frame:0,value:0,hold:true}]}}}});
    }
    s7RegisterCustomPlantAssets();

    /* ============================================================================
     * B05D user-grid plant sprite interface.
     * This interface is ONLY for user-provided 4x2 whole-plant sheets.
     * Files are normalized offline to fixed 256x256 cells, so runtime never performs
     * alpha-bbox recentering and attack effects cannot drag the whole plant.
     * Existing JSPVZ/video/layered assets continue through S7_ANIM + s7DrawLayeredSprite.
     * ========================================================================== */
    const S7_USER_GRID_PLANT_MANIFEST = Object.freeze({
      sniper:{file:'sniper_normalized.png',frameWidth:256,frameHeight:256,columns:4,rows:2,idle:[0,1,2,3],action:[4,5,6,7],idleFps:5.2,actionDuration:.52,scale:1.10,pivotY:.80,offsetX:0,offsetY:-.015},
      ghost:{file:'ghost_normalized.png',frameWidth:256,frameHeight:256,columns:4,rows:2,idle:[0,1,2,3],action:[4,5,6,7],idleFps:4.8,actionDuration:.72,scale:1.06,pivotY:.80,offsetX:0,offsetY:-.015},
      timegrass:{file:'timegrass_normalized.png',frameWidth:256,frameHeight:256,columns:4,rows:2,idle:[0,1,2,3],action:[4,5,6,7],idleFps:4.6,actionDuration:.82,scale:1.00,pivotY:.80,offsetX:0,offsetY:-.015}
    });
    function s7RegisterUserGridPlantAssets() {
      const root='./assets/user_grid_plants/';
      for (const [key,m] of Object.entries(S7_USER_GRID_PLANT_MANIFEST)) {
        S7_SPRITES.register(`plant.usergrid.${key}`,root+m.file,{frameWidth:m.frameWidth,frameHeight:m.frameHeight,columns:m.columns,frameCount:m.columns*m.rows})
      }
    }
    s7RegisterUserGridPlantAssets();
    function s7HasUserGridPlant(key) { return !!S7_USER_GRID_PLANT_MANIFEST[key] }
    function s7TriggerUserGridPlantAction(p, seconds) {
      if (!p || !s7HasUserGridPlant(p.key)) return false;
      const m=S7_USER_GRID_PLANT_MANIFEST[p.key];
      p.s7=p.s7||{};
      const duration=Math.max(S7_ANIMATION_FIXED_DT,finiteNumber(seconds,m.actionDuration));
      p.s7.userGridActionDuration=duration;
      p.s7.userGridActionTimer=Math.max(finiteNumber(p.s7.userGridActionTimer,0),duration);
      return true
    }
    function s7UserGridPlantFrame(p,m) {
      const timer=Math.max(0,finiteNumber(p?.s7?.userGridActionTimer,0));
      const action=finiteArray(m.action);
      if (timer>0 && action.length) {
        const duration=Math.max(S7_ANIMATION_FIXED_DT,finiteNumber(p.s7?.userGridActionDuration,m.actionDuration));
        const progress=clamp(1-timer/duration,0,.999999);
        return action[Math.min(action.length-1,Math.floor(progress*action.length))]
      }
      const idle=finiteArray(m.idle);
      if (!idle.length) return 0;
      const clock=Math.max(0,finiteNumber(p?.age,finiteNumber(state?.time,0)));
      return idle[Math.floor(clock*Math.max(.1,finiteNumber(m.idleFps,5)))%idle.length]
    }
    function s7DrawUserGridPlant(ctx2d,p,x,y,cell) {
      const m=S7_USER_GRID_PLANT_MANIFEST[p?.key];
      if (!m || s7AnimationRenderMode!==S7_ANIMATION_RENDER_MODES.TIMELINE) return false;
      const img=S7_SPRITES.image(`plant.usergrid.${p.key}`);
      if (!(img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0)) return false;
      const frame=Math.max(0,Math.min(m.columns*m.rows-1,Math.floor(s7UserGridPlantFrame(p,m))));
      const sx=(frame%m.columns)*m.frameWidth,sy=Math.floor(frame/m.columns)*m.frameHeight;
      const visualScale=s7VisualScaleMultiplier('plant',p,'body');
      const size=Math.max(1,cell*Math.max(.1,finiteNumber(m.scale,1))*visualScale);
      ctx2d.save();
      ctx2d.imageSmoothingEnabled=false;
      ctx2d.translate(x+finiteNumber(m.offsetX,0)*cell,y+finiteNumber(m.offsetY,0)*cell);
      ctx2d.drawImage(img,sx,sy,m.frameWidth,m.frameHeight,-size*.5,-size*finiteNumber(m.pivotY,.8),size,size);
      ctx2d.restore();
      return true
    }
    function s7MarkPlantSkillVisual(p, seconds=null, visualKey=null) {
      if(!p) return;
      const key=visualKey || p.key;
      if((!S7_VIDEO_SKILL_CLIPS[key] && !S7_VIDEO_DUAL_CLIPS.skill[key]) || key==='kernel') return;
      const dual=S7_VIDEO_DUAL_MANIFEST[key];
      const duration=seconds==null ? finitePositive(dual?.skillDuration,1.10) : Math.max(S7_ANIMATION_FIXED_DT,finiteNumber(seconds,1.10));
      p.s7=p.s7||{};
      p.s7.videoSkillKey=key;
      p.s7.videoSkillTimer=Math.max(finiteNumber(p.s7.videoSkillTimer,0),duration);
    }
