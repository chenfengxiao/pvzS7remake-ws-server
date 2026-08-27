"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert");
const bodyClasses=new Set();
const body={classList:{add:x=>bodyClasses.add(x),remove:x=>bodyClasses.delete(x),contains:x=>bodyClasses.has(x)}};
const game={classList:{remove(){}},style:{}};
let textToggles=0,animToggles=0;
const ctx={save(){},restore(){},setTransform(){},fillRect(){},strokeRect(){},fillText(){},beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},stroke(){},clearRect(){}};
const c={console,performance:{now:()=>0},innerWidth:1280,innerHeight:800,DPR:1,layout:{x:100,y:140,cell:70,w:630,h:350},ctx,document:{body,getElementById:id=>id==="game"?game:null},window:null,setInterval:()=>0,clearInterval(){},state:null,
 PLANTS:{wallnut:{name:"坚果",emoji:"🥜"},repeater:{name:"双发",emoji:"🌱"},snowpea:{name:"寒冰",emoji:"❄️"},spikerock:{name:"地刺王",emoji:"🌵"},jalapeno:{name:"辣椒",emoji:"🌶️"},sunflower:{name:"向日葵",emoji:"🌻"}},
 ZOMBIES:{normal:{name:"普通",emoji:"🧟"},bucket:{name:"铁桶",emoji:"🪣"},football:{name:"橄榄球",emoji:"🏈"},garg:{name:"巨人",emoji:"🧟"},giga:{name:"红眼",emoji:"🧟"}},
 toggleEntityText(){textToggles++},toggleS7AnimationRenderMode(){animToggles++},entityTextVisible:true,s7AnimationRenderMode:"legacy",addEffect(){},resize(){},removePlant(p){p.dead=true},damageZombie(z,a){z.hp-=a;if(z.hp<=0)z.dead=true}}
c.newState=()=>{c.state={time:0,plants:[],zombies:[],bullets:[],effects:[],pendingPlantEvents:[],running:false,battle:false,preRun:false,paused:false,sun:0,endMode:"allDead",teams:Array.from({length:5},()=>({alive:true,defeatAt:null,spawn:5}))}};
c.makePlant=(type,row,col)=>({id:"p",type,row,col,dead:false});
c.makeZombie=(type,row,x,opt={})=>({id:"z",type,row,x:x??9.5,hp:100,maxHp:100,dead:false,friendly:false,speed:1,baseSpeed:1,speedNow:1,speedTarget:1,armors:[],s7:{variant:!!opt.variant}});
c.window=c;c.window.addEventListener=()=>{};c.window.S7VersusUI={};c.window.S7VersusOnline={};vm.createContext(c);
vm.runInContext(fs.readFileSync("src/js/99_versus_battle_controller.js","utf8"),c);
const B=c.S7VersusBattle;
B.start({mode:"practice",humanSide:"plant",plantCards:["wallnut","repeater","snowpea","spikerock","jalapeno"],zombieCards:["normal","bucket","football","garg","giga"]});
assert(bodyClasses.has("versusBattleActive"));
B.drawHud();const m=B.hudMetrics(1280,800);assert.equal(m.plant.cards.length,6);assert.equal(m.zombie.cards.length,6);
let p=m.plant.cards[2];assert(B.handleHudPointer("plant",p.x+p.w/2,p.y+p.h/2,1280,800));assert.equal(B.state.selected.plant,2);
let r=m.controls.text;assert(B.handleHudPointer("plant",r.x+2,r.y+2,1280,800));assert.equal(textToggles,1);
r=m.controls.anim;assert(B.handleHudPointer("plant",r.x+2,r.y+2,1280,800));assert.equal(animToggles,1);
assert.equal(B.keyAction({key:"V"}),false,"V must be reserved for animation, not variants");
B.start({mode:"practice",humanSide:"zombie",plantCards:["wallnut","repeater","snowpea","spikerock","jalapeno"],zombieCards:["normal","bucket","football","garg","giga"]});
B.performAction({type:"select",side:"zombie",index:2});assert(B.keyAction({key:"F"}));assert(B.state.guaranteedArmed);
const html=fs.readFileSync("index.html","utf8"),ui=fs.readFileSync("src/js/80_ui_quad.js","utf8"),rt=fs.readFileSync("src/js/98_versus_realtime_sync.js","utf8"),css=fs.readFileSync("src/styles/main.css","utf8");
for(const id of ["battleTextBtn","battleAnimBtn"])assert(html.includes(`id="${id}"`),`${id} missing from multiplayer battle overlay`);
assert(ui.includes("battleTextBtn")&&ui.includes("toggleEntityText"));assert(ui.includes("battleAnimBtn")&&ui.includes("toggleS7AnimationRenderMode"));
assert(/\[1-7qQbBvVfF\]/.test(rt));assert(rt.includes("toggleEntityText()"));assert(rt.includes("toggleS7AnimationRenderMode()"));assert(rt.includes("performAction?.({type:'toggleGuaranteed',side:'zombie'})"));
assert(css.includes("body.versusBattleActive #side")&&css.includes("body.versusBattleActive #game"));
B.finish("draw","test");assert(!bodyClasses.has("versusBattleActive"),"Versus fullscreen class must be removed when battle ends");
console.log("VERSUS_TV_HUD_CONTROLS_PASS",{plantPackets:6,zombiePackets:6,textToggles,animToggles});
