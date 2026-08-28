// 101_versus_ai_policy.js - shared Versus AI policy owner.
// The SAME policy + parameters drive the real practice AI (100_versus_practice)
// and the headless training runtime. Training tunes POLICY numbers only;
// decision logic must stay deterministic (no RNG, visible-state only).
(function(){
"use strict";

// Trained parameter table (single owner; balance/AI training writes back here).
const POLICY={
 plant:{
  econMaxTwins:4,          // 双子数量上限（含免费）
  econReserveSun:25,       // 经济动作后至少保留的阳光
  emergencyX:2.2,          // 僵尸越过此 x 且 mower 已用 → 紧急
  wallTriggerThreat:120,   // 行威胁 EHP 超过则补防御
  ashMinValueRatio:1.35,   // 灰烬引爆阈值：可解决付费价值 >= 卡价×ratio
  ashEmergencyRatio:0.6,   // 紧急（守家）时降低阈值
  ashGraveWallBonus:120,   // 灰烬拆除挡目标路墓碑墙的附加估价
  targetFocusHpDrop:60,    // Target 掉血超过则视为可集火
  dpsFillMaxPerLane:3,     // 每路 DPS 植物上限
  swarmCount:3,            // 行内僵尸数≥此值视为蜂群
  swarmThreatEhp:400,      // 行威胁EHP≥此值视为蜂群
  wallReplantSeconds:18    // 同路墙被吃后的重种冷却
 },
 zombie:{
  graveTargetCount:4,      // 墓碑数量上限（含免费）
  baitRefreshSeconds:14,   // mower READY 路骗车间隔
  baitMaxCost:60,          // 骗车卡最高成本
  pushMinBrain:120,        // 进攻保底脑光
  defendTargetHpDrop:40,   // Target 掉血超过则加强该路防守
  variantMinMeterSkip:0.35,// 自然 meter 低于此值才考虑付费变种
  heavyMinBrain:300,       // 重甲推进门槛
  rushLaneSpread:7         // 进攻路轮换周期（秒）
 }
};

const ASH_IDS=["cherrybomb","jalapeno","doomshroom"];
function finite(v,d){const n=Number(v);return Number.isFinite(n)?n:d}
function ehp(z){return Math.max(0,finite(z.hp,0))+(Array.isArray(z.armors)?z.armors.reduce((s,a)=>s+Math.max(0,finite(a&&a.hp,0)),0):0)}
function isFighter(z){return z&&!z.dead&&!z.dying&&!z.friendly&&!z.versusObjective&&!z.versusStatic}
function paidValueOf(z){
 const B=window.S7VersusBattle.state;
 if(z.versusDeploymentId!=null&&B.ledger){const d=B.ledger.byId[z.versusDeploymentId];if(d)return d.paidCost}
 return 0
}
function laneInfo(row){
 const fighters=state.zombies.filter(z=>isFighter(z)&&z.row===row);
 const graves=state.zombies.filter(z=>!z.dead&&z.versusStatic==="grave"&&z.row===row);
 const plantsHere=state.plants.filter(p=>!p.dead&&p.row===row);
 const walls=plantsHere.filter(p=>["wallnut","tallnut","spikerock","explodenut"].includes(p.key));
 return{row,fighters,graves,plants:plantsHere,walls,
  threatEhp:fighters.reduce((s,z)=>s+ehp(z),0),
  nearest:fighters.slice().sort((a,b)=>a.x-b.x)[0]||null}
}

function decidePlant(B,api){
 const P=POLICY.plant;
 const hand=api.cardsFor("plant").slice(1);
 const sun=B.resources.plant;
 const mowers=B.versus?.mowers||[];
 const targets=state.zombies.filter(z=>!z.dead&&z.versusObjective&&!z._targetCounted);
 const lanes=[0,1,2,3,4].map(laneInfo);
 const canAfford=id=>{const c=api.cfg("plant",id);return !!c&&sun>=c.cost};
 const tryPlay=(id,row,col)=>{if(!hand.includes(id)&&id!=="twinSunflower")return null;return api.performAction({type:"play",side:"plant",cardId:id,row,col},"ai")};
 // 1) 紧急：mower 已用路且僵尸深入 → 灰烬/即死/墙
 for(const L of lanes){
  if(!mowers[L.row]||mowers[L.row].state!=="used")continue;
  if(L.nearest&&L.nearest.x<P.emergencyX){
   const col=Math.max(0,Math.min(5,Math.floor(L.nearest.x)));
   for(const id of ASH_IDS){if(canAfford(id)){const r=tryPlay(id,L.row,col);if(r&&r.ok)return r}}
   for(const id of["potato","squash","explodenut"]){if(canAfford(id)){const r=tryPlay(id,L.row,col);if(r&&r.ok)return r}}
   for(const id of["wallnut","tallnut","spikerock"]){if(canAfford(id)){const r=tryPlay(id,L.row,Math.max(0,col-1));if(r&&r.ok)return r}}
  }
 }
 // 2) 灰烬：付费交换价值 + 墓碑墙拆除价值（打通目标路）
 for(const id of ASH_IDS){
  if(!canAfford(id))continue;
  const c=api.cfg("plant",id);
  let best=null;
  for(let row=0;row<5;row++)for(let col=0;col<=5;col++){
   let v=0;
   for(const z of state.zombies){
    if(z.dead||z.friendly||z.versusObjective)continue;
    let hit=false;
    if(id==="jalapeno")hit=z.row===row;
    else if(id==="cherrybomb")hit=Math.abs(z.row-row)<=1&&Math.abs(z.x-(col+.5))<=1.5;
    else hit=Math.abs(z.row-row)<=2&&Math.abs(z.x-(col+.5))<=3.5;
    if(!hit)continue;
    v+=Math.max(paidValueOf(z),25);
    if(z.versusStatic==="grave"){const tgt=targets.find(t=>t.row===row);if(tgt&&z.x<tgt.x)v+=P.ashGraveWallBonus}
   }
   if(!best||v>best.value)best={row,col,value:v}
  }
  const emergency=state.zombies.some(z=>isFighter(z)&&z.x<P.emergencyX&&(mowers[z.row]?.state==="used"));
  const ratio=emergency?P.ashEmergencyRatio:P.ashMinValueRatio;
  if(best&&best.value>=c.cost*ratio){const r=tryPlay(id,best.row,best.col);if(r&&r.ok)return r}
 }
 // 3) 经济：补双子（100成本，10s产25 → 40s回本）
 const twins=state.plants.filter(p=>!p.dead&&p.versusCore==="twin").length;
 if(twins<P.econMaxTwins&&sun-100>=P.econReserveSun&&!(B.versus?.suddenDeath)){
  for(const L of lanes.slice().sort((a,b)=>a.threatEhp-b.threatEhp)){
   if(L.threatEhp>P.wallTriggerThreat)continue;
   for(let col=0;col<=2;col++){const r=tryPlay("twinSunflower",L.row,col);if(r&&r.ok)return r}
  }
 }
 // 5b) 防御：仅当路内已有输出掩护（或 mower 已用紧急）时才补墙；同路重种有冷却
 B.aiMemo=B.aiMemo||{};
 const memoWalls=B.aiMemo.wallAt=B.aiMemo.wallAt||{};
 for(const L of lanes){
  const dpsHere=L.plants.some(p=>!p.versusCore&&!["wallnut","tallnut","spikerock","explodenut"].includes(p.key));
  const emergency=!!(mowers[L.row]&&mowers[L.row].state==="used"&&L.nearest&&L.nearest.x<P.emergencyX+1.5);
  const needWall=(L.threatEhp>P.wallTriggerThreat&&dpsHere)||emergency;
  const lastW=memoWalls[L.row]||-999;
  if(needWall&&L.nearest&&!L.walls.length&&state.time-lastW>=P.wallReplantSeconds){
   const col=Math.max(0,Math.min(5,Math.floor(L.nearest.x)-1));
   for(const id of["spikerock","wallnut","tallnut"]){if(canAfford(id)){const r=tryPlay(id,L.row,col);if(r&&r.ok){memoWalls[L.row]=state.time;return r}}}
  }
 }
 // 5) 输出铺场：蜂群路用穿透/AOE，开放目标路用单体 DPS
 const pierceCards=["fume","spikerock","melon","winter"];
 const singleCards=["repeater","gatling","snowpea","cattail","starfruit","cabbage","kernel"];
 const openTargetLanes=lanes.filter(L=>targets.some(t=>t.row===L.row)&&!L.graves.length).sort((a,b)=>{
  const ta=targets.find(t=>t.row===a.row),tb=targets.find(t=>t.row===b.row);
  return (ta.hp-tb.hp)||(a.threatEhp-b.threatEhp)
 });
 const order=[...openTargetLanes.map(L=>L.row),...[0,1,2,3,4].filter(r=>!openTargetLanes.some(L=>L.row===r))];
 for(const row of order){
  const L=lanes[row];
  if(L.graves.length&&targets.some(t=>t.row===row))continue; // 墓碑墙挡枪，等灰烬
  const dpsCount=L.plants.filter(p=>!p.versusCore&&(singleCards.includes(p.key)||pierceCards.includes(p.key))).length;
  if(dpsCount>=P.dpsFillMaxPerLane)continue;
  const swarm=L.fighters.length>=P.swarmCount||L.threatEhp>P.swarmThreatEhp;
  const cards=swarm?pierceCards.concat(singleCards):singleCards.concat(pierceCards);
  for(const id of cards){
   if(!canAfford(id))continue;
   // 不把植物种在马上被吃掉的格子：来敌已到则贴后列
   // DPS 放左路安全列（0-2），避免贴脸被吃
   for(let col=2;col>=0;col--){const r=tryPlay(id,row,col);if(r&&r.ok)return r}
   for(let col=5;col>=3;col--){const r=tryPlay(id,row,col);if(r&&r.ok)return r}
  }
 }


 return null
}

function decideZombie(B,api){
 const P=POLICY.zombie;
 const hand=api.cardsFor("zombie").slice(1);
 const brain=B.resources.zombie;
 const mowers=B.versus?.mowers||[];
 const targets=state.zombies.filter(z=>!z.dead&&z.versusObjective&&!z._targetCounted);
 const tryDeploy=(id,row,guaranteed)=>{if(!hand.includes(id)&&id!=="zombieGravestone")return null;return api.performAction({type:"play",side:"zombie",cardId:id,row,x:8.5,guaranteed:!!guaranteed},"ai")};
 const cfgZ=id=>api.cfg("zombie",id);
 // 每路植物防守强度（按植物类型加权估算）
 const plantLaneScore=row=>{
  let s=0;
  for(const p of state.plants){if(p.dead||p.row!==row)continue;
   if(p.versusCore)continue;
   if(["wallnut","tallnut","spikerock","explodenut"].includes(p.key))s+=2.5;
   else if(["fume","melon","winter","gloom"].includes(p.key))s+=3;
   else s+=1.5;
  }
  return s
 };
 // 1) 骗 mower：READY 路定期送最便宜的卡
 const readyLanes=mowers.map((m,i)=>m&&m.state==="ready"?i:-1).filter(x=>x>=0);
 if(readyLanes.length){
  const cheap=hand.filter(id=>{const c=cfgZ(id);return c&&c.cost<=P.baitMaxCost}).sort((a,b)=>cfgZ(a).cost-cfgZ(b).cost);
  if(cheap.length&&Math.floor(state.time/P.baitRefreshSeconds)%2===0){
   const row=readyLanes[Math.floor(state.time/P.baitRefreshSeconds)%readyLanes.length];
   const r=tryDeploy(cheap[0],row);if(r&&r.ok)return r
  }
 }
 // 2) 墓碑经济 + 保护被集火 Target（墓碑挡在 Target 左侧）
 const graves=state.zombies.filter(z=>!z.dead&&z.versusStatic==="grave").length;
 const hurtTarget=targets.filter(t=>(t.maxHp-t.hp)>=P.defendTargetHpDrop).sort((a,b)=>a.hp-b.hp)[0];
 if(graves<P.graveTargetCount&&!(B.versus?.suddenDeath)){
  const gc=cfgZ("zombieGravestone");const cost=gc?gc.cost:50;
  if(brain>=cost){
   let row=hurtTarget?hurtTarget.row:-1;
   if(row<0){const cnt=r=>state.zombies.filter(z=>!z.dead&&z.versusStatic==="grave"&&z.row===r).length;row=[0,1,2,3,4].sort((a,b)=>cnt(a)-cnt(b)||plantLaneScore(a)-plantLaneScore(b))[0]}
   const r=tryDeploy("zombieGravestone",row);if(r&&r.ok)return r
  }
 }
 // 3) 选主攻路：mower 已用 > 植物防守最弱；避免往已压制路喂便宜货
 const usedLanes=mowers.map((m,i)=>m&&m.state==="used"?i:-1).filter(x=>x>=0);
 let candidates=usedLanes.length?usedLanes:[0,1,2,3,4];
 const bestLane=candidates.slice().sort((a,b)=>plantLaneScore(a)-plantLaneScore(b))[0];
 const weakLane=[0,1,2,3,4].slice().sort((a,b)=>plantLaneScore(a)-plantLaneScore(b))[0];
 // 4) 出兵：重甲/渗透打弱路；防线强时攒重拳
 const heavy=["giga","garg","zomboni","bobsledSled","immortal"];
 const mid=["football","bucket","screen","newspaper","wallz","tallz"];
 const infil=["digger","balloon","dolphin","pogo","pole","snorkel","bungee"];
 const misc=["dancer","jack","catapult","peaz","gatlingz","squashz","jalapenoz","cone","normal"];
 const tryOrder=(ids,row)=>{for(const id of ids){if(!hand.includes(id))continue;const c=cfgZ(id);if(!c)continue;
  const guar=!!(c.guaranteed&&brain>=c.guaranteed&&(B.variantMeter[id]||0)<P.variantMinMeterSkip);
  const price=guar?c.guaranteed:c.cost;if(brain<price)continue;
  const r=tryDeploy(id,row,guar);if(r&&r.ok)return r}return null};
 if(brain>=P.heavyMinBrain){const r=tryOrder(heavy,bestLane);if(r)return r}
 if(plantLaneScore(weakLane)<=1.5){const r=tryOrder(mid.concat(misc),weakLane);if(r)return r}
 if(brain>=P.pushMinBrain){const r=tryOrder(infil.concat(mid,misc),bestLane);if(r)return r}
 return null
}

function decide(side,api){
 try{
  const B=api&&api.state;
  if(!B||!B.active||!B.versus||B.versus.phase!=="battle")return null;
  return side==="plant"?decidePlant(B,api):decideZombie(B,api);
 }catch(e){try{console.warn("[S7VersusAI] decide error",e)}catch(_){ }return null}
}

// Draft/BP：不再固定列表。按角色覆盖 + 对手已选反制。
const PLANT_ROLES={economy:["sunflower","sunshroom"],dps:["repeater","gatling","snowpea","melon","winter","starfruit","cattail","fume","cabbage","kernel","threepeater","splitpea"],defense:["wallnut","tallnut","spikerock","explodenut"],ash:ASH_IDS,control:["hypno","iceshroom","blover","chomper","garlic","timegrass"],utility:["torchwood","magnet","umbrella","plantern","marigold","goldmagnet","barley","ghost","sniper","kelp","squash","potato","puff","scaredy","seashroom","gloom","firelotus"]};
const ZOMBIE_ROLES={heavy:["garg","giga","zomboni","bobsledSled","immortal"],armor:["bucket","screen","football","wallz","tallz","newspaper"],infiltration:["digger","pole","dolphin","balloon","pogo","snorkel","bungee"],ranged:["peaz","gatlingz","catapult","jalapenoz"],summon:["dancer","jack"],cheap:["normal","cone","flag","blind","yeti","squashz"]};
function pickByRoles(pool,unavailable,count,prefer){
 const out=[];
 for(const role of Object.keys(prefer)){for(const id of prefer[role]){if(out.length>=count)break;if(pool.includes(id)&&!unavailable(id)&&!out.includes(id))out.push(id)}}
 for(const id of pool){if(out.length>=count)break;if(!unavailable(id)&&!out.includes(id))out.push(id)}
 return out.slice(0,count)
}
function draftChoice(side,kind,pool,unavailable,context){
 // kind: 'pick'|'ban'；ban 针对对方池：优先 ban 对方高交换价值核心
 if(kind==="ban"){
  const banPriority=side==="plant"?["garg","giga","zomboni","dancer","bobsledSled"]:["doomshroom","cherrybomb","jalapeno","gatling","melon"];
  for(const id of banPriority)if(pool.includes(id)&&!unavailable(id))return id;
  return pool.find(id=>!unavailable(id))||null
 }
 if(side==="plant")return pickByRoles(pool,unavailable,1,PLANT_ROLES)[0]||pool.find(id=>!unavailable(id))||null;
 return pickByRoles(pool,unavailable,1,ZOMBIE_ROLES)[0]||pool.find(id=>!unavailable(id))||null
}
// No-BP 整组选卡（人机 / 训练用）：角色 + 费用曲线均衡（保证前期有便宜卡可出）
const DECK_ROLE_ORDER={
 plant:["dps","defense","dps","ash","control","utility","economy"],
 zombie:["cheap","armor","infiltration","summon","heavy","ranged","cheap"]
};
function draftDeck(side,pool,count){
 const order=DECK_ROLE_ORDER[side]||[];
 const roles=side==="plant"?PLANT_ROLES:ZOMBIE_ROLES;
 const out=[];
 for(const role of order){
  if(out.length>=count)break;
  for(const id of (roles[role]||[])){
   if(pool.includes(id)&&!out.includes(id)){out.push(id);break}
  }
 }
 for(const id of pool){if(out.length>=count)break;if(!out.includes(id))out.push(id)}
 return out.slice(0,count)
}

window.S7VersusAI={POLICY,decide,draftChoice,draftDeck};
})();
