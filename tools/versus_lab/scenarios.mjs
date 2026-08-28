// Versus rule scenarios (frozen rules 2026-08-28). Pure data + string exprs,
// executed identically by headless VM and real browser for parity.
// probe exprs run inside game context: state, S7VersusBattle, window available.
const B = 'window.S7VersusBattle';
const grave = (row, x) => `state.zombies.find(z=>z.versusStatic==="grave"&&z.row===${row}${x != null ? `&&Math.abs(z.x-${x})<.01` : ''})`;
const target = row => `state.zombies.find(z=>z.versusObjective&&z.row===${row})`;

export const SCENARIOS = [
 { name:'potato-ignores-gravestone', seed:11, plantCards:['potato'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;${B}.state.resources.zombie=2000`}],
   actions:[
     {at:0.2, act:{type:'play',side:'plant',cardId:'potato',row:2,col:4}},
     {at:0.4, act:{type:'play',side:'zombie',cardId:'zombieGravestone',row:2,x:8.5}}
   ],
   maxSeconds:8,
   probes:{
     graveHp:`(${grave(2,8.5)})?.hp`,
     potatoAlive:`state.plants.some(p=>!p.dead&&p.key==="potato")`,
     targetHp:`(${target(2)})?.hp`
   },
   expect:{ graveHp:400, potatoAlive:true, targetHp:200 } },

 { name:'potato-ignores-target', seed:12, plantCards:['potato'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000`}],
   actions:[{at:0.2, act:{type:'play',side:'plant',cardId:'potato',row:2,col:4}}],
   maxSeconds:8,
   probes:{ targetHp:`(${target(2)})?.hp`, potatoAlive:`state.plants.some(p=>!p.dead&&p.key==="potato")` },
   expect:{ targetHp:200, potatoAlive:true } },

 { name:'potato-hits-normal-zombie', seed:13, plantCards:['potato'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;${B}.state.resources.zombie=2000`}],
   actions:[
     {at:0.2, act:{type:'play',side:'plant',cardId:'potato',row:2,col:4}},
     {at:0.4, act:{type:'play',side:'zombie',cardId:'normal',row:2}}
   ],
   stopWhen:`state.zombies.some(z=>z.type==="normal"&&z.row===2&&(z.hp<z.maxHp||z.dead))`,
   maxSeconds:60,
   probes:{ zombieHurt:`state.zombies.filter(z=>z.type==="normal"&&z.row===2).some(z=>z.hp<z.maxHp||z.dead)` },
   expect:{ zombieHurt:true } },

 { name:'fume-protector-caps-20', seed:14, plantCards:['fume'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;const gs=state.zombies.filter(z=>z.versusStatic==="grave");if(gs[0]){gs[0].row=2;gs[0].x=7.5}if(gs[1]){gs[1].row=2;gs[1].x=8.5}`}],
   actions:[
     {at:2.0, act:{type:'play',side:'plant',cardId:'fume',row:2,col:0}}
   ],
   stopWhen:`(${grave(2,7.5)})&&(${grave(2,7.5)}).hp<400`,
   maxSeconds:40,
   probes:{
     protectorDamage:`400-(${grave(2,7.5)})?.hp`,
     otherGraveHp:`((${grave(2,8.5)})?.hp) ?? "dead:"+((${grave(2,8.5)})?.dead)`,
     targetHp:`(${target(2)})?.hp`
   },
   expect:{ otherGraveHp:400, targetHp:200 }, expectMax:{ protectorDamage:20 }, expectMin:{ protectorDamage:1 } },

 { name:'fume-no-same-pulse-cascade', seed:15, plantCards:['fume'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;const gs=state.zombies.filter(z=>z.versusStatic==="grave");if(gs[0]){gs[0].row=2;gs[0].x=7.5;gs[0].hp=10;window.__protector=gs[0]}if(gs[1]){gs[1].row=2;gs[1].x=8.5}`}],
   actions:[
     {at:2.0, act:{type:'play',side:'plant',cardId:'fume',row:2,col:0}}
   ],
   stopWhen:`!!(window.__protector&&(window.__protector.dead||window.__protector.hp<=0))`,
   maxSeconds:40,
   probes:{
     protectorDead:`!!(window.__protector&&(window.__protector.dead||window.__protector.hp<=0))`,
     otherGraveHp:`(${grave(2,8.5)})?.hp`,
     targetHp:`(${target(2)})?.hp`
   },
   expect:{ protectorDead:true, otherGraveHp:400, targetHp:200 } },

 { name:'fume-no-grave-target-takes-existing-rule-damage', seed:16, plantCards:['fume'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000`}],
   actions:[{at:0.2, act:{type:'play',side:'plant',cardId:'fume',row:2,col:0}}],
   stopWhen:`(${target(2)})&&(${target(2)}).hp<200`,
   maxSeconds:40,
   probes:{ targetHp:`(${target(2)})?.hp` },
   expectMin:{ targetHp:0.1 }, expectMax:{ targetHp:199.9 } },

 { name:'fume-normal-zombie-full-pierce-beside-protector', seed:17, plantCards:['fume'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;${B}.state.resources.zombie=2000`}],
   actions:[
     {at:0.2, act:{type:'play',side:'zombie',cardId:'zombieGravestone',row:2,x:8.5}},
     {at:0.4, act:{type:'play',side:'zombie',cardId:'normal',row:2}},
     {at:0.6, eval:`(()=>{const z=state.zombies.find(z=>z.type==="normal"&&z.row===2&&!z.versusStatic);if(z){z.x=6;}})()`},
     {at:1.5, act:{type:'play',side:'plant',cardId:'fume',row:2,col:0}}
   ],
   stopWhen:`state.zombies.some(z=>z.type==="normal"&&z.row===2&&!z.versusStatic&&z.hp<z.maxHp)`,
   maxSeconds:40,
   probes:{
     zombieDamage:`(()=>{const z=state.zombies.find(z=>z.type==="normal"&&z.row===2&&!z.versusStatic);return z?z.maxHp-z.hp:-1})()`,
     graveDamage:`400-((${grave(2,8.5)})?.hp??400)`,
     targetHp:`(${target(2)})?.hp`
   },
   expectMin:{ zombieDamage:10 }, expectMax:{ graveDamage:20 }, expect:{ targetHp:200 } },

 { name:'ash-locked-cost-cd', seed:18,
   probes:{
     cherry:`JSON.stringify(${B}.cfg("plant","cherrybomb"))`,
     jalapeno:`JSON.stringify(${B}.cfg("plant","jalapeno"))`,
     doom:`JSON.stringify(${B}.cfg("plant","doomshroom"))`
   },
   expect:{
     cherry:'{"cost":150,"cd":50,"guaranteed":null,"command":false}',
     jalapeno:'{"cost":125,"cd":50,"guaranteed":null,"command":false}',
     doom:'{"cost":200,"cd":50,"guaranteed":null,"command":false}' } },

 { name:'ash-hits-only-fighters', seed:19, plantCards:['cherrybomb'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.plant=2000;${B}.state.resources.zombie=2000;const g=state.zombies.find(z=>z.versusStatic==="grave"&&z.row===1);if(g){g.row=2;g.x=8.0}`}],
   actions:[
     {at:0.6, act:{type:'play',side:'zombie',cardId:'normal',row:2}},
     {at:0.8, eval:`(()=>{const z=state.zombies.find(z=>z.type==="normal"&&!z.versusStatic&&!z.versusObjective);if(z){z.x=7.6;window.__fighter=z}})()`},
     {at:1.2, act:{type:'play',side:'plant',cardId:'cherrybomb',row:2,col:7}}
   ],
   maxSeconds:5,
   probes:{
     targetHp:`(${target(2)})?.hp`,
     graveHp:`(${grave(2,8.0)})?.hp`,
     fighterHurt:`(()=>{const z=window.__fighter;return z?(z.hp<z.maxHp||z.dead):"no-fighter"})()`
   },
   expect:{ targetHp:200, graveHp:400, fighterHurt:true } },

 { name:'mower-lifecycle-then-house-breach', seed:20, plantCards:['repeater'], zombieCards:['normal'],
   setup:[{code:`${B}.state.resources.zombie=2000`}],
   actions:[
     {at:0.5, act:{type:'play',side:'zombie',cardId:'normal',row:0}},
     {when:`(${B}.state.versus.mowers[0].state)==="used"`, act:{type:'play',side:'zombie',cardId:'normal',row:0}}
   ],
   stopWhen:`!!(${B}.state.versus.result)`,
   maxSeconds:400,
   probes:{
     mowerState:`${B}.state.versus.mowers[0].state`,
     winner:`${B}.state.versus.result?.winner||"none"`,
     reason:`${B}.state.versus.result?.reason||""`
   },
   expect:{ mowerState:'used', winner:'zombie' } },

 { name:'sudden-death-rules', seed:21, plantCards:['twinSunflower'], zombieCards:['zombieGravestone'],
   setup:[{code:`state.time=299.0;${B}.state.resources.plant=2000;${B}.state.resources.zombie=2000;state.plants.length=0;state.zombies=state.zombies.filter(z=>z.versusObjective)`}],
   actions:[
     {at:301.0, eval:`window.__sdTwinTry=${B}.performAction({type:'play',side:'plant',cardId:'twinSunflower',row:0,col:0},'ai').ok`},
     {at:301.0, eval:`window.__sdGraveTry=${B}.performAction({type:'play',side:'zombie',cardId:'zombieGravestone',row:0,x:8.5},'ai').ok`},
     {at:299.5, eval:`window.__sdSunBefore=${B}.state.resources.plant;window.__sdBrainBefore=${B}.state.resources.zombie`}
   ],
   maxSeconds:22.5,
   probes:{
     suddenDeath:`!!${B}.state.versus.suddenDeath`,
     twinRejected:`window.__sdTwinTry===false`,
     graveRejected:`window.__sdGraveTry===false`,
     skyPlant:`${B}.state.resources.plant-window.__sdSunBefore`,
     skyZombie:`${B}.state.resources.zombie-window.__sdBrainBefore`
   },
   expect:{ suddenDeath:true, twinRejected:true, graveRejected:true, skyPlant:50, skyZombie:50 } },

 { name:'draw-at-2400', seed:22, plantCards:['repeater'], zombieCards:['normal'],
   setup:[{code:`state.time=2399.4`}],
   maxSeconds:2405,
   stopWhen:`!!(${B}.state.versus.result)`,
   probes:{ winner:`${B}.state.versus.result?.winner||"none"` },
   expect:{ winner:'draw' } },

 { name:'three-targets-plant-win', seed:23, plantCards:['repeater'], zombieCards:['normal'],
   setup:[{code:`for(const r of [0,1,2]){const t=${target('R')};}`.replace('R','0') + ''}],
   actions:[
     {at:0.5, eval:`for(const r of [0,1,2]){const t=state.zombies.find(z=>z.versusObjective&&z.row===r);damageZombie(t,200,{noSource:true})}`}
   ],
   stopWhen:`!!(${B}.state.versus.result)`,
   maxSeconds:20,
   probes:{ winner:`${B}.state.versus.result?.winner||"none"`, destroyed:`${B}.state.versus.target.destroyed` },
   expect:{ winner:'plant', destroyed:3 } },

 { name:'single-target-death-no-win', seed:25, plantCards:['repeater'], zombieCards:['normal'],
   setup:[{code:`window.S7VersusBattle.state.resources.plant=2000`}],
   actions:[
     {at:0.5, eval:`const t=state.zombies.find(z=>z.versusObjective&&z.row===0);damageZombie(t,200,{noSource:true})`}
   ],
   maxSeconds:6,
   probes:{ winner:`${B}.state.versus.result?.winner||"none"`, destroyed:`${B}.state.versus.target.destroyed` },
   expect:{ winner:'none', destroyed:1 } },

 { name:'twin-economy-production', seed:24, plantCards:['repeater'], zombieCards:['normal'],
   maxSeconds:14,
   probes:{ plant:`${B}.state.resources.plant` },
   expectMin:{ plant:125 }, expectMax:{ plant:126 } }
];
