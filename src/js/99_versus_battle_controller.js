// 99_versus_battle_controller.js - shared authoritative Versus battle core
(function(){
"use strict";
const R=S7_VERSUS_RULES;
// 经济核 CD（平衡旋钮，可被 overrideCards 覆盖；其余 VERSUS_RULES 冻结）
const ECON_CD={twin:R.twinCooldownSeconds??8,grave:R.gravestoneCooldownSeconds??12};
const CARDS={"plant":{"wallnut":{"cost":25,"cd":12,"guaranteed":null,"command":false},"tallnut":{"cost":25,"cd":15,"guaranteed":null,"command":false},"cactus":{"cost":180,"cd":9.5,"guaranteed":null,"command":false},"explodenut":{"cost":150,"cd":25.5,"guaranteed":null,"command":false},"chomper":{"cost":100,"cd":15.0,"guaranteed":null,"command":false},"garlic":{"cost":90,"cd":14.0,"guaranteed":null,"command":false},"spikerock":{"cost":150,"cd":16.5,"guaranteed":null,"command":false},"snowpea":{"cost":255,"cd":11.0,"guaranteed":null,"command":false},"repeater":{"cost":300,"cd":10.5,"guaranteed":null,"command":false},"puff":{"cost":195,"cd":8.5,"guaranteed":null,"command":false},"scaredy":{"cost":135,"cd":11.5,"guaranteed":null,"command":false},"squash":{"cost":285,"cd":33.0,"guaranteed":null,"command":false},"threepeater":{"cost":645,"cd":18.5,"guaranteed":null,"command":false},"seashroom":{"cost":165,"cd":9.0,"guaranteed":null,"command":false},"splitpea":{"cost":105,"cd":10.0,"guaranteed":null,"command":false},"cabbage":{"cost":210,"cd":10.0,"guaranteed":null,"command":false},"cattail":{"cost":510,"cd":28.5,"guaranteed":null,"command":false},"firelotus":{"cost":345,"cd":24.0,"guaranteed":null,"command":false},"reverseRepeater":{"cost":125,"cd":9.0,"guaranteed":null,"command":false},"ghost":{"cost":200,"cd":16.0,"guaranteed":null,"command":false},"sniper":{"cost":360,"cd":23.5,"guaranteed":null,"command":false},"sunflower":{"cost":135,"cd":13.0,"guaranteed":null,"command":false},"sunshroom":{"cost":135,"cd":11.0,"guaranteed":null,"command":false},"hypno":{"cost":210,"cd":22.0,"guaranteed":null,"command":false},"iceshroom":{"cost":200,"cd":25.5,"guaranteed":null,"command":false},"kelp":{"cost":180,"cd":22.0,"guaranteed":null,"command":false},"torchwood":{"cost":105,"cd":16.5,"guaranteed":null,"command":false},"plantern":{"cost":75,"cd":14.0,"guaranteed":null,"command":false},"blover":{"cost":45,"cd":16.0,"guaranteed":null,"command":false},"magnet":{"cost":120,"cd":15.5,"guaranteed":null,"command":false},"kernel":{"cost":250,"cd":11,"guaranteed":null,"command":false},"umbrella":{"cost":75,"cd":16.0,"guaranteed":null,"command":false},"marigold":{"cost":75,"cd":14.0,"guaranteed":null,"command":false},"goldmagnet":{"cost":150,"cd":19.5,"guaranteed":null,"command":false},"timegrass":{"cost":175,"cd":27.5,"guaranteed":null,"command":false},"barley":{"cost":285,"cd":18.5,"guaranteed":null,"command":false},"starfruit":{"cost":400,"cd":19.5,"guaranteed":null,"command":false},"fume":{"cost":250,"cd":9,"guaranteed":null,"command":false},"gloom":{"cost":200,"cd":19.0,"guaranteed":null,"command":false},"potato":{"cost":405,"cd":33.0,"guaranteed":null,"command":false},"melon":{"cost":450,"cd":17.5,"guaranteed":null,"command":false},"gatling":{"cost":540,"cd":29.5,"guaranteed":null,"command":false},"winter":{"cost":250,"cd":23.5,"guaranteed":null,"command":false},"cherrybomb":{"cost":150,"cd":50.0,"guaranteed":null,"command":false},"jalapeno":{"cost":125,"cd":50.0,"guaranteed":null,"command":false},"doomshroom":{"cost":200,"cd":50.0,"guaranteed":null,"command":false}},"zombie":{"blind":{"cost":135,"cd":10.5,"guaranteed":null,"command":false},"normal":{"cost":25,"cd":5,"guaranteed":null,"command":false},"flag":{"cost":45,"cd":8.5,"guaranteed":null,"command":false},"snorkel":{"cost":50,"cd":15.0,"guaranteed":60.0,"command":false},"bobsledSled":{"cost":360,"cd":32.0,"guaranteed":540.0,"command":false},"peaz":{"cost":100,"cd":16.0,"guaranteed":200.0,"command":false},"gatlingz":{"cost":210,"cd":24.0,"guaranteed":300.0,"command":false},"squashz":{"cost":150,"cd":20.0,"guaranteed":195.0,"command":false},"jalapenoz":{"cost":165,"cd":30.0,"guaranteed":210.0,"command":false},"cone":{"cost":50,"cd":8.5,"guaranteed":null,"command":false},"bucket":{"cost":50,"cd":14,"guaranteed":195.0,"command":false},"newspaper":{"cost":165,"cd":12.0,"guaranteed":250.0,"command":false},"screen":{"cost":165,"cd":15.0,"guaranteed":225.0,"command":false},"football":{"cost":165,"cd":18.0,"guaranteed":250.0,"command":false},"digger":{"cost":50,"cd":18,"guaranteed":125.0,"command":false},"pogo":{"cost":30,"cd":14.5,"guaranteed":105.0,"command":false},"pole":{"cost":50,"cd":15,"guaranteed":150.0,"command":false},"jack":{"cost":165,"cd":11.0,"guaranteed":250.0,"command":false},"ladder":{"cost":180,"cd":18.0,"guaranteed":210.0,"command":false},"dolphin":{"cost":60,"cd":15.5,"guaranteed":75.0,"command":false},"dancer":{"cost":360,"cd":28.5,"guaranteed":450.0,"command":false},"balloon":{"cost":50,"cd":17,"guaranteed":150.0,"command":false},"wallz":{"cost":165,"cd":12.5,"guaranteed":250.0,"command":false},"tallz":{"cost":250,"cd":13.0,"guaranteed":375.0,"command":false},"zomboni":{"cost":315,"cd":31.5,"guaranteed":375.0,"command":false},"yeti":{"cost":125,"cd":12.0,"guaranteed":150.0,"command":false},"catapult":{"cost":210,"cd":28.0,"guaranteed":255.0,"command":false},"bungee":{"cost":150,"cd":26.5,"guaranteed":225.0,"command":false},"garg":{"cost":300,"cd":50.0,"guaranteed":500.0,"command":false},"giga":{"cost":550,"cd":50.0,"guaranteed":850.0,"command":false},"immortal":{"cost":285,"cd":29.5,"guaranteed":345.0,"command":false},"bombdoor":{"cost":525,"cd":35.0,"guaranteed":null,"command":true},"blackolive":{"cost":375,"cd":32.0,"guaranteed":null,"command":true},"polecmd":{"cost":390,"cd":32.0,"guaranteed":null,"command":true},"warflag":{"cost":405,"cd":36.0,"guaranteed":null,"command":true},"tacticflag":{"cost":255,"cd":38.0,"guaranteed":null,"command":true}}};
const PLANT_ASH=new Set(["cherrybomb","jalapeno","doomshroom"]);
const FIXED={plant:"twinSunflower",zombie:"zombieGravestone"};
const NAMES={twinSunflower:"双子向日葵",zombieGravestone:"墓碑",cherrybomb:"樱桃炸弹",jalapeno:"火爆辣椒",doomshroom:"毁灭菇",garg:"白眼巨人",giga:"红眼巨人",blackolive:"黑橄榄",bombdoor:"防爆门指令",polecmd:"撑杆指令",warflag:"战争旗帜",tacticflag:"战术旗帜"};
function cfg(side,id){return CARDS[side]?.[id]||null}
function cardName(side,id){if(NAMES[id])return NAMES[id];try{return side==="plant"?(PLANTS[id]?.name||id):(ZOMBIES[id]?.name||id)}catch(_){return id}}
function now(){return performance.now()/1000}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

// --- Versus asset registration (sprites + audio) ---
(function registerVersusAssets(){
 try{
  for(let i=0;i<4;i++) S7_SPRITES.register(`versus.target.shield${i}`,`./assets/versus/target_shield_stage${i}.png`);
  S7_SPRITES.register("versus.mower","./assets/versus/LawnCleaner.png");
  S7_SPRITES.register("versus.twinSunflower","./assets/plants_video_skills/41_twinsunflower.png",{frameWidth:83,frameHeight:84,columns:5,frameCount:10});
  S7_AUDIO.register("lawnmower","./assets/versus/lawnmower.mp3",{volume:.8});
 }catch(_){}
})();

// --- Target objective helpers ---
function targetStageFromDamage(dmg){const t=R.targetDamageStageThresholds;return dmg>=t[2]?3:dmg>=t[1]?2:dmg>=t[0]?1:0}
function isVersusTarget(z){return !!z?.versusObjective}
function isResourceProducer(id){return id===FIXED.plant||id===FIXED.zombie}

// --- Mower ---
function makeVersusMower(row){return{row,x:R.mowerHomeX,state:"ready",speed:0,triggeredAt:null}}
function mowerTrigger(row){const m=B.versus.mowers[row];if(!m||m.state!=="ready")return false;m.state="triggered";m.triggeredAt=state.time;m.speed=0;try{S7_AUDIO.play("lawnmower")}catch(_){}return true}
function mowerTick(dt){if(!B.versus?.mowers)return;for(const m of B.versus.mowers){if(m.state==="triggered"){m.state="running";m.speed=12}if(m.state==="running"){m.x+=m.speed*dt;for(const z of state.zombies){if(z&&!z.dead&&!z.friendly&&!z.versusObjective&&!z.versusStatic&&z.row===m.row&&z.x<=m.x+.3){const v=ledgerVictimBudget(z);if(v.budget>0){B.ledger.mowerClearedPaidValue+=v.budget;if(v.dep)ledgerEndDeployment(v.dep,'mowed')}killZombie(z,{mower:true})}}if(m.x>COLS+.5)m.state="used"}}}

// --- Exchange Ledger（deployment 级交换价值账本；不重复计价） ---
function ledgerEffectiveHp(z){return Math.max(0,finiteNumber(z.hp,0))+finiteArray(z.armors).reduce((s,a)=>s+Math.max(0,finiteNumber(a?.hp,0)),0)}
function ledgerVictimBudget(z){
 if(!z)return{budget:0,kind:"none",dep:null};
 if(z.versusObjective)return{budget:0,kind:"objective",dep:null};
 const depId=z.versusDeploymentId!=null?z.versusDeploymentId:(B.ledger?.byEntity?.[z.id]);
 const dep=depId!=null?B.ledger.byId[depId]:null;
 if(z.versusStatic==="grave")return{budget:dep?dep.paidCost:0,kind:dep?"paidGrave":"freeGrave",dep};
 if(dep)return{budget:dep.paidCost,kind:"paidZombie",dep};
 return{budget:0,kind:"summon",dep:null}
}
function ledgerCredit(attackerDep,z,eff,contextTag){
 if(!(eff>0))return;
 const v=ledgerVictimBudget(z);
 if(v.kind==="objective"){if(attackerDep){attackerDep.objectiveTargetDamage+=eff;if(z.dead||z._targetCounted){attackerDep.objectiveTargetKills++}}return}
 const initEhp=Math.max(1,v.dep?.initialEhp||z.maxHp||1);
 if(v.budget>0&&v.dep){
  v.dep.creditedDamage=Math.min(initEhp,(v.dep.creditedDamage||0)+eff);
  const share=v.budget*(eff/initEhp);
  if(attackerDep){attackerDep.resolvedPaidValueDamageEquivalent+=share;if(z.dead||z.dying){attackerDep.resolvedPaidValueDirect+=Math.max(0,v.budget-(v.dep.paidValueClaimed||0));v.dep.paidValueClaimed=v.budget}}
  if(attackerDep&&(v.kind==="paidGrave"||v.dep.cardId===FIXED.plant||v.dep.cardId===FIXED.zombie))attackerDep.economyCoreDamage+=share;
 }else if(v.kind==="freeGrave"||(!v.dep&&(z.versusCore||z.versusStatic))){
  if(attackerDep)attackerDep.freeCoreStrategicValue=(attackerDep.freeCoreStrategicValue||0)+(v.kind==="freeGrave"?R.gravestoneCost:R.twinCost)*(eff/initEhp)
 }
 if(attackerDep&&contextTag&&!attackerDep.contextTags.includes(contextTag))attackerDep.contextTags.push(contextTag)
}
function ledgerRegisterDeployment(side,id,cost,out){
 const dep={id:++B.ledger.seq,side,cardId:id,paidCost:cost,startTime:state.time,endTime:null,resolvedPaidValueDirect:0,resolvedPaidValueDamageEquivalent:0,objectiveTargetDamage:0,objectiveTargetKills:0,economyCoreDamage:0,economyDenial:0,freeCoreStrategicValue:0,mowerValue:0,housePressure:0,controlUtility:0,exchangeRatio:0,outcome:"active",contextTags:[]};
 B.ledger.deployments.push(dep);B.ledger.byId[dep.id]=dep;
 if(out&&out.entityId!=null){B.ledger.byEntity[out.entityId]=dep.id;const ent=(side==="plant"?state.plants:state.zombies).find(e=>e&&e.id===out.entityId);if(ent){ent.versusDeploymentId=dep.id;dep.initialEhp=side==="zombie"?ledgerEffectiveHp(ent):(Math.max(0,finiteNumber(ent.hp,0))||1)}}
 return dep
}
function ledgerEndDeployment(dep,outcome){if(!dep||dep.outcome!=="active")return;dep.outcome=outcome;dep.endTime=state.time}
function ledgerFinalize(){if(!B.ledger)return;for(const d of B.ledger.deployments){if(d.outcome==="active"){d.outcome="survived";d.endTime=state.time}d.exchangeRatio=d.paidCost>0?d.resolvedPaidValueDirect/d.paidCost:0}}

// --- Terminal candidates ---
function pushTerminalCandidate(winner,detail){B.versus.terminalCandidates.push({tick:state.time,seq:B.versus.seqCounter++,winner,detail})}

// --- Resource tokens ---
function makeResourceToken(side,amount,row,x,sourceId){return{id:("rt"+(performance.now()|0)+Math.random().toString(36).slice(2,6)),side,amount,row,x,sourceId,age:0,flightSeconds:1.2,resolved:false,dead:false}}
function resolveResourceToken(t){if(t.resolved||t.dead)return;t.resolved=true;B.resources[t.side]+=t.amount;t.dead=true}
function updateResourceTokens(dt){if(!B.versus.resourceTokens)return;for(const t of B.versus.resourceTokens){if(t.dead)continue;t.age+=dt;if(t.age>=t.flightSeconds)resolveResourceToken(t)}B.versus.resourceTokens=B.versus.resourceTokens.filter(t=>!t.dead)}

// --- Per-entity production cadence ---
function productionTick(dt){
 if(!B.versus?.active)return;
 const sd=B.versus.suddenDeath;
 for(const p of state.plants){if(!p.dead&&p.versusCore==="twin"){
  if(!p.versusEconomy)p.versusEconomy={nextProduceAt:state.time+R.twinProductionPeriodSeconds,phase:"idle",phaseStartedAt:0,pendingAmount:0};
  const econ=p.versusEconomy;
  if(econ.phase==="idle"&&state.time>=econ.nextProduceAt){econ.phase="bright";econ.phaseStartedAt=state.time;econ.pendingAmount=R.twinProductionAmount;p.s7=p.s7||{};p.s7.versusProduceGlow=1.0}
  if(econ.phase==="bright"&&state.time>=econ.phaseStartedAt+R.twinBrightenSeconds){B.versus.resourceTokens.push(makeResourceToken("plant",econ.pendingAmount,p.row,p.col+.5,p.id));econ.phase="idle";econ.nextProduceAt+=R.twinProductionPeriodSeconds;if(p.s7)p.s7.versusProduceGlow=0}
 }}
 for(const z of state.zombies){if(!z.dead&&z.versusStatic==="grave"){
  if(!z.versusEconomy)z.versusEconomy={nextProduceAt:state.time+R.twinProductionPeriodSeconds,phase:"idle",phaseStartedAt:0,pendingAmount:0};
  const econ=z.versusEconomy;
  if(econ.phase==="idle"&&state.time>=econ.nextProduceAt){econ.phase="bright";econ.phaseStartedAt=state.time;econ.pendingAmount=R.twinProductionAmount}
  if(econ.phase==="bright"&&state.time>=econ.phaseStartedAt+R.twinBrightenSeconds){B.versus.resourceTokens.push(makeResourceToken("zombie",econ.pendingAmount,z.row,z.x,z.id));econ.phase="idle";econ.nextProduceAt+=R.twinProductionPeriodSeconds}
 }}
 if(!sd&&state.time>=R.suddenDeathAtSeconds){B.versus.suddenDeath=true;B.versus.lastSkySupply=state.time}
 if(sd){const elapsed=state.time-(B.versus.lastSkySupply||0);if(elapsed>=R.skySupplyIntervalSeconds){const steps=Math.floor(elapsed/R.skySupplyIntervalSeconds);B.resources.plant+=R.skySupplyAmount*steps;B.resources.zombie+=R.skySupplyAmount*steps;B.versus.lastSkySupply+=steps*R.skySupplyIntervalSeconds}}
}

// --- End sequence ---
function beginVersusEnd(winner,detail={}){if(B.versus.result||B.versus.phase!=="battle")return false;B.versus.phase="ending";B.versus.result={winner,reason:detail.reason||"",at:state.time};B.versus.endSequence={age:0,winner,committed:false};return true}
function resolveTerminalCandidates(){const list=B.versus.terminalCandidates;if(!list.length||B.versus.phase!=="battle")return;list.sort((a,b)=>a.tick-b.tick||a.seq-b.seq);const first=list[0];const tied=list.filter(e=>e.tick===first.tick&&e.seq===first.seq);if(new Set(tied.map(x=>x.winner)).size>1)beginVersusEnd("draw",{reason:"同帧同时达成双方胜利条件"});else beginVersusEnd(first.winner,first);list.length=0}
function endSequenceTick(dt){const seq=B.versus.endSequence;if(!seq||seq.committed)return;seq.age+=dt;if(seq.age>=2.6){seq.committed=true;commitVersusResult()}}
function commitVersusResult(){if(B.versus.resultCommitted)return;B.versus.resultCommitted=true;try{ledgerFinalize()}catch(_){}B.active=false;state.running=false;window._mpBattleActive=false;document.body?.classList.remove("versusBattleActive");try{window.S7VersusUI?.showResult?.(B.versus.result)}catch(_){}try{window.S7VersusOnline?.hostReportResult?.(B.versus.result)}catch(_){}}

const B={active:false,mode:null,humanSide:null,role:null,online:false,isHost:false,room:null,plantCards:[],zombieCards:[],selected:{plant:0,zombie:0},resources:{plant:R.startResource,zombie:R.startResource},cooldowns:{plant:{},zombie:{}},variantCount:{},variantMeter:{},guaranteedArmed:false,result:null,targets:[],graves:[],humanActionCount:0,aiActionCount:0,versus:null,_lastTickTime:0,ledger:null};
function ensureState(){
 if(typeof newState!=="function")throw new Error("S7 core newState unavailable");
 newState(false);state.plants=[];state.zombies=[];state.bullets=[];state.effects=[];state.pendingPlantEvents=[];state.running=true;state.battle=true;state.preRun=false;state.paused=false;state.time=0;state.sun=0;state.endMode="allDead";
 for(const t of state.teams){t.alive=true;t.defeatAt=null;t.spawn=999999}
 state.versus={active:true,authoritative:true,manualSpawn:true,phase:"battle",startTime:0,suddenDeath:false,target:{destroyed:0,required:R.targetKillsToWin,entities:[]},mowers:Array.from({length:5},(_,row)=>makeVersusMower(row)),house:{loseX:R.houseEntryX},result:null,endSequence:null,terminalCandidates:[],seqCounter:0,resourceTokens:[],effects:{sharedEmoji:[]},resultCommitted:false,lastSkySupply:0};
 window._mpBattleActive=!!B.online;
 document.body?.classList.add("versusBattleActive");
 const game=document.getElementById("game");if(game){game.classList.remove("hidden");game.style.display="block";}
 try{resize()}catch(_){}
}
function makeVersusTarget(row){const z=makeZombie("normal",row,R.targetX,{variant:false});z.x=R.targetX;z.hp=z.maxHp=R.targetHp;z.stun=1e9;z.speed=z.baseSpeed=z.speedNow=z.speedTarget=0;z.versusObjective=true;z.versusStatic="target";z.threat=0;z.targetStage=0;z.immune=z.immune||{};Object.assign(z.immune,{instantKill:true,stun:true,butter:true,charm:true,knockback:true,laneWipe:true});return z}
function staticZombie(type,row,x,hp,tag){const z=makeZombie(type,row,x,{variant:false});z.x=x;z.hp=z.maxHp=hp;z.stun=1e9;z.speed=z.baseSpeed=z.speedNow=z.speedTarget=0;z.versusStatic=tag;z.threat=0;return z}
function corePlant(row,col){const p=makePlant("sunflower",row,col);p.versusCore="twin";p.name="双子向日葵";p.cd=1e9;return p}
function setupBoard(){
 for(const c of R.freePlantCores){state.plants.push(corePlant(c.row,c.col))}
 for(const c of R.freeZombieCores){B.graves.push(staticZombie("normal",c.row,c.x,R.gravestoneHp,"grave"))}
 B.targets=Array.from({length:R.targetCount},(_,row)=>makeVersusTarget(row));
 state.zombies.push(...B.graves,...B.targets);
}
function resetRuntime(opt={}){B.ledger={seq:0,deployments:[],byId:{},byEntity:{},mowerClearedPaidValue:0,housePressurePaidValue:0,charmInflictedPaidValue:0};Object.assign(B,{active:true,mode:opt.mode||"practice",humanSide:opt.humanSide||null,role:opt.role||null,online:!!opt.online,isHost:!!opt.isHost,room:opt.room||null,plantCards:(opt.plantCards||[]).slice(),zombieCards:(opt.zombieCards||[]).slice(),selected:{plant:0,zombie:0},resources:{plant:R.startResource,zombie:R.startResource},cooldowns:{plant:{},zombie:{}},variantCount:{},variantMeter:{},guaranteedArmed:false,result:null,targets:[],graves:[],humanActionCount:0,aiActionCount:0});ensureState();B.versus=state.versus;setupBoard()}
function cardReady(side,id){return (B.cooldowns[side][id]||0)<=state.time+1e-6}
function canBuy(side,id,cost){return B.active&&cardReady(side,id)&&B.resources[side]>=cost}
function setCd(side,id){
 if(side==="plant"&&id===FIXED.plant){B.cooldowns[side][id]=state.time+ECON_CD.twin;return}
 if(side==="zombie"&&id===FIXED.zombie){B.cooldowns[side][id]=state.time+ECON_CD.grave;return}
 B.cooldowns[side][id]=state.time+(cfg(side,id)?.cd||1)}
function placePlant(id,row,col){
 if(row<0||row>=5||col<0||col>=9)return {ok:false,reason:"格子无效"};
 if(state.plants.some(p=>!p.dead&&p.row===row&&p.col===col))return {ok:false,reason:"该格已有植物"};
 if(PLANT_ASH.has(id))return explodeAsh(id,row,col);
 if(id===FIXED.plant){if(B.versus.suddenDeath)return {ok:false,reason:"Sudden Death 后不能再种经济单位"};const p=corePlant(row,col);state.plants.push(p);return {ok:true}}
 if(!PLANTS[id])return {ok:false,reason:"植物不存在"};const p=makePlant(id,row,col);state.plants.push(p);return {ok:true,entityId:p.id}
}
function explodeAsh(id,row,col){
 const damage=1800;let hits=0;const dep=ledgerRegisterDeployment("plant",id,cfg("plant",id)?.cost||0,null);
 for(const z of state.zombies){if(z&&!z.dead&&!z.friendly){if(isVersusTarget(z)||z.versusStatic)continue;/* 灰烬只解僵尸进攻：Target/墓碑均不受灰烬伤害 */let hit=false;if(id==="jalapeno")hit=z.row===row;else if(id==="cherrybomb")hit=Math.abs(z.row-row)<=1&&Math.abs(z.x-(col+.5))<=1.5;else hit=Math.abs(z.row-row)<=2&&Math.abs(z.x-(col+.5))<=3.5;if(hit){const before=ledgerEffectiveHp(z);damageZombie(z,damage,{ash:true,noTransform:true});hits++;if(dep&&dep.cardId===id){const died=!!(z.dead||z.dying);const eff=died?before:Math.max(0,before-ledgerEffectiveHp(z));ledgerCredit(dep,z,eff,"ash")}}}}
 try{addEffect(row,col+.5,id==="jalapeno"?"辣椒":"灰烬","#fb7185",.8)}catch(_){}return {ok:true,hits}
}
function variantRate(t){const u=Math.max(0,t/60-2);return u<=0?0:clamp(.72*(1-Math.exp(-Math.pow(u/4.2,1.45))),0,.72)}
function consumeNaturalVariant(id){const c=cfg("zombie",id);if(!c?.guaranteed)return false;const cur=clamp(Number(B.variantMeter[id]||0),0,.999999),next=cur+variantRate(state.time);if(next>=1-1e-12){B.variantMeter[id]=Math.max(0,next-1);return true}B.variantMeter[id]=next;return false}
function variantState(id,guaranteed){if(guaranteed)return true;return consumeNaturalVariant(id)}
function applyVersusVariant(z,id,isVariant,ordinal){if(!isVariant)return;z.s7=z.s7||{};z.s7.variant=true;const armed=((ordinal*7+3)%10)<7;if((id==="garg"||id==="giga")&&armed){const armor=id==="giga"?4400:2200;z.armors=z.armors||[];z.armors.push({name:"Versus武装",hp:armor,max:armor,prio:1})}else if(id==="garg"||id==="giga"){z.speed*=1.2;z.baseSpeed*=1.2;z.speedNow=(z.speedNow||z.speed)*1.2;z.speedTarget=(z.speedTarget||z.speed)*1.2}}
function timeHpMult(t){if(t<=120)return 1;return Math.min(2.10,1+(t-120)/1080*1.10)}
function deployZombie(id,row,guaranteed=false,deployX){
 if(row<0||row>=5)return {ok:false,reason:"路线无效"};if(!ZOMBIES[id])return {ok:false,reason:"僵尸不存在"};
 const ord=(B.variantCount[id]||0);const isVariant=variantState(id,guaranteed);const z=makeZombie(id,row,null,{variant:isVariant});
 z.x=Math.max(6,Math.min(8.8,finiteNumber(deployX,8.8)));const mult=timeHpMult(state.time);z.hp*=mult;z.maxHp*=mult;for(const a of(z.armors||[])){a.hp*=mult;a.max=(a.max||a.hp)*mult}applyVersusVariant(z,id,isVariant,ord);if(z.baseX!=null)z.baseX=z.x;state.zombies.push(z);return {ok:true,entityId:z.id,variant:isVariant}
}
function performAction(action,source="human"){
 if(!B.active||B.versus.result)return {ok:false,reason:"对局未进行"};if(!action||!action.side)return {ok:false,reason:"动作无效"};
 const side=action.side,id=action.cardId;if(side!=="plant"&&side!=="zombie")return {ok:false,reason:"阵营无效"};
 if(action.type==="select"){B.selected[side]=Math.max(0,Number(action.index)||0);return {ok:true}}
 if(action.type==="toggleGuaranteed"&&side==="zombie"){B.guaranteedArmed=!B.guaranteedArmed;return {ok:true,armed:B.guaranteedArmed}}
 if(action.type==="shovel"&&side==="plant"){const p=state.plants.find(p=>!p.dead&&p.row===action.row&&p.col===action.col&&!p.versusCore);if(!p)return {ok:false,reason:"这里没有可铲植物"};removePlant(p);return {ok:true}}
 const c=cfg(side,id);if(!c&&id!==FIXED.plant&&id!==FIXED.zombie)return {ok:false,reason:"卡牌不存在"};
 let cost=c?.cost||0,guaranteed=false;
 if(side==="zombie"&&action.guaranteed&&c?.guaranteed){cost=c.guaranteed;guaranteed=true}
 if(side==="plant"&&id===FIXED.plant)cost=R.twinCost;if(side==="zombie"&&id===FIXED.zombie)cost=R.gravestoneCost;
 if(!canBuy(side,id,cost))return {ok:false,reason:B.resources[side]<cost?"资源不足":"冷却中"};
 const isAshPlay=side==="plant"&&PLANT_ASH.has(id);
 let out;
 if(side==="plant")out=placePlant(id,action.row,action.col);else if(id===FIXED.zombie){if(B.versus.suddenDeath)return {ok:false,reason:"Sudden Death 后不能再放经济单位"};const g=staticZombie("normal",action.row,Math.min(8.5,Number(action.x)||8.5),R.gravestoneHp,"grave");state.zombies.push(g);B.graves.push(g);out={ok:true,entityId:g.id}}else out=deployZombie(id,action.row,guaranteed,action.x);
 if(!out?.ok)return out;
 if(!isAshPlay)ledgerRegisterDeployment(side,id,cost,out);
 B.resources[side]-=cost;setCd(side,id);
 if(side==="zombie"&&id!==FIXED.zombie){if(!guaranteed)B.variantCount[id]=(B.variantCount[id]||0)+1;if(guaranteed)B.guaranteedArmed=false}
 if(source==="ai")B.aiActionCount++;else B.humanActionCount++;
 return Object.assign({cost,resource:B.resources[side]},out)
}
function checkEnd(){
 if(B.versus.result||B.versus.phase!=="battle")return;
 if(B.versus.target.destroyed>=R.targetKillsToWin)pushTerminalCandidate("plant",{reason:"摧毁"+B.versus.target.destroyed+"个目标"});
 if(state.time>=R.drawAtSeconds)pushTerminalCandidate("draw",{reason:"40分钟未决，判定平局"});
 resolveTerminalCandidates();
}
function handleTargetDeath(z){if(!isVersusTarget(z))return;if(z._targetCounted)return;z._targetCounted=true;B.versus.target.destroyed++}
function handleHomeApproach(z){
 if(z.friendly||z.versusObjective||z.versusStatic)return"none";
 if(z.type==="bungee"&&!z.grounded)return"none";
 const m=B.versus.mowers[z.row];if(!m)return"none";
 if(m.state==="ready"){mowerTrigger(z.row);return"mower"}
 if(m.state==="triggered"||m.state==="running")return"mower-running";
 if(m.state==="used"&&z.x<=R.houseEntryX){const v=ledgerVictimBudget(z);if(v.budget>0){B.ledger.housePressurePaidValue+=v.budget;if(v.dep)ledgerEndDeployment(v.dep,'breached')}pushTerminalCandidate("zombie",{reason:"僵尸突破房屋",row:z.row,zombieId:z.id});return"house-breached"}
 return"none"
}
function tick(dtOverride){
 if(!B.active||!state)return;
 const dt=(typeof dtOverride==="number"&&isFinite(dtOverride))?Math.max(0,dtOverride):Math.min(.2,now()-(B._lastTickTime||now()));B._lastTickTime=now();
 productionTick(dt);updateResourceTokens(dt);mowerTick(dt);
 if(B.versus.phase==="battle")checkEnd();
 else if(B.versus.phase==="ending")endSequenceTick(dt);
 if(B.mode==="practice"&&B.humanSide)try{window.S7VersusPractice?.aiTick?.()}catch(_){}
}
setInterval(tick,200);
function cardsFor(side){return [side==="plant"?FIXED.plant:FIXED.zombie].concat(side==="plant"?B.plantCards:B.zombieCards)}
function hitTest(clientX,clientY,rect){const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;const row=Math.floor((y-(layout.y/innerHeight))/(layout.cell/innerHeight));const col=Math.floor((x-(layout.x/innerWidth))/(layout.cell/innerWidth));return {row:clamp(row,0,4),col:clamp(col,0,8)}}
function actionFromPointer(side,clientX,clientY,rect){const h=hitTest(clientX,clientY,rect);const list=cardsFor(side),idx=B.selected[side]||0,id=list[idx]||list[0];if(side==="plant")return {type:"play",side,cardId:id,row:h.row,col:h.col};return {type:"play",side,cardId:id,row:h.row,x:8.8,guaranteed:B.guaranteedArmed}}
function rectHit(r,x,y){return !!r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h}
function packetIcon(side,id){if(id===FIXED.plant)return "🌻🌻";if(id===FIXED.zombie)return "🪦";try{return (side==="plant"?PLANTS[id]?.emoji:ZOMBIES[id]?.emoji)||(side==="plant"?"🌿":"🧟")}catch(_){return side==="plant"?"🌿":"🧟"}}
function shortName(side,id){if(id===FIXED.plant)return "向";if(id===FIXED.zombie)return "碑";try{return (side==="plant"?PLANTS[id]?.name:ZOMBIES[id]?.name)?.slice(0,1)||id}catch(_){return id}}
function fixedCost(side,id){if(id===FIXED.plant)return R.twinCost;if(id===FIXED.zombie)return R.gravestoneCost;return cfg(side,id)?.cost||0}
function hudMetrics(W=innerWidth,H=innerHeight){
 const margin=W<760?6:10,gap=4,barH=W<760?46:62;
 function row(side,x,y,w,resourceAtStart){
  const list=cardsFor(side),resourceW=Math.min(54,Math.max(40,barH*.86));
  const cardAreaW=Math.max(1,w-resourceW-gap),cardW=cardAreaW/Math.max(1,list.length);
  const cards=[];for(let i=0;i<list.length;i++){const cx=resourceAtStart?x+resourceW+gap+i*cardW:x+i*cardW;cards.push({x:cx,y,w:Math.max(1,cardW-gap),h:barH,id:list[i],index:i})}
  const resource=resourceAtStart?{x,y,w:resourceW,h:barH}:{x:x+w-resourceW,y,w:resourceW,h:barH};
  return {side,x,y,w,h:barH,list,cards,resource};
 }
 if(W<760){
  const w=W-margin*2,plant=row('plant',margin,6,w,true),zombie=row('zombie',margin,56,w,false),cw=42,ch=24,cy=106;
  return {plant,zombie,center:null,controls:{text:{x:W-margin-cw*2-gap,y:cy,w:cw,h:ch},anim:{x:W-margin-cw,y:cy,w:cw,h:ch},tool:{x:margin,y:cy,w:64,h:ch},variant:{x:margin+68,y:cy,w:82,h:ch}}};
 }
 const totalW=W-margin*2,centerW=Math.max(74,Math.min(96,totalW*.075)),half=(totalW-centerW-gap*2)/2;
 const plant=row('plant',margin,8,half,true),centerX=margin+half+gap,zombie=row('zombie',centerX+centerW+gap,8,half,false);
 const center={x:centerX,y:8,w:centerW,h:barH};
 return {plant,zombie,center,controls:{text:{x:centerX+4,y:34,w:(centerW-12)/2,h:25},anim:{x:centerX+8+(centerW-12)/2,y:34,w:(centerW-12)/2,h:25},tool:{x:margin,y:74,w:64,h:25},variant:{x:W-margin-86,y:74,w:86,h:25}}};
}
function drawRounded(r,fill,stroke,radius=7){ctx.beginPath();const q=Math.min(radius,r.w/2,r.h/2),x=r.x,y=r.y,w=r.w,h=r.h;ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
function drawPacket(side,packet,selected){
 const id=packet.id,c=cfg(side,id),ready=cardReady(side,id),cost=fixedCost(side,id),can=B.resources[side]>=cost&&ready;
 const sd=B.versus?.suddenDeath;
 drawRounded(packet,side==='plant'?'#d8c28f':'#9aa6b2',selected?'#facc15':'rgba(30,41,59,.92)',4);
 const inset={x:packet.x+3,y:packet.y+3,w:Math.max(1,packet.w-6),h:Math.max(1,packet.h-6)};drawRounded(inset,side==='plant'?'#ebe0b8':'#b9c2ca',null,3);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#17202a';ctx.font=`${Math.max(14,Math.min(25,packet.h*.42))}px sans-serif`;ctx.fillText(packetIcon(side,id),packet.x+packet.w/2,packet.y+packet.h*.43);
 ctx.font=`bold ${Math.max(8,Math.min(11,packet.w*.14))}px sans-serif`;ctx.fillStyle='#1f2937';ctx.fillText(String(cost),packet.x+packet.w/2,packet.y+packet.h-8);
 ctx.textAlign='left';ctx.font=`bold ${Math.max(7,Math.min(10,packet.w*.13))}px sans-serif`;ctx.fillStyle='#111827';ctx.fillText(String(packet.index+1),packet.x+5,packet.y+9);
 if(sd&&isResourceProducer(id)){ctx.strokeStyle='#ef4444';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(packet.x+4,packet.y+4);ctx.lineTo(packet.x+packet.w-4,packet.y+packet.h-4);ctx.stroke()}
 if(!can){const rem=Math.max(0,(B.cooldowns[side][id]||0)-state.time),ratio=rem>0?clamp(rem/Math.max(.001,c?.cd||1),0,1):1;ctx.fillStyle='rgba(10,15,20,.58)';ctx.fillRect(packet.x+1,packet.y+packet.h*(1-ratio),packet.w-2,packet.h*ratio);if(rem>0){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`bold ${Math.max(8,Math.min(11,packet.w*.14))}px sans-serif`;ctx.fillText(rem.toFixed(1),packet.x+packet.w/2,packet.y+packet.h*.55)}}
 if(side==='zombie'&&c?.guaranteed){const k=clamp(Number(B.variantMeter[id]||0),0,1);ctx.fillStyle='#22d3ee';ctx.fillRect(packet.x+3,packet.y+packet.h-3,Math.max(1,(packet.w-6)*k),2)}
 if(selected){ctx.strokeStyle='#fde047';ctx.lineWidth=3;ctx.strokeRect(packet.x+1.5,packet.y+1.5,Math.max(1,packet.w-3),Math.max(1,packet.h-3))}
}
function textIsVisible(){try{return typeof entityTextVisible==='boolean'?entityTextVisible:true}catch(_){return true}}
function animIsTimeline(){try{return typeof s7AnimationRenderMode!=='undefined'&&s7AnimationRenderMode==='timeline'}catch(_){return false}}
function drawHud(){
 if(!state?.versus?.active)return;const W=innerWidth,H=innerHeight,m=hudMetrics(W,H);ctx.save();ctx.setTransform(DPR,0,0,DPR,0,0);
 const wood='#6b3f1f',wood2='#4b2a15';
 for(const side of ['plant','zombie']){const row=m[side];drawRounded({x:row.x-3,y:row.y-3,w:row.w+6,h:row.h+6},wood,wood2,7);for(const p of row.cards)drawPacket(side,p,p.index===(B.selected[side]||0));const rr=row.resource;drawRounded(rr,side==='plant'?'#f3d273':'#be78a3','#4b2a15',6);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.max(16,rr.h*.38)}px sans-serif`;ctx.fillStyle='#17202a';ctx.fillText(side==='plant'?'☀':'🧠',rr.x+rr.w/2,rr.y+rr.h*.36);ctx.font=`bold ${Math.max(10,rr.h*.22)}px sans-serif`;ctx.fillText(String(Math.floor(B.resources[side])),rr.x+rr.w/2,rr.y+rr.h*.73)}
 if(m.center){drawRounded(m.center,wood,'#3b2315',7);ctx.textAlign='center';ctx.fillStyle='#fff7d6';ctx.font='bold 12px sans-serif';const t=state.time;ctx.fillText(`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`,m.center.x+m.center.w/2,m.center.y+15);const dest=B.versus?.target?.destroyed||0;ctx.font='bold 9px sans-serif';ctx.fillStyle='#fbbf24';ctx.fillText(`${dest}/${R.targetKillsToWin}`,m.center.x+m.center.w/2,m.center.y+30)}
 const drawCtl=(r,label,on)=>{drawRounded(r,on?'#365314':'rgba(58,35,21,.95)',on?'#bef264':'#9a6b45',5);ctx.fillStyle='#fff7ed';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 10px sans-serif';ctx.fillText(label,r.x+r.w/2,r.y+r.h/2)};
 drawCtl(m.controls.text,`B 文字${textIsVisible()?'开':'关'}`,textIsVisible());drawCtl(m.controls.anim,`V ${animIsTimeline()?'动画':'旧绘'}`,animIsTimeline());
 const side=B.humanSide||B.role;if(side==='plant')drawCtl(m.controls.tool,'🪏 Q',!!B.shovelMode);else if(side==='zombie'){const list=cardsFor('zombie'),id=list[B.selected.zombie||0],c=cfg('zombie',id);if(c?.guaranteed)drawCtl(m.controls.variant,`F 100%`,B.guaranteedArmed)}
 if(B.versus?.suddenDeath&&state.time<R.suddenDeathAtSeconds+1.5){ctx.fillStyle='rgba(220,38,38,.85)';ctx.fillRect(0,H*.3,W,40);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 24px sans-serif';ctx.fillText('SUDDEN DEATH',W/2,H*.3+28)}
 if(B.versus?.phase==="ending"&&B.versus.endSequence){const seq=B.versus.endSequence;if(seq.age>.7){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,W,H);if(seq.age>1.05){ctx.fillStyle=seq.winner==='plant'?'#4ade80':seq.winner==='zombie'?'#f87171':'#fbbf24';ctx.textAlign='center';ctx.font='bold 32px sans-serif';ctx.fillText(seq.winner==='plant'?'🌱 植物胜利':seq.winner==='zombie'?'🧟 僵尸胜利':'平局',W/2,H*.4)}}}
 ctx.restore()
}
function handleHudPointer(side,px,py,W=innerWidth,H=innerHeight){
 if(!B.active||!side)return false;const m=hudMetrics(W,H);
 if(rectHit(m.controls.text,px,py)){try{toggleEntityText()}catch(_){}return true}
 if(rectHit(m.controls.anim,px,py)){try{toggleS7AnimationRenderMode()}catch(_){}return true}
 const row=m[side];for(const p of row.cards){if(rectHit(p,px,py)){performAction({type:'select',side,index:p.index});return true}}
 if(side==='plant'&&rectHit(m.controls.tool,px,py)){B.shovelMode=!B.shovelMode;return true}
 if(side==='zombie'&&rectHit(m.controls.variant,px,py)){const list=cardsFor('zombie'),id=list[B.selected.zombie||0],c=cfg('zombie',id);if(c?.guaranteed){performAction({type:'toggleGuaranteed',side:'zombie'});return true}}
 return false
}
function keyAction(e){if(!B.active)return false;const side=B.humanSide||B.role;if(!side)return false;const list=cardsFor(side);if(/^[1-7]$/.test(e.key)){B.selected[side]=clamp(Number(e.key)-1,0,list.length-1);return true}if(side==="zombie"&&(e.key==="f"||e.key==="F")){const id=list[B.selected.zombie||0];if(cfg('zombie',id)?.guaranteed){B.guaranteedArmed=!B.guaranteedArmed;return true}}return false}
window.addEventListener("keydown",e=>{if(keyAction(e)){e.preventDefault();return}if(B.active&&B.humanSide==="plant"&&(e.key==="q"||e.key==="Q")){B.shovelMode=true;e.preventDefault()}});
const __versusBaseDamageZombie=typeof damageZombie==="function"?damageZombie:null;
if(__versusBaseDamageZombie)damageZombie=function(z,amount,opt={}){
 const versusOn=!!(B.active&&B.versus);
 if(!versusOn)return __versusBaseDamageZombie(z,amount,opt);
 const before=ledgerEffectiveHp(z);
 const wasAlive=!z.dead;
 const r=__versusBaseDamageZombie(z,amount,opt);
 const eff=Math.max(0,before-ledgerEffectiveHp(z));
 if(eff>0){
  const src=opt.source||opt.zombieAttacker||null;
  let attackerDep=null,tag=null;
  if(src&&src.versusDeploymentId!=null)attackerDep=B.ledger.byId[B.ledger.byEntity[src.id]??src.versusDeploymentId]||null;
  if(!attackerDep&&opt.zombieAttacker&&opt.zombieAttacker.friendly){tag="charm"}
  if(opt.ash)tag=tag||"ash";
  if(attackerDep)ledgerCredit(attackerDep,z,eff,tag);
  else if(tag==="charm"){const v=ledgerVictimBudget(z);if(v.budget>0)B.ledger.charmInflictedPaidValue+=v.budget*(eff/Math.max(1,v.dep?.initialEhp||z.maxHp||1))}
 }
 const v=ledgerVictimBudget(z);
 if(wasAlive&&(z.dead||z.dying)&&v.dep)ledgerEndDeployment(v.dep,"killed");
 return r
};
const __versusBaseDamagePlant=typeof damagePlant==="function"?damagePlant:null;
if(__versusBaseDamagePlant)damagePlant=function(p,dmg,src){
 const versusOn=!!(B.active&&B.versus);
 if(!versusOn)return __versusBaseDamagePlant(p,dmg,src);
 const before=Math.max(0,finiteNumber(p.hp,0));const wasAlive=!p.dead;
 const r=__versusBaseDamagePlant(p,dmg,src);
 const eff=Math.max(0,before-Math.max(0,finiteNumber(p.hp,0)));
 if(eff>0){
  const attackerDep=src&&src.versusDeploymentId!=null?(B.ledger.byId[B.ledger.byEntity[src.id]??src.versusDeploymentId]||null):null;
  const depId=p.versusDeploymentId!=null?p.versusDeploymentId:B.ledger.byEntity[p.id];
  const victimDep=depId!=null?B.ledger.byId[depId]:null;
  if(attackerDep){
   if(p.versusCore){attackerDep.freeCoreStrategicValue=(attackerDep.freeCoreStrategicValue||0)+R.twinCost*(eff/Math.max(1,victimDep?.initialEhp||p.maxHp||1))}
   else if(victimDep&&victimDep.paidCost>0){const initEhp=Math.max(1,victimDep.initialEhp||1);victimDep.creditedDamage=Math.min(initEhp,(victimDep.creditedDamage||0)+eff);const share=victimDep.paidCost*(eff/initEhp);attackerDep.resolvedPaidValueDamageEquivalent+=share;if(p.dead){attackerDep.resolvedPaidValueDirect+=Math.max(0,victimDep.paidCost-(victimDep.paidValueClaimed||0));victimDep.paidValueClaimed=victimDep.paidCost}}
  }
  if(wasAlive&&p.dead&&victimDep)ledgerEndDeployment(victimDep,"killed")
 }
 return r
};
function overrideCards(overrides){
 // 平衡求解器/训练用：运行时改写卡表（价格/CD/变种价）。正式值最终直接写入 CARDS 源表。
 if(!overrides)return;
 for(const side of ["plant","zombie"]){
  const m=overrides[side];if(!m)continue;
  for(const [id,delta] of Object.entries(m)){
   const c=CARDS[side][id];if(!c)continue;
   if(delta.cost!=null)c.cost=Math.max(15,Math.round(delta.cost));
   if(delta.cd!=null)c.cd=Math.max(1,Number(delta.cd));
   if(delta.guaranteed!=null&&c.guaranteed!=null)c.guaranteed=Math.max(c.cost,Math.round(delta.guaranteed));
  }
 }
 if(overrides.__rules){
  if(overrides.__rules.twinCd!=null)ECON_CD.twin=Math.max(1,Number(overrides.__rules.twinCd));
  if(overrides.__rules.graveCd!=null)ECON_CD.grave=Math.max(1,Number(overrides.__rules.graveCd));
 }
 return CARDS;
}
window.S7VersusBattle={CARDS,FIXED,overrideCards,state:B,cfg,cardName,start:function(opt){resetRuntime(opt);return B},performAction,actionFromPointer,drawHud,handleHudPointer,hudMetrics,cardsFor,handleTargetDeath,handleHomeApproach,finish:function(winner,reason){beginVersusEnd(winner,{reason})},keyAction,shortName,tick,getLedger:()=>B.ledger,getSnapshot:()=>({active:B.active,result:B.versus?.result||null,resources:{...B.resources},time:state?.time||0,plantCards:B.plantCards.slice(),zombieCards:B.zombieCards.slice(),variantCount:{...B.variantCount},variantMeter:{...B.variantMeter}})};
})();
