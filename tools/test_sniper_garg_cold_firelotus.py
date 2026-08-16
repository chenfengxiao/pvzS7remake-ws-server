from playwright.sync_api import sync_playwright
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
html=(root/'dist/S7_FAST_ENTRY.html').read_text()
html=html.replace('const QUAD_DOCUMENT_BASE = new URL(".", location.href).href;', 'const QUAD_DOCUMENT_BASE = "https://example.invalid/game/";')
test_js=r'''
<script>
(() => {
  const results=[];
  const fail=(msg)=>{throw new Error(msg)};
  const eq=(a,b,msg)=>{if(a!==b) fail(`${msg}: ${a} !== ${b}`)};
  const close=(a,b,msg,eps=1e-7)=>{if(Math.abs(a-b)>eps) fail(`${msg}: ${a} != ${b}`)};
  const ok=(v,msg)=>{if(!v) fail(msg)};
  const test=(name,fn)=>{try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:String(e&&e.stack||e)})}};
  const clearState=()=>{
    if(!state) newState(false);
    state.running=false;
    state.paused=true;
    state.zombies.length=0;
    state.plants.length=0;
    state.bullets.length=0;
    if(state.effects) state.effects.length=0;
    if(state.turrets) state.turrets.length=0;
    if(state.s7){
      state.s7.commands={push:0,break:0,raid:0,ranged:0,summon:0};
      state.s7.commandsByRow=Array.from({length:ROWS},()=>({push:0,break:0,raid:0,ranged:0,summon:0}));
      state.s7.maxSniperThreat={};
    }
    for(const t of state.teams||[]) if(t) t.alive=true;
  };
  const plainZombie=(over={})=>({
    id:over.id||Math.floor(Math.random()*1e9), type:'normal', row:0, x:7, hp:270, maxHp:270,
    dead:false, dying:false, friendly:false, blind:false, armors:[], flags:{}, s7:{},
    landingInvuln:0, air:false, underground:false, diving:false, ...over,
    flags:{...(over.flags||{})}, s7:{...(over.s7||{})}, armors:[...(over.armors||[])]
  });
  try { layout.cell=80; } catch(e) {}

  test('sniper config and experience group',()=>{
    eq(PLANT_RULES.sniper.group,'mid','group');
    eq(EXP_GROUPS.mid[1],750,'lv1 exp');
    eq(EXP_GROUPS.mid[2],2250,'lv2 exp');
    eq(EXP_GROUPS.mid[3],3750,'lv3 exp');
    eq(EXP_GROUPS.mid[4],6000,'lv4 exp');
    eq(EXP_GROUPS.mid[5],11250,'lv5 exp');
    eq(PLANT_RULES.sniper.hp[0],300,'lv0 hp');
    for(let i=1;i<=5;i++) eq(PLANT_RULES.sniper.hp[i],550,`lv${i} hp`);
    eq(PLANT_RULES.sniper.cd[0],7.5,'lv0 cd');
    eq(PLANT_RULES.sniper.cd[3],7.5,'lv3 base cd');
    eq(PLANT_RULES.sniper.cd[4],5.5,'lv4 base cd');
  });

  test('sniper five-layer threat values',()=>{
    clearState();
    close(s7SniperThreat(plainZombie(),2.5),9270,'ordinary far');
    close(s7SniperThreat(plainZombie({x:3.5}),2.5),15270,'within 100px');
    close(s7SniperThreat(plainZombie({type:'zomboni'}),2.5),12270,'special type');
    close(s7SniperThreat(plainZombie({type:'jalapenoz',jalapenoCd:4.9}),2.5),24270,'jalapeno countdown');
    close(s7SniperThreat(plainZombie({type:'imp',flyingImp:true}),2.5),15270,'imp flying');
    close(s7SniperThreat(plainZombie({s7:{variant:true}}),2.5),9270,'variant');
    close(s7SniperThreat(plainZombie({blind:true}),2.5),-2000,'ordinary blind box');
    close(s7SniperThreat(plainZombie({blind:true,s7Box:{type:'normal'}}),2.5),9270,'special blind box');
    close(s7SniperThreat(plainZombie({s7:{command:'push'}}),2.5),3270,'non-bungee command is not ordinary species');
    const oldHas=s7HasCommand;
    try { s7HasCommand=(name,row)=>name==='summon'; close(s7SniperThreat(plainZombie({type:'bungee',s7:{command:'summon'}}),2.5),9270,'summon-command bungee'); }
    finally { s7HasCommand=oldHas; }
    const all=plainZombie({x:3.5,type:'zomboni',flags:{pole:true},jumping:true,s7:{variant:true}});
    close(s7SniperThreat(all,2.5),21770,'independent five-layer stacking');
  });

  test('sniper interval curve and level gates',()=>{
    close(s7SniperIntervalAdjustment(0,7),0,'zero threat fire addition');
    close(s7SniperIntervalAdjustment(400,7),3.5,'below-pivot fire addition');
    close(s7SniperIntervalAdjustment(800,7),0,'pivot fire');
    close(s7SniperIntervalAdjustment(5000,7),-7,'max fire reduction');
    close(s7SniperIntervalAdjustment(0,1),0,'zero threat load addition');
    close(s7SniperIntervalAdjustment(400,1),0.5,'below-pivot load addition');
    close(s7SniperIntervalAdjustment(5000,1),-1,'max load reduction');
    close(s7Cd({key:'sniper',s7:{level:2,sniperMaxThreat:5000}}),7.5,'lv2 no dynamic fire');
    close(s7Cd({key:'sniper',s7:{level:3,sniperMaxThreat:0}}),7.5,'lv3 zero-threat base');
    close(s7Cd({key:'sniper',s7:{level:3,sniperMaxThreat:400}}),11,'lv3 +3.5 sec');
    close(s7Cd({key:'sniper',s7:{level:3,sniperMaxThreat:5000}}),0.5,'lv3 -7 sec');
    close(s7Cd({key:'sniper',s7:{level:4,sniperMaxThreat:800}}),5.5,'lv4 base 5.5');
    const oldLock=s7SniperLockTarget;
    try {
      s7SniperLockTarget=(p)=>{p.s7.sniperMaxThreat=5000;return null;};
      const lv4={id:81,key:'sniper',row:0,col:2,dead:false,hp:550,maxHp:550,s7:{level:4,exp:6000,sniperAmmo:0}};
      s7PlantPassive(lv4,0); close(lv4.s7.sniperLoadCd,5.5,'lv4 load remains base');
      const lv5={id:82,key:'sniper',row:0,col:2,dead:false,hp:550,maxHp:550,s7:{level:5,exp:11250,sniperAmmo:0}};
      s7PlantPassive(lv5,0); close(lv5.s7.sniperLoadCd,4.5,'lv5 max load reduction');
    } finally { s7SniperLockTarget=oldLock; }
  });

  test('sniper targets current highest threat without stale lock',()=>{
    clearState();
    const low=plainZombie({id:11,x:6,type:'normal'});
    const high=plainZombie({id:12,x:5,type:'jalapenoz',jalapenoCd:2});
    state.zombies.push(low,high);
    const p={id:101,key:'sniper',row:0,col:2,dead:false,hp:550,maxHp:550,s7:{level:3,sniperLockId:11}};
    const got=s7SniperLockTarget(p);
    eq(got.id,12,'highest threat id');
    eq(p.s7.sniperLockId,12,'lock refreshed');
    close(p.s7.sniperMaxThreat,s7SniperThreat(high,2.5),'stored current max');
  });

  test('sniper unlimited loading and 480 stored shot',()=>{
    clearState();
    const p={id:201,key:'sniper',row:0,col:2,dead:false,hp:300,maxHp:300,buff:0,slow:0,s7:{level:0,exp:0,sniperAmmo:0}};
    s7PlantPassive(p,75);
    eq(p.s7.sniperAmmo,10,'ten loads without cap');
    const target=plainZombie({id:202,x:5,hp:5000,maxHp:5000});
    state.zombies.push(target);
    const before=p.s7.sniperAmmo;
    const fired=s7ActCore(p);
    ok(fired,'shot should fire');
    eq(p.s7.sniperAmmo,before-1,'one ammo consumed');
    const b=state.bullets[state.bullets.length-1];
    ok(b&&b.sniperBullet,'sniper bullet flag');
    eq(b.damage,480,'sniper damage');
    ok(b.torchable,'sniper torchable');
  });

  test('sniper torch AOE is 120/240 within +/-50px no falloff',()=>{
    for(const [torchLevel,aoeDmg] of [[1,120],[2,240]]){
      clearState();
      const from={id:301,key:'sniper',row:0,col:2,dead:false,s7:{level:5,exp:0}};
      const target=plainZombie({id:310+torchLevel,x:5,hp:5000,maxHp:5000});
      const near=plainZombie({id:320+torchLevel,x:5.6,hp:5000,maxHp:5000}); // 48px
      const far=plainZombie({id:330+torchLevel,x:5.7,hp:5000,maxHp:5000});  // 56px
      state.zombies.push(target,near,far);
      impactBullet({kind:'pea',damage:480,from,sniperBullet:true,torchLevel,aoe:0,fireLayers:0,coldLayers:0},target);
      close(5000-target.hp,480+aoeDmg,`target total loss torch${torchLevel}`);
      close(5000-near.hp,aoeDmg,`near no-falloff torch${torchLevel}`);
      close(5000-far.hp,0,`outside 50px torch${torchLevel}`);
    }
  });

  test('firelotus emoji bullet remains visible in timeline mode',()=>{
    const oldMode=s7AnimationRenderMode;
    const oldFill=ctx.fillText;
    const seen=[];
    try{
      s7AnimationRenderMode=S7_ANIMATION_RENDER_MODES.TIMELINE;
      ctx.fillText=function(text,x,y){seen.push(String(text));};
      drawBullet({kind:'firelotus',x:4,y:2.5,dead:false});
    }finally{
      ctx.fillText=oldFill;
      s7AnimationRenderMode=oldMode;
    }
    ok(seen.includes('🪷'),'timeline must draw firelotus emoji');
  });

  test('cold multiplier drives movement, animation, throw and hammer clocks',()=>{
    clearState();
    const z=plainZombie({type:'garg',flags:{garg:true},hp:5000,maxHp:5000,s7Elem:{cold:10}});
    z.s7Elem={cold:10};
    close(s7ZombieColdActionRate(z),0.7,'cold action rate');
    close(s7ZombieActionDt(z,1),0.7,'cold action dt');
    close(s7ZombieAnimationRate(z),0.7,'cold animation rate');
    z.speedProfile='ordinary'; z.speedMin=1; z.speedMax=1; z.speedNow=1; z.speedTarget=1; z.speedTimer=1;
    const coldSpeed=currentSpeed(z,0.04);
    z.s7Elem.cold=0;
    const normalSpeed=currentSpeed(z,0.04);
    close(coldSpeed/normalSpeed,0.7,'movement ratio',1e-6);
    z.s7Elem.cold=10;
    z.x=6; z.hp=2000; z.maxHp=5000; z.thrown=false; z.s7={};
    ok(s7StartGargThrowWindup(z),'throw windup starts');
    s7UpdateGargThrowWindup(z,s7ZombieActionDt(z,1));
    close(z.s7.gargThrowWindupRemaining,0.8,'throw slowed by cold');
    delete z.s7.gargThrowPhase; delete z.s7.gargThrowWindupRemaining; z.hp=5000;
    const plant={id:401,key:'wallnut',row:0,col:3,dead:false,hp:5000,maxHp:5000,s7:{}};
    state.plants.push(plant); state.zombies.push(z);
    s7LockGargSmashTarget(z,plant,'plant');
    s7UpdateGargSmashWindup(z,s7ZombieActionDt(z,1));
    close(z.attackCd,TIMES.gargHammer-0.7,'hammer slowed by cold');
  });

  test('hostile giant attacks charmed zombie through full hammer state',()=>{
    clearState();
    const giant=makeZombie('garg',0,4);
    giant.id=501; giant.x=4; giant.hp=giant.maxHp; giant.dead=false; giant.friendly=false; giant.s7=giant.s7||{};
    const charmed=makeZombie('normal',0,3.7);
    charmed.id=502; charmed.x=3.7; charmed.friendly=true; charmed.hp=5000; charmed.maxHp=5000; charmed.armors=[]; charmed.dead=false;
    state.zombies.push(giant,charmed);
    const hp0=charmed.hp;
    updateZombies(FIXED_FRAME_DT,0,state.zombies);
    eq(giant.s7.gargSmashTargetId,charmed.id,'actual friendly target acquired');
    eq(giant.s7.gargSmashTargetKind,'zombie','target kind');
    close(charmed.hp,hp0,'no instant hammer damage');
    eq(s7ResolveZombieAnimation(giant).state,'attack.smash','hammer animation selected');
    s7UpdateGargSmashWindup(giant,TIMES.gargHammer/2);
    close(charmed.hp,hp0,'no damage during windup');
    ok(giant.s7.gargSmashTargetId===charmed.id,'lock survives windup');
    s7UpdateGargSmashWindup(giant,TIMES.gargHammer/2+0.01);
    ok(charmed.hp<hp0,'damage occurs at impact');
    ok(giant.s7.gargSmashTargetId==null,'state clears after full action');
  });

  test('charmed giant also stops immediately and uses unified hammer animation',()=>{
    clearState();
    const friendly=makeZombie('garg',0,4);
    friendly.id=551; friendly.x=4; friendly.hp=friendly.maxHp; friendly.dead=false; friendly.friendly=true; friendly.s7=friendly.s7||{};
    const hostile=makeZombie('normal',0,4.3);
    hostile.id=552; hostile.x=4.3; hostile.friendly=false; hostile.hp=5000; hostile.maxHp=5000; hostile.armors=[]; hostile.dead=false;
    state.zombies.push(friendly,hostile);
    const x0=friendly.x, hp0=hostile.hp;
    updateFriendlies(FIXED_FRAME_DT,0,state.zombies);
    eq(friendly.s7.gargSmashTargetId,hostile.id,'friendly giant target acquired');
    eq(friendly.s7.gargSmashTargetKind,'zombie','friendly target kind');
    close(friendly.x,x0,'friendly giant stops on lock frame');
    close(hostile.hp,hp0,'friendly giant no instant damage');
    eq(s7ResolveZombieAnimation(friendly).state,'attack.smash','friendly hammer animation');
  });

  test('giant knockback preserves hammer action but missed plant takes no damage',()=>{
    clearState();
    const giant=makeZombie('garg',0,4);
    giant.id=601; giant.x=4; giant.hp=giant.maxHp; giant.dead=false; giant.s7=giant.s7||{};
    const plant={id:602,key:'wallnut',row:0,col:3,dead:false,hp:5000,maxHp:5000,s7:{}};
    state.zombies.push(giant); state.plants.push(plant);
    s7LockGargSmashTarget(giant,plant,'plant');
    const cd0=giant.attackCd;
    s7ApplyZombieKnockback(giant,3,{maxX:9});
    eq(giant.s7.gargSmashTargetId,plant.id,'lock preserved by knockback');
    close(giant.attackCd,cd0,'windup progress not reset');
    const x0=giant.x;
    ok(s7UpdateGargSmashWindup(giant,0.2),'active hammer stops later behavior');
    close(giant.x,x0,'giant remains stopped');
    const hp0=plant.hp;
    s7UpdateGargSmashWindup(giant,TIMES.gargHammer);
    close(plant.hp,hp0,'lost target receives no plant damage');
    ok(giant.s7.gargSmashTargetId==null,'missed hammer still completes');
  });

  test('cold representative special action timers use action time',()=>{
    clearState();
    const jack=makeZombie('jack',0,8);
    jack.id=701; jack.x=8; jack.dead=false; jack.hp=jack.maxHp; jack.s7Elem={cold:10}; jack.jackCd=1; jack.s7=jack.s7||{};
    state.zombies.push(jack);
    updateZombies(1,0,state.zombies);
    close(jack.jackCd,0.3,'jack explosion countdown');
    clearState();
    const shooter=makeZombie('peaz',0,8);
    shooter.id=702; shooter.x=8; shooter.dead=false; shooter.hp=shooter.maxHp; shooter.s7Elem={cold:10}; shooter.shooterReady=1; shooter.shootCd=2; shooter.s7=shooter.s7||{};
    state.zombies.push(shooter);
    updateZombies(1,0,state.zombies);
    close(shooter.shooterReady,0.3,'shooter ready countdown');
  });

  test('cold extends digger emergence action without changing generic stun clock',()=>{
    clearState();
    const normal=makeZombie('digger',0,6);
    normal.id=751; normal.underground=true; normal.dead=false; normal.s7Elem={cold:0}; normal.stun=0; normal.attackCd=0;
    surfaceDigger(normal,'测试出土');
    close(normal.stun,5,'normal digger emergence');
    const cold=makeZombie('digger',0,6);
    cold.id=752; cold.underground=true; cold.dead=false; cold.s7Elem={cold:10}; cold.stun=0; cold.attackCd=0;
    surfaceDigger(cold,'寒意测试出土');
    close(cold.stun,5/0.7,'cold digger emergence');
    close(cold.attackCd,5/0.7,'cold digger attack lock');
  });

  window.__S7_FEATURE_RESULTS={done:true,results,summary:{passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,total:results.length}};
})();
</script>
'''
html=html.replace('</body>',test_js+'\n</body>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-gpu'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page_errors=[]
    page.on('pageerror',lambda e:page_errors.append(str(e)))
    page.set_content(html,wait_until='load',timeout=120000)
    page.wait_for_function('window.__S7_FEATURE_RESULTS && window.__S7_FEATURE_RESULTS.done',timeout=120000)
    result=page.evaluate('window.__S7_FEATURE_RESULTS')
    result['pageErrors']=page_errors
    browser.close()
out=root/'dist/2026-08-04_sniper_garg_cold_firelotus_verification.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
if result['summary']['failed'] or page_errors:
    raise SystemExit(1)
