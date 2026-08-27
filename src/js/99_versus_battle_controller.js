// 99_versus_battle_controller.js - shared authoritative Versus battle core
(function(){
"use strict";
const CARDS={"plant":{"wallnut":{"cost":75,"cd":12.0,"guaranteed":null,"command":false},"tallnut":{"cost":75,"cd":15.0,"guaranteed":null,"command":false},"cactus":{"cost":180,"cd":9.5,"guaranteed":null,"command":false},"explodenut":{"cost":150,"cd":25.5,"guaranteed":null,"command":false},"chomper":{"cost":100,"cd":15.0,"guaranteed":null,"command":false},"garlic":{"cost":90,"cd":14.0,"guaranteed":null,"command":false},"spikerock":{"cost":125,"cd":16.5,"guaranteed":null,"command":false},"snowpea":{"cost":255,"cd":11.0,"guaranteed":null,"command":false},"repeater":{"cost":175,"cd":10.5,"guaranteed":null,"command":false},"puff":{"cost":195,"cd":8.5,"guaranteed":null,"command":false},"scaredy":{"cost":135,"cd":11.5,"guaranteed":null,"command":false},"squash":{"cost":285,"cd":33.0,"guaranteed":null,"command":false},"threepeater":{"cost":645,"cd":18.5,"guaranteed":null,"command":false},"seashroom":{"cost":165,"cd":9.0,"guaranteed":null,"command":false},"splitpea":{"cost":105,"cd":10.0,"guaranteed":null,"command":false},"cabbage":{"cost":210,"cd":10.0,"guaranteed":null,"command":false},"cattail":{"cost":510,"cd":28.5,"guaranteed":null,"command":false},"firelotus":{"cost":345,"cd":24.0,"guaranteed":null,"command":false},"reverseRepeater":{"cost":125,"cd":9.0,"guaranteed":null,"command":false},"ghost":{"cost":200,"cd":16.0,"guaranteed":null,"command":false},"sniper":{"cost":360,"cd":23.5,"guaranteed":null,"command":false},"sunflower":{"cost":135,"cd":13.0,"guaranteed":null,"command":false},"sunshroom":{"cost":135,"cd":11.0,"guaranteed":null,"command":false},"hypno":{"cost":210,"cd":22.0,"guaranteed":null,"command":false},"iceshroom":{"cost":200,"cd":25.5,"guaranteed":null,"command":false},"kelp":{"cost":180,"cd":22.0,"guaranteed":null,"command":false},"torchwood":{"cost":105,"cd":16.5,"guaranteed":null,"command":false},"plantern":{"cost":75,"cd":14.0,"guaranteed":null,"command":false},"blover":{"cost":45,"cd":16.0,"guaranteed":null,"command":false},"magnet":{"cost":120,"cd":15.5,"guaranteed":null,"command":false},"kernel":{"cost":165,"cd":11.0,"guaranteed":null,"command":false},"umbrella":{"cost":75,"cd":16.0,"guaranteed":null,"command":false},"marigold":{"cost":75,"cd":14.0,"guaranteed":null,"command":false},"goldmagnet":{"cost":150,"cd":19.5,"guaranteed":null,"command":false},"timegrass":{"cost":175,"cd":27.5,"guaranteed":null,"command":false},"barley":{"cost":285,"cd":18.5,"guaranteed":null,"command":false},"starfruit":{"cost":400,"cd":19.5,"guaranteed":null,"command":false},"fume":{"cost":150,"cd":9.0,"guaranteed":null,"command":false},"gloom":{"cost":200,"cd":19.0,"guaranteed":null,"command":false},"potato":{"cost":405,"cd":33.0,"guaranteed":null,"command":false},"melon":{"cost":450,"cd":17.5,"guaranteed":null,"command":false},"gatling":{"cost":540,"cd":29.5,"guaranteed":null,"command":false},"winter":{"cost":225,"cd":23.5,"guaranteed":null,"command":false},"cherrybomb":{"cost":345,"cd":45.0,"guaranteed":null,"command":false},"jalapeno":{"cost":375,"cd":55.0,"guaranteed":null,"command":false},"doomshroom":{"cost":625,"cd":82.5,"guaranteed":null,"command":false}},"zombie":{"blind":{"cost":135,"cd":10.5,"guaranteed":null,"command":false},"normal":{"cost":30,"cd":5.0,"guaranteed":null,"command":false},"flag":{"cost":45,"cd":8.5,"guaranteed":null,"command":false},"snorkel":{"cost":50,"cd":15.0,"guaranteed":60.0,"command":false},"bobsledSled":{"cost":360,"cd":32.0,"guaranteed":540.0,"command":false},"peaz":{"cost":100,"cd":16.0,"guaranteed":200.0,"command":false},"gatlingz":{"cost":210,"cd":24.0,"guaranteed":300.0,"command":false},"squashz":{"cost":150,"cd":20.0,"guaranteed":195.0,"command":false},"jalapenoz":{"cost":165,"cd":30.0,"guaranteed":210.0,"command":false},"cone":{"cost":50,"cd":8.5,"guaranteed":null,"command":false},"bucket":{"cost":135,"cd":14.0,"guaranteed":195.0,"command":false},"newspaper":{"cost":165,"cd":12.0,"guaranteed":250.0,"command":false},"screen":{"cost":165,"cd":15.0,"guaranteed":225.0,"command":false},"football":{"cost":165,"cd":18.0,"guaranteed":250.0,"command":false},"digger":{"cost":105,"cd":18.0,"guaranteed":125.0,"command":false},"pogo":{"cost":90,"cd":14.5,"guaranteed":105.0,"command":false},"pole":{"cost":105,"cd":15.0,"guaranteed":150.0,"command":false},"jack":{"cost":165,"cd":11.0,"guaranteed":250.0,"command":false},"ladder":{"cost":180,"cd":18.0,"guaranteed":210.0,"command":false},"dolphin":{"cost":60,"cd":15.5,"guaranteed":75.0,"command":false},"dancer":{"cost":360,"cd":28.5,"guaranteed":450.0,"command":false},"balloon":{"cost":100,"cd":17.0,"guaranteed":150.0,"command":false},"wallz":{"cost":165,"cd":12.5,"guaranteed":250.0,"command":false},"tallz":{"cost":250,"cd":13.0,"guaranteed":375.0,"command":false},"zomboni":{"cost":315,"cd":31.5,"guaranteed":375.0,"command":false},"yeti":{"cost":125,"cd":12.0,"guaranteed":150.0,"command":false},"catapult":{"cost":210,"cd":28.0,"guaranteed":255.0,"command":false},"bungee":{"cost":150,"cd":26.5,"guaranteed":225.0,"command":false},"garg":{"cost":300,"cd":50.0,"guaranteed":500.0,"command":false},"giga":{"cost":550,"cd":50.0,"guaranteed":850.0,"command":false},"immortal":{"cost":285,"cd":29.5,"guaranteed":345.0,"command":false},"bombdoor":{"cost":525,"cd":35.0,"guaranteed":null,"command":true},"blackolive":{"cost":375,"cd":32.0,"guaranteed":null,"command":true},"polecmd":{"cost":390,"cd":32.0,"guaranteed":null,"command":true},"warflag":{"cost":405,"cd":36.0,"guaranteed":null,"command":true},"tacticflag":{"cost":255,"cd":38.0,"guaranteed":null,"command":true}}};
const PLANT_ASH=new Set(["cherrybomb","jalapeno","doomshroom"]);
const FIXED={plant:"twinSunflower",zombie:"zombieGravestone"};
const START_RESOURCE=75, DRAW_SECONDS=2400, ECON_LOCK=300;
const VARIANT_PATTERN=[0,0,0,1,0,0,1,0,0,0]; // deterministic long-run cadence; no RNG
const NAMES={
 twinSunflower:"双子向日葵",zombieGravestone:"墓碑",cherrybomb:"樱桃炸弹",jalapeno:"火爆辣椒",doomshroom:"毁灭菇",
 garg:"白眼巨人",giga:"红眼巨人",blackolive:"黑橄榄",bombdoor:"防爆门指令",polecmd:"撑杆指令",warflag:"战争旗帜",tacticflag:"战术旗帜"
};
function cfg(side,id){return CARDS[side]?.[id]||null}
function cardName(side,id){if(NAMES[id])return NAMES[id]; try{return side==="plant"?(PLANTS[id]?.name||id):(ZOMBIES[id]?.name||id)}catch(_){return id}}
function now(){return performance.now()/1000}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
const B={active:false,mode:null,humanSide:null,role:null,online:false,isHost:false,room:null,plantCards:[],zombieCards:[],selected:{plant:0,zombie:0},resources:{plant:75,zombie:75},cooldowns:{plant:{},zombie:{}},variantCount:{},variantMeter:{},guaranteedArmed:false,lastTick:0,lastEconomy:0,result:null,targets:[],graves:[],humanActionCount:0,aiActionCount:0};
function ensureState(){
 if(typeof newState!=="function")throw new Error("S7 core newState unavailable");
 newState(false); state.plants=[]; state.zombies=[]; state.bullets=[]; state.effects=[]; state.pendingPlantEvents=[]; state.running=true; state.battle=true; state.preRun=false; state.paused=false; state.time=0; state.sun=0; state.endMode="allDead";
 for(const t of state.teams){t.alive=true;t.defeatAt=null;t.spawn=999999}
 state.versus={active:true,authoritative:true,manualSpawn:true}; window._mpBattleActive=!!B.online;
 document.body?.classList.add("versusBattleActive");
 const game=document.getElementById("game");if(game){game.classList.remove("hidden");game.style.display="block";}
 try{resize()}catch(_){}
}
function staticZombie(type,row,x,hp,tag){const z=makeZombie(type,row,x,{variant:false}); z.x=x; z.hp=z.maxHp=hp; z.stun=1e9; z.speed=z.baseSpeed=z.speedNow=z.speedTarget=0; z.versusStatic=tag; z.threat=0; return z}
function corePlant(row,col){const p=makePlant("sunflower",row,col); p.versusCore="twin"; p.name="双子向日葵"; p.cd=1e9; return p}
function setupBoard(){
 state.plants.push(corePlant(1,0),corePlant(3,0));
 B.graves=[staticZombie("normal",1,8.5,400,"grave"),staticZombie("normal",3,8.5,400,"grave")];
 B.targets=[staticZombie("normal",0,8.75,1600,"target"),staticZombie("normal",2,8.75,1600,"target"),staticZombie("normal",4,8.75,1600,"target")];
 state.zombies.push(...B.graves,...B.targets);
}
function resetRuntime(opt={}){Object.assign(B,{active:true,mode:opt.mode||"practice",humanSide:opt.humanSide||null,role:opt.role||null,online:!!opt.online,isHost:!!opt.isHost,room:opt.room||null,plantCards:(opt.plantCards||[]).slice(),zombieCards:(opt.zombieCards||[]).slice(),selected:{plant:0,zombie:0},resources:{plant:START_RESOURCE,zombie:START_RESOURCE},cooldowns:{plant:{},zombie:{}},variantCount:{},variantMeter:{},guaranteedArmed:false,lastTick:now(),lastEconomy:0,result:null,targets:[],graves:[],humanActionCount:0,aiActionCount:0}); ensureState(); setupBoard();}
function cardReady(side,id){return (B.cooldowns[side][id]||0)<=state.time+1e-6}
function canBuy(side,id,cost){return B.active&&cardReady(side,id)&&B.resources[side]>=cost}
function setCd(side,id){const c=cfg(side,id); B.cooldowns[side][id]=state.time+(c?.cd||1)}
function placePlant(id,row,col){
 if(row<0||row>=5||col<0||col>=9)return {ok:false,reason:"格子无效"};
 if(state.plants.some(p=>!p.dead&&p.row===row&&p.col===col))return {ok:false,reason:"该格已有植物"};
 if(PLANT_ASH.has(id))return explodeAsh(id,row,col);
 if(id===FIXED.plant){if(state.time>=ECON_LOCK)return {ok:false,reason:"5分钟后不能再种经济单位"}; const p=corePlant(row,col);state.plants.push(p);return {ok:true};}
 if(!PLANTS[id])return {ok:false,reason:"植物不存在"}; const p=makePlant(id,row,col); state.plants.push(p); return {ok:true,entityId:p.id};
}
function explodeAsh(id,row,col){
 const damage=1800; let hits=0;
 const targets=state.zombies.filter(z=>z&&!z.dead&&!z.friendly&&!z.versusStatic);
 for(const z of targets){let hit=false;if(id==="jalapeno")hit=z.row===row;else if(id==="cherrybomb")hit=Math.abs(z.row-row)<=1&&Math.abs(z.x-(col+.5))<=1.5;else hit=Math.abs(z.row-row)<=2&&Math.abs(z.x-(col+.5))<=3.5;if(hit){damageZombie(z,damage,{ash:true,noTransform:true});hits++}}
 try{addEffect(row,col+.5,id==="jalapeno"?"辣椒":"灰烬","#fb7185",.8)}catch(_){} return {ok:true,hits};
}
function variantRate(t){const u=Math.max(0,t/60-2);return u<=0?0:clamp(.72*(1-Math.exp(-Math.pow(u/4.2,1.45))),0,.72)}
function consumeNaturalVariant(id){const c=cfg("zombie",id);if(!c?.guaranteed)return false;const cur=clamp(Number(B.variantMeter[id]||0),0,.999999),next=cur+variantRate(state.time);if(next>=1-1e-12){B.variantMeter[id]=Math.max(0,next-1);return true}B.variantMeter[id]=next;return false}
function variantState(id,guaranteed){if(guaranteed)return true;return consumeNaturalVariant(id)}
function applyVersusVariant(z,id,isVariant,ordinal){if(!isVariant)return; z.s7=z.s7||{}; z.s7.variant=true; const armed=((ordinal*7+3)%10)<7; if((id==="garg"||id==="giga")&&armed){const armor=id==="giga"?4400:2200; z.armors=z.armors||[]; z.armors.push({name:"Versus武装",hp:armor,max:armor,prio:1});} else if(id==="garg"||id==="giga"){z.speed*=1.2;z.baseSpeed*=1.2;z.speedNow=(z.speedNow||z.speed)*1.2;z.speedTarget=(z.speedTarget||z.speed)*1.2;}}
function timeHpMult(t){if(t<=120)return 1; return Math.min(2.10,1+(t-120)/1080*1.10)}
function deployZombie(id,row,guaranteed=false){
 if(row<0||row>=5)return {ok:false,reason:"路线无效"}; if(!ZOMBIES[id])return {ok:false,reason:"僵尸不存在"};
 const ord=(B.variantCount[id]||0); const isVariant=variantState(id,guaranteed); const z=makeZombie(id,row,null,{variant:isVariant}); const mult=timeHpMult(state.time); z.hp*=mult;z.maxHp*=mult;for(const a of(z.armors||[])){a.hp*=mult;a.max=(a.max||a.hp)*mult} applyVersusVariant(z,id,isVariant,ord); state.zombies.push(z); return {ok:true,entityId:z.id,variant:isVariant};
}
function performAction(action,source="human"){
 if(!B.active||B.result)return {ok:false,reason:"对局未进行"}; if(!action||!action.side)return {ok:false,reason:"动作无效"};
 const side=action.side,id=action.cardId; if(side!=="plant"&&side!=="zombie")return {ok:false,reason:"阵营无效"};
 if(action.type==="select"){B.selected[side]=Math.max(0,Number(action.index)||0);return {ok:true}}
 if(action.type==="toggleGuaranteed"&&side==="zombie"){B.guaranteedArmed=!B.guaranteedArmed;return {ok:true,armed:B.guaranteedArmed}}
 if(action.type==="shovel"&&side==="plant"){const p=state.plants.find(p=>!p.dead&&p.row===action.row&&p.col===action.col&&!p.versusCore);if(!p)return {ok:false,reason:"这里没有可铲植物"};removePlant(p);return {ok:true}}
 const c=cfg(side,id); if(!c&&id!==FIXED.plant&&id!==FIXED.zombie)return {ok:false,reason:"卡牌不存在"};
 let cost=c?.cost||0, guaranteed=false;
 if(side==="zombie"&&action.guaranteed&&c?.guaranteed){cost=c.guaranteed;guaranteed=true}
 if(side==="plant"&&id===FIXED.plant)cost=100; if(side==="zombie"&&id===FIXED.zombie)cost=50;
 if(!canBuy(side,id,cost))return {ok:false,reason:B.resources[side]<cost?"资源不足":"冷却中"};
 let out;
 if(side==="plant") out=placePlant(id,action.row,action.col); else if(id===FIXED.zombie){if(state.time>=ECON_LOCK)return {ok:false,reason:"5分钟后不能再放经济单位"};const g=staticZombie("normal",action.row,Math.min(8.5,Number(action.x)||8.5),400,"grave");state.zombies.push(g);B.graves.push(g);out={ok:true,entityId:g.id};} else out=deployZombie(id,action.row,guaranteed);
 if(!out?.ok)return out;
 B.resources[side]-=cost; setCd(side,id);
 if(side==="zombie"&&id!==FIXED.zombie){if(!guaranteed)B.variantCount[id]=(B.variantCount[id]||0)+1; if(guaranteed)B.guaranteedArmed=false}
 if(source==="ai")B.aiActionCount++;else B.humanActionCount++;
 return Object.assign({cost,resource:B.resources[side]},out);
}
function economyTick(){if(state.time-B.lastEconomy<10)return; const steps=Math.floor((state.time-B.lastEconomy)/10);B.lastEconomy+=steps*10;const twins=state.plants.filter(p=>!p.dead&&p.versusCore==="twin").length;const graves=state.zombies.filter(z=>!z.dead&&z.versusStatic==="grave").length;B.resources.plant+=25*twins*steps;B.resources.zombie+=25*graves*steps;if(state.time>=ECON_LOCK){const bonus=Math.floor((state.time-ECON_LOCK)/20)-Math.floor((B.lastSudden||0)/20);if(bonus>0){B.resources.plant+=50*bonus;B.resources.zombie+=50*bonus;}B.lastSudden=state.time-ECON_LOCK}}
function checkEnd(){if(B.result)return; const targetAlive=B.targets.filter(z=>!z.dead).length;const captured=state.teams.filter(t=>!t.alive).length;if(targetAlive===0)return finish("plant","三座目标全部被摧毁");if(captured>=3)return finish("zombie","僵尸突破了三条路线");if(state.time>=DRAW_SECONDS)return finish("draw","40分钟未决，判定平局")}
function finish(winner,reason){B.result={winner,reason,time:state.time};B.active=false;state.running=false;window._mpBattleActive=false;document.body?.classList.remove("versusBattleActive");try{window.S7VersusUI?.showResult?.(B.result)}catch(_){}try{window.S7VersusOnline?.hostReportResult?.(B.result)}catch(_){}return B.result}
function tick(){if(!B.active||!state)return;economyTick();checkEnd();if(B.mode==="practice")try{window.S7VersusPractice?.aiTick?.()}catch(_){} }
setInterval(tick,200);
function cardsFor(side){return [side==="plant"?FIXED.plant:FIXED.zombie].concat(side==="plant"?B.plantCards:B.zombieCards)}
function hitTest(clientX,clientY,rect){const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;const row=Math.floor((y-(layout.y/innerHeight))/(layout.cell/innerHeight));const col=Math.floor((x-(layout.x/innerWidth))/(layout.cell/innerWidth));return {row:clamp(row,0,4),col:clamp(col,0,8)}}
function actionFromPointer(side,clientX,clientY,rect){const h=hitTest(clientX,clientY,rect);const list=cardsFor(side),idx=B.selected[side]||0,id=list[idx]||list[0];if(side==="plant")return {type:"play",side,cardId:id,row:h.row,col:h.col};return {type:"play",side,cardId:id,row:h.row,x:8.8,guaranteed:B.guaranteedArmed}}
function rectHit(r,x,y){return !!r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h}
function packetIcon(side,id){if(id===FIXED.plant)return "🌻";if(id===FIXED.zombie)return "🪦";try{return (side==="plant"?PLANTS[id]?.emoji:ZOMBIES[id]?.emoji)|| (side==="plant"?"🌿":"🧟")}catch(_){return side==="plant"?"🌿":"🧟"}}
function fixedCost(side,id){if(id===FIXED.plant)return 100;if(id===FIXED.zombie)return 50;return cfg(side,id)?.cost||0}
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
 drawRounded(packet,side==='plant'?'#d8c28f':'#9aa6b2',selected?'#facc15':'rgba(30,41,59,.92)',4);
 const inset={x:packet.x+3,y:packet.y+3,w:Math.max(1,packet.w-6),h:Math.max(1,packet.h-6)};drawRounded(inset,side==='plant'?'#ebe0b8':'#b9c2ca',null,3);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#17202a';ctx.font=`${Math.max(14,Math.min(25,packet.h*.42))}px sans-serif`;ctx.fillText(packetIcon(side,id),packet.x+packet.w/2,packet.y+packet.h*.43);
 ctx.font=`bold ${Math.max(8,Math.min(11,packet.w*.14))}px sans-serif`;ctx.fillStyle='#1f2937';ctx.fillText(String(cost),packet.x+packet.w/2,packet.y+packet.h-8);
 ctx.textAlign='left';ctx.font=`bold ${Math.max(7,Math.min(10,packet.w*.13))}px sans-serif`;ctx.fillStyle='#111827';ctx.fillText(String(packet.index+1),packet.x+5,packet.y+9);
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
 if(m.center){drawRounded(m.center,wood,'#3b2315',7);ctx.textAlign='center';ctx.fillStyle='#fff7d6';ctx.font='bold 12px sans-serif';ctx.fillText(`${Math.floor(state.time/60)}:${String(Math.floor(state.time%60)).padStart(2,'0')}`,m.center.x+m.center.w/2,m.center.y+15)}
 const drawCtl=(r,label,on)=>{drawRounded(r,on?'#365314':'rgba(58,35,21,.95)',on?'#bef264':'#9a6b45',5);ctx.fillStyle='#fff7ed';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 10px sans-serif';ctx.fillText(label,r.x+r.w/2,r.y+r.h/2)};
 drawCtl(m.controls.text,`B 文字${textIsVisible()?'开':'关'}`,textIsVisible());drawCtl(m.controls.anim,`V ${animIsTimeline()?'动画':'旧绘'}`,animIsTimeline());
 const side=B.humanSide||B.role;if(side==='plant')drawCtl(m.controls.tool,'🪏 Q',!!B.shovelMode);else if(side==='zombie'){const list=cardsFor('zombie'),id=list[B.selected.zombie||0],c=cfg('zombie',id);if(c?.guaranteed)drawCtl(m.controls.variant,`F 100%`,B.guaranteedArmed)}
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
window.S7VersusBattle={CARDS,FIXED,state:B,cfg,cardName,start:function(opt){resetRuntime(opt);return B},performAction,actionFromPointer,drawHud,handleHudPointer,hudMetrics,cardsFor,finish,keyAction,getSnapshot:()=>({active:B.active,result:B.result,resources:{...B.resources},time:state?.time||0,plantCards:B.plantCards.slice(),zombieCards:B.zombieCards.slice(),variantCount:{...B.variantCount},variantMeter:{...B.variantMeter}})};
})();
