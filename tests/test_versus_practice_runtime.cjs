const fs = require('fs');
const vm = require('vm');

const game = { classList:{ removed:[], remove(v){this.removed.push(v)} }, style:{} };
const listeners = {};
const context = {
  console,
  performance:{ now:()=>0 },
  innerWidth:1280,
  innerHeight:800,
  DPR:1,
  layout:{x:100,y:100,cell:70,w:630,h:350},
  document:{ getElementById:(id)=>id==='game'?game:null },
  window:null,
  setInterval:()=>0,
  setTimeout:(fn)=>{ fn(); return 0; },
  clearInterval:()=>{},
  state:null,
  PLANTS:{wallnut:{name:'坚果'},sunflower:{name:'向日葵'},repeater:{name:'双发'},snowpea:{name:'寒冰'},spikerock:{name:'地刺王'},jalapeno:{name:'辣椒'}},
  ZOMBIES:{normal:{name:'普通'},cone:{name:'路障'},bucket:{name:'铁桶'},football:{name:'橄榄球'},garg:{name:'巨人'}},
  addEffect(){},
  ctx:{save(){},restore(){},setTransform(){},fillRect(){},strokeRect(){},fillText(){},clearRect(){},fillStyle:'',strokeStyle:'',font:'',textAlign:''},
};
context.newState=()=>{ context.state={time:0,plants:[],zombies:[],bullets:[],effects:[],pendingPlantEvents:[],running:false,battle:false,preRun:false,paused:false,sun:0,endMode:'allDead',teams:Array.from({length:5},(_,row)=>({row,alive:true,defeatAt:null,spawn:5}))}; };
context.makePlant=(type,row,col)=>({id:'p'+Math.random(),type,row,col,dead:false,name:context.PLANTS[type]?.name||type});
context.makeZombie=(type,row,x,opt={})=>({id:'z'+Math.random(),type,row,x:x??9.5,hp:100,maxHp:100,dead:false,friendly:false,speed:1,baseSpeed:1,speedNow:1,speedTarget:1,armors:[],s7:{variant:!!opt.variant}});
context.removePlant=p=>{p.dead=true};
context.damageZombie=(z,amount)=>{z.hp-=amount;if(z.hp<=0)z.dead=true};
context.window=context;
context.window.addEventListener=(type,fn)=>{listeners[type]=fn};
context.window.S7VersusUI={};
context.window.S7VersusOnline={};
vm.createContext(context);
const code=fs.readFileSync('src/js/99_versus_battle_controller.js','utf8');
vm.runInContext(code,context,{filename:'99_versus_battle_controller.js'});
const B=context.window.S7VersusBattle;
if(!B) throw new Error('S7VersusBattle not exported');
B.start({mode:'practice',humanSide:'plant',plantCards:['wallnut','repeater','snowpea','spikerock','jalapeno'],zombieCards:['normal','cone','bucket','football','garg']});
if(game.style.display!=='block') throw new Error('#game not forced visible');
if(!context.state.battle || context.state.preRun) throw new Error('practice must start in real battle state');
if(context.state.versus?.manualSpawn!==true) throw new Error('manualSpawn must disable only auto spawning');
const p0=context.state.plants.length,z0=context.state.zombies.length;
const plant=B.performAction({type:'play',side:'plant',cardId:'wallnut',row:2,col:4});
const zombie=B.performAction({type:'play',side:'zombie',cardId:'normal',row:2});
if(!plant.ok || !context.state.plants.some(p=>!p.dead&&p.type==='wallnut'&&p.row===2&&p.col===4)) throw new Error('plant placement failed');
if(!zombie.ok || !context.state.zombies.some(z=>!z.dead&&!z.versusStatic&&z.type==='normal'&&z.row===2)) throw new Error('zombie deployment failed');
if(context.state.plants.length!==p0+1) throw new Error('unexpected plant count');
if(context.state.zombies.length!==z0+1) throw new Error('unexpected zombie count');
const practice=fs.readFileSync('src/js/100_versus_practice.js','utf8');
if(!practice.includes("type:'select'")) throw new Error('canvas HUD card selection path missing');
if(!practice.includes('insideBoard')) throw new Error('board hit test missing');
const rendering=fs.readFileSync('src/js/70_rendering.js','utf8');
if(!rendering.includes('updateLaneTurn(t, step, allowAutomaticSpawn)')) throw new Error('battle loop does not pass manual spawn gate');
console.log('VERSUS_PRACTICE_RUNTIME_PASS', {plants:context.state.plants.length,zombies:context.state.zombies.length,battle:context.state.battle,manualSpawn:context.state.versus.manualSpawn});
