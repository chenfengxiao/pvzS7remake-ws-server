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
  targetFocusHpDrop:60,    // Target 掉血超过则视为可集火
  dpsFillMaxPerLane:3,     // 每路 DPS 植物上限
  focusLaneBonus:2.0       // 集火目标路的权重加成
 },
 zombie:{
  graveTargetCount:4,      // 墓碑目标数量（含免费）
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

function laneThreat(B,row){
 let t=0,nearest=null;
 for(const z of state.zombies){if(!isFighter(z)||z.row!==row)continue;t+=ehp(z);if(!nearest||z.x<nearest.x)nearest=z}
 return{threat:t,nearest}
}
function paidValueOf(z){
 const B=window.S7VersusBattle.state;
 if(z.versusDeploymentId!=null&&B.ledger){const d=B.ledger.byId[z.versusDeploymentId];if(d)return d.paidCost}
 return 0
}
// 估算灰烬在 (row,col) 的可解决付费价值
function ashBlastValue(B,id,row,col){
 let v=0;
 for(const z of state.zombies){
  if(!isFighter(z))continue;
  let hit=false;
  if(id==="jalapeno")hit=z.row===row;
  else if(id==="cherrybomb")hit=Math.abs(z.row-row)<=1&&Math.abs(z.x-(col+.5))<=1.5;
  else hit=Math.abs(z.row-row)<=2&&Math.abs(z.x-(col+.5))<=3.5;
  if(!hit)continue;
  const paid=paidValueOf(z);
  v+=Math.max(paid,paid>0?0:25); // 无账本信息时按最低25估算
 }
 return v
}
function bestAshCell(B,id){
 let best=null;
 for(let row=0;row<5;row++)for(let col=0;col<=5;col++){
  const v=ashBlastValue(B,id,row,col);
  if(!best||v>best.value)best={row,col,value:v}
 }
 return best
}

function decidePlant(B,api){
 const P=POLICY.plant;
 const list=api.cardsFor("plant");
 const hand=list.slice(1);
 const sun=B.resources.plant;
 const mowers=B.versus?.mowers||[];
 const targets=state.zombies.filter(z=>!z.dead&&z.versusObjective);
 // 1) 紧急守家：mower 已用路 + 僵尸深入
 for(let row=0;row<5;row++){
  const m=mowers[row];if(!m||m.state!=="used")continue;
  const{nearest}=laneThreat(B,row);
  if(nearest&&nearest.x<P.emergencyX){
   for(const id of ASH_IDS){if(!hand.includes(id))continue;const c=api.cfg("plant",id);if(!c||sun<c.cost)continue;const r=api.performAction({type:"play",side:"plant",cardId:id,row,col:Math.max(0,Math.min(5,Math.floor(nearest.x)))},"ai");if(r.ok)return r}
   for(const id of["wallnut","tallnut","spikerock"]){if(!hand.includes(id))continue;const col=Math.max(0,Math.min(5,Math.floor(nearest.x)-1));const r=api.performAction({type:"play",side:"plant",cardId:id,row,col},"ai");if(r.ok)return r}
  }
 }
 // 2) 灰烬按交换价值
 for(const id of ASH_IDS){
  if(!hand.includes(id))continue;const c=api.cfg("plant",id);if(!c||sun<c.cost)continue;
  const cell=bestAshCell(B,id);
  const emergency=state.zombies.some(z=>isFighter(z)&&z.x<P.emergencyX&&(mowers[z.row]?.state==="used"));
  const ratio=emergency?P.ashEmergencyRatio:P.ashMinValueRatio;
  if(cell&&cell.value>=c.cost*ratio){const r=api.performAction({type:"play",side:"plant",cardId:id,row:cell.row,col:cell.col},"ai");if(r.ok)return r}
 }
 // 3) 经济：补双子（payback 明确：100 成本，10s 产25 → 40s 回本）
 const twins=state.plants.filter(p=>!p.dead&&p.versusCore==="twin").length;
 if(hand.includes("twinSunflower")||true){
  const twinCost=api.cfg("plant","twinSunflower")?api.cfg("plant","twinSunflower").cost:100;
  if(twins<P.econMaxTwins&&sun-twinCost>=P.econReserveSun&&!(B.versus?.suddenDeath)){
   for(let row=0;row<5;row++)for(let col=0;col<=2;col++){
    const{threat}=laneThreat(B,row);if(threat>P.wallTriggerThreat)continue;
    const r=api.performAction({type:"play",side:"plant",cardId:"twinSunflower",row,col},"ai");if(r.ok)return r;
   }
  }
 }
 // 4) 防御薄弱路补墙
 for(let row=0;row<5;row++){
  const{threat,nearest}=laneThreat(B,row);
  if(threat>P.wallTriggerThreat&&nearest){
   const hasWall=state.plants.some(p=>!p.dead&&p.row===row&&(p.key==="wallnut"||p.key==="tallnut"||p.key==="spikerock"));
   if(!hasWall)for(const id of["wallnut","tallnut","spikerock"]){if(!hand.includes(id))continue;const col=Math.max(0,Math.min(5,Math.floor(nearest.x)-1));const r=api.performAction({type:"play",side:"plant",cardId:id,row,col},"ai");if(r.ok)return r}
  }
 }
 // 5) 集火已受伤 Target 的路铺 DPS
 const hurt=targets.filter(t=>(t.maxHp-t.hp)>=P.targetFocusHpDrop).sort((a,b)=>(a.hp)-(b.hp))[0];
 const dead2=B.versus?.target?.destroyed>=2;
 const focusRow=hurt?hurt.row:(dead2?targets.sort((a,b)=>a.hp-b.hp)[0]?.row:null);
 const dpsOrder=["gatling","repeater","snowpea","melon","winter","cattail","starfruit","fume","cabbage","kernel"];
 const lanes=focusRow!=null?[focusRow,...[0,1,2,3,4].filter(r=>r!==focusRow)]:[0,1,2,3,4];
 for(const row of lanes){
  const count=state.plants.filter(p=>!p.dead&&p.row===row&&!p.versusCore&&dpsOrder.includes(p.key)).length;
  if(count>=P.dpsFillMaxPerLane)continue;
  for(const id of dpsOrder){if(!hand.includes(id))continue;
   for(let col=5;col>=0;col--){const r=api.performAction({type:"play",side:"plant",cardId:id,row,col},"ai");if(r.ok)return r}
  }
 }
 return null
}

function decideZombie(B,api){
 const P=POLICY.zombie;
 const list=api.cardsFor("zombie");
 const hand=list.slice(1);
 const brain=B.resources.zombie;
 const mowers=B.versus?.mowers||[];
 const targets=state.zombies.filter(z=>!z.dead&&z.versusObjective);
 // 1) 骗 mower：READY 路定期送低价僵尸
 const readyLanes=mowers.map((m,i)=>m&&m.state==="ready"?i:-1).filter(x=>x>=0);
 if(readyLanes.length){
  const cheap=hand.filter(id=>{const c=api.cfg("zombie",id);return c&&c.cost<=P.baitMaxCost}).sort((a,b)=>api.cfg("zombie",a).cost-api.cfg("zombie",b).cost);
  if(cheap.length&&Math.floor(state.time/P.baitRefreshSeconds)%2===0){
   const row=readyLanes[Math.floor(state.time/P.baitRefreshSeconds)%readyLanes.length];
   const r=api.performAction({type:"play",side:"zombie",cardId:cheap[0],row},"ai");if(r.ok)return r
  }
 }
 // 2) 墓碑经济+保护被集火 Target
 const graves=state.zombies.filter(z=>!z.dead&&z.versusStatic==="grave").length;
 const hurtTarget=targets.filter(t=>(t.maxHp-t.hp)>=P.defendTargetHpDrop).sort((a,b)=>a.hp-b.hp)[0];
 if(graves<P.graveTargetCount&&!(B.versus?.suddenDeath)){
  const gc=api.cfg("zombie","zombieGravestone");const cost=gc?gc.cost:50;
  if(brain>=cost){
   const row=hurtTarget?hurtTarget.row:(Math.floor(state.time/9)%5);
   const r=api.performAction({type:"play",side:"zombie",cardId:"zombieGravestone",row,x:8.5},"ai");if(r.ok)return r
  }
 }
 // 3) 主攻路：mower 已用 > 植物防守最弱 > 轮换
 const usedLanes=mowers.map((m,i)=>m&&m.state==="used"?i:-1).filter(x=>x>=0);
 let pushLanes=usedLanes.length?usedLanes:[...readyLanes];
 if(!pushLanes.length)pushLanes=[Math.floor(state.time/P.rushLaneSpread)%5];
 const laneDefense=row=>state.plants.filter(p=>!p.dead&&p.row===row&&!p.versusCore).length;
 pushLanes=pushLanes.slice().sort((a,b)=>laneDefense(a)-laneDefense(b));
 const row=pushLanes[0];
 // 4) 出兵：预算内从重到轻；付费变种按阈值
 if(brain>=P.pushMinBrain||usedLanes.length){
  const order=["giga","garg","zomboni","bobsledSled","football","bucket","screen","newspaper","dancer","jack","catapult","pole","dolphin","cone","normal"];
  for(const id of order){
   if(!hand.includes(id))continue;const c=api.cfg("zombie",id);if(!c)continue;
   const useGuar=!!(c.guaranteed&&brain>=c.guaranteed&&(B.variantMeter[id]||0)<P.variantMinMeterSkip);
   const price=useGuar?c.guaranteed:c.cost;
   if(brain<price)continue;
   const r=api.performAction({type:"play",side:"zombie",cardId:id,row,guaranteed:useGuar},"ai");if(r.ok)return r
  }
 }
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
 const out=[];const roles=Object.keys(prefer);
 for(const role of roles){for(const id of prefer[role]){if(out.length>=count)break;if(pool.includes(id)&&!unavailable(id)&&!out.includes(id))out.push(id)}}
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
 const count=1;
 if(side==="plant")return pickByRoles(pool,unavailable,count,PLANT_ROLES)[0]||pool.find(id=>!unavailable(id))||null;
 return pickByRoles(pool,unavailable,count,ZOMBIE_ROLES)[0]||pool.find(id=>!unavailable(id))||null
}
// No-BP 整组选卡（人机 / 训练用）：角色均衡
function draftDeck(side,pool,count){
 if(side==="plant")return pickByRoles(pool,()=>false,count,PLANT_ROLES);
 return pickByRoles(pool,()=>false,count,ZOMBIE_ROLES)
}

window.S7VersusAI={POLICY,decide,draftChoice,draftDeck};
})();
