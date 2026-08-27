import fs from 'fs';
import vm from 'vm';
const code=fs.readFileSync(new URL('../src/js/99_versus_battle_controller.js',import.meta.url),'utf8');
let nextId=1;
const ctx={
  console,
  performance:{now:()=>0}, setInterval:()=>1, clearInterval:()=>{}, Math,
  window:{addEventListener:()=>{}}, document:{getElementById:()=>null},
  innerWidth:1200, innerHeight:800, DPR:1,
  ctx:{save(){},restore(){},setTransform(){},fillRect(){},strokeRect(){},fillText(){},set fillStyle(v){},set strokeStyle(v){},set font(v){}},
  layout:{x:100,y:100,w:900,cell:100},
  PLANTS:new Proxy({}, {get:(t,k)=>({name:String(k),hp:300})}),
  ZOMBIES:new Proxy({}, {get:(t,k)=>({name:String(k),hp:k==='garg'?3000:k==='giga'?6000:270})}),
  makePlant:(key,row,col)=>({id:nextId++,key,row,col,hp:300,maxHp:300,dead:false}),
  makeZombie:(type,row,x,opt={})=>({id:nextId++,type,row,x:x??9.8,hp:type==='garg'?3000:type==='giga'?6000:270,maxHp:type==='garg'?3000:type==='giga'?6000:270,armors:[],speed:1,baseSpeed:1,speedNow:1,speedTarget:1,dead:false,friendly:false,s7:{variant:!!opt.variant}}),
  removePlant:p=>p.dead=true,
  damageZombie:(z,d)=>{z.hp-=d;if(z.hp<=0)z.dead=true}, addEffect:()=>{},
  state:null, canvas:{getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800})}
};
ctx.newState=()=>{ctx.state={time:0,running:false,battle:false,preRun:false,paused:false,plants:[],zombies:[],bullets:[],effects:[],pendingPlantEvents:[],teams:Array.from({length:5},(_,row)=>({row,alive:true,spawn:0})),s7:{}}};
ctx.window.window=ctx.window;ctx.window.S7VersusUI={showResult:()=>{}};
vm.createContext(ctx);vm.runInContext(code,ctx);const B=ctx.window.S7VersusBattle;
function assert(x,m){if(!x)throw new Error(m)}
B.start({mode:'practice',humanSide:'zombie',plantCards:['wallnut'],zombieCards:['garg','giga']});
assert(B.cfg('zombie','garg').cost===300,'garg cost');assert(B.cfg('zombie','garg').cd===50,'garg cd');assert(B.cfg('zombie','garg').guaranteed===500,'garg guaranteed');
assert(B.cfg('zombie','giga').cost===550,'giga cost');assert(B.cfg('zombie','giga').cd===50,'giga cd');assert(B.cfg('zombie','giga').guaranteed===850,'giga guaranteed');
let r=B.performAction({type:'play',side:'zombie',cardId:'garg',row:0,guaranteed:false});assert(!r.ok,'75 brain should not buy garg');assert((B.state.variantMeter.garg||0)===0,'failed buy must not move meter');
B.state.resources.zombie=500;ctx.state.time=400;r=B.performAction({type:'play',side:'zombie',cardId:'garg',row:0,guaranteed:true});assert(r.ok&&r.variant===true,'guaranteed garg');assert((B.state.variantMeter.garg||0)===0,'guaranteed variant must not move free meter');assert(B.state.resources.zombie===0,'guaranteed total cost must be 500');
B.start({mode:'practice',humanSide:'plant',plantCards:['wallnut'],zombieCards:['normal']});ctx.state.time=301;B.state.resources.plant=100;let e=B.performAction({type:'play',side:'plant',cardId:'twinSunflower',row:0,col:0});assert(!e.ok,'economy core locked after 5m');
const rr=B.finish('draw','40分钟未决，判定平局');assert(rr.winner==='draw','draw finish');
console.log('VERSUS_RULES_PASS');
