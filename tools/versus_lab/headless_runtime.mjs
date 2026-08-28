// Headless real-core runtime for S丐 1.7.8 Versus.
// Loads the CURRENT worktree src/js in a Node VM with a DOM shim, so training
// and tests exercise the exact shipping battle code (no source snapshot).
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'src', 'js');

// Load order mirrors index.html: core engine first, versus profile/controller last.
const CORE_FILES = [
 '00_bootstrap.js','09_visual_calibration.js','10_animation_core.js','11_animation_plants.js','12_animation_zombies.js','13_projectiles_effects.js',
 '20_config_rules.js','21_entity_registry.js','22_versus_feature_profiles.js','23_versus_card_cooldowns.js','24_versus_bp_draft.js',
 '30_state_geometry.js','31_query_collision.js','40_projectiles_helpers.js','50_plant_simulation.js','51_damage_combat.js','60_zombie_simulation.js',
 '70_rendering.js','90_s7_progression.js','91_s7_elements_shooting.js','92_s7_plant_actions.js','93_s7_special_systems.js','94_s7_blind_commands_main.js',
 '99_versus_battle_controller.js','101_versus_ai_policy.js'
];

function noop(){}
function createDomShim(){
  let dummyEl;
  const dummyCtx = new Proxy({}, {get(t,p){if(p==='measureText')return ()=>({width:0});if(p==='canvas')return dummyEl;if(!(p in t))t[p]=noop;return t[p]},set(t,p,v){t[p]=v;return true}});
  const classList = {add:noop,remove:noop,toggle:()=>false,contains:()=>false};
  dummyEl = new Proxy({style:{setProperty:noop,removeProperty:noop},classList,checked:true,value:'',textContent:'',innerHTML:'',outerHTML:'<html><head></head><body></body></html>',width:800,height:400,dataset:{},children:[]},
    {get(t,p){if(p==='getContext')return ()=>dummyCtx;if(['addEventListener','removeEventListener','appendChild','remove','setAttribute','focus','click'].includes(p))return noop;if(p==='querySelector'||p==='closest')return ()=>dummyEl;if(p==='querySelectorAll')return ()=>[];if(p==='getBoundingClientRect')return ()=>({left:0,top:0,width:800,height:400,right:800,bottom:400});if(!(p in t))t[p]=null;return t[p]},set(t,p,v){t[p]=v;return true}});
  const document = {body:dummyEl,documentElement:dummyEl,hidden:false,readyState:'complete',getElementById:()=>dummyEl,querySelector:()=>dummyEl,querySelectorAll:()=>[],createElement:()=>dummyEl,addEventListener:noop,removeEventListener:noop};
  return {document,dummyEl};
}
class DummyImage{constructor(){this.complete=true;this.naturalWidth=1;this.naturalHeight=1;this.width=1;this.height=1;this.onload=null;this.onerror=null;this.src=''}}
class DummyAudio{constructor(){this.src='';this.currentTime=0;this.volume=1}play(){return Promise.resolve()}pause(){}cloneNode(){return new DummyAudio()}}

function makeContext(){
  const {document} = createDomShim();
  const map = new Map();
  const storage = {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
  const c = {console,Math,JSON,Date,URL,URLSearchParams,performance,document,navigator:{userAgent:'S7RealCoreHeadless178',maxTouchPoints:0,userAgentData:{mobile:false}},screen:{width:1440,height:900},innerWidth:1440,innerHeight:900,location:{hash:'',href:'http://headless.local/'},matchMedia:()=>({matches:false,addEventListener:noop,removeEventListener:noop}),Image:DummyImage,Audio:DummyAudio,localStorage:storage,sessionStorage:storage,requestAnimationFrame:()=>0,cancelAnimationFrame:noop,setInterval:()=>0,clearInterval:noop,setTimeout:()=>0,clearTimeout:noop,alert:noop,devicePixelRatio:1,name:'',open:()=>null,addEventListener:noop,removeEventListener:noop};
  c.window = c; c.globalThis = c; c.self = c; return c;
}

function buildBundle(){
  let src = '"use strict";\nfunction reportQuadProgress(){ return null; }\n';
  for (const f of CORE_FILES){
    let s = fs.readFileSync(path.join(SRC, f), 'utf8');
    // 94 tail wire() binds DOM UI; skip in headless.
    if (f === '94_s7_blind_commands_main.js') s = s.replace(/\n\s*wire\(\)\s*$/, '\n');
    src += `\n// SOURCE:${f}\n${s}\n`;
  }
  // Headless-only presentation strip: visual effect allocation removed, gameplay intact.
  src += `
addEffect=function(){ return null; };
addGridEffect=function(){ return null; };
if(typeof s7AddSpriteEffect!=='undefined') s7AddSpriteEffect=function(){ return null; };
globalThis.__S7_HEADLESS_EXPORTS={
  FIXED_FRAME_DT, LOGIC_QUANTUM_SECONDS:FIXED_FRAME_DT, ROWS, COLS, PLANTS, ZOMBIES,
  S7_VERSUS_PROFILE, S7_VERSUS_RULES, S7VersusBattle, S7VersusAI: (typeof S7VersusAI!=='undefined'?S7VersusAI:null),
  newState, makePlant, makeZombie, update, damagePlant, damageZombie, killZombie, removePlant,
  getState:()=>state, s7SetBattleSeed, s7BattleRandom,
  _eval:(code)=>eval(code)
};
`;
  return src;
}

let cachedScript = null;
export function createS7HeadlessRuntime(){
  const context = makeContext();
  vm.createContext(context);
  if (!cachedScript) cachedScript = new vm.Script(buildBundle(), {filename:'s7_realcore_headless_178_bundle.js'});
  cachedScript.runInContext(context, {timeout: 30000});
  return context.__S7_HEADLESS_EXPORTS;
}
export function sourceFiles(){ return [...CORE_FILES]; }
