// AI 决策语义回归：用场景化对局验证共享政策的关键行为。
import {createS7HeadlessRuntime} from './headless_runtime.mjs';

function check(name, cond, detail){
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  return ok;
}

function run(){
  let failed = 0;

  // 1) 僵尸会骗 mower：READY 路在开局有低成本单位进场
  {
    const rt = createS7HeadlessRuntime();
    const b = rt.S7VersusBattle;
    b.start({mode:'practice', humanSide:null, plantCards:['repeater','wallnut','gatling','cherrybomb','hypno'], zombieCards:['normal','cone','bucket','football','garg'], online:false, isHost:true});
    const st = rt.getState();
    b.state.resources.zombie = 500;
    const before = st.zombies.filter(z=>!z.dead&&!z.versusStatic&&!z.versusObjective).length;
    for (let i=0;i<300;i++){ rt.update(rt.FIXED_FRAME_DT); if (i%5===0) b.tick(0.2); if (i%25===0) rt.S7VersusAI.decide('zombie', b); }
    // 前12秒内应有低成本僵尸进场（骗车/侦察）
    const after = st.zombies.filter(z=>!z.dead&&!z.versusStatic&&!z.versusObjective).length;
    failed += check('zombie早期低成本进场(骗车/侦察)', after > before, `before=${before} after=${after}`) ? 0 : 1;
  }

  // 2) 植物优先在开放目标路铺 DPS（无墓碑路先有输出）
  {
    const rt = createS7HeadlessRuntime();
    const b = rt.S7VersusBattle;
    b.start({mode:'practice', humanSide:null, plantCards:['repeater','wallnut','gatling','cherrybomb','hypno'], zombieCards:['normal','cone','bucket','football','garg'], online:false, isHost:true});
    const st = rt.getState();
    b.state.resources.plant = 3000;
    for (let i=0;i<750;i++){ rt.update(rt.FIXED_FRAME_DT); if (i%5===0) b.tick(0.2); rt.S7VersusAI.decide('plant', b); }
    const openLanes = [0,2,4].filter(r => !st.zombies.some(z=>!z.dead&&z.versusStatic==='grave'&&z.row===r));
    const dpsInOpen = openLanes.filter(r => st.plants.some(p=>!p.dead&&!p.versusCore&&p.row===r)).length;
    failed += check('植物开放目标路铺DPS', dpsInOpen >= 2, `openLanes=${openLanes} 有DPS的路=${dpsInOpen}`) ? 0 : 1;
  }

  // 3) 灰烬在付费僵尸聚集时引爆（人工摆 3 个高付费僵尸聚集；付费价值远超引爆阈值）
  {
    const rt = createS7HeadlessRuntime();
    const b = rt.S7VersusBattle;
    b.start({mode:'practice', humanSide:null, plantCards:['cherrybomb','wallnut','repeater'], zombieCards:['normal','garg','football','tallz'], online:false, isHost:true});
    const st = rt.getState();
    b.state.resources.plant = 2000;
    // 通过真实出牌购买高付费僵尸并聚集（有付费账本记录）；3 张不同卡互不共享 CD，无需等满
    b.state.resources.zombie = 3000;
    const runFrames = n => { for (let i=0;i<n;i++){ rt.update(rt.FIXED_FRAME_DT); if (i%5===0) b.tick(0.2); } };
    const heavyCluster = ['garg','football','tallz']; // 300 + 165 + 250 = 715 >> 樱桃阈值 202.5
    for (let r=1;r<=3;r++){
      const id = heavyCluster[r-1];
      const rr = b.performAction({type:'play',side:'zombie',cardId:id,row:r},'ai');
      if (!rr.ok) return console.log(id+' deploy failed', rr);
      const z = st.zombies.find(z=>z.id===rr.entityId);
      if (z){ z.x = 5; z.stun = 1e9; } // 测试夹具：钉住不移动，保持聚集
      runFrames(60); // 推进若干帧登记部署（不同卡无共享CD）
    }
    b.state.resources.plant = 2000;
    const ashBefore = b.state.ledger.deployments.filter(d=>d.cardId==='cherrybomb').length;
    for (let i=0;i<120;i++){ rt.update(rt.FIXED_FRAME_DT); if (i%5===0) b.tick(0.2); if (i%10===0) rt.S7VersusAI.decide('plant', b); }
    const ashAfter = b.state.ledger.deployments.filter(d=>d.cardId==='cherrybomb').length;
    failed += check('灰烬对聚集付费僵尸引爆', ashAfter > ashBefore, `before=${ashBefore} after=${ashAfter}`) ? 0 : 1;
  }

  // 4) Target 掉血后僵尸在同路补墓碑防守
  {
    const rt = createS7HeadlessRuntime();
    const b = rt.S7VersusBattle;
    b.start({mode:'practice', humanSide:null, plantCards:['repeater','wallnut','gatling'], zombieCards:['normal','cone','bucket','football','garg'], online:false, isHost:true});
    const st = rt.getState();
    b.state.resources.zombie = 1000;
    const t2 = st.zombies.find(z=>z.versusObjective&&z.row===2);
    t2.hp -= 120; // 掉血超过 defendTargetHpDrop(40)
    const graveBefore = st.zombies.filter(z=>!z.dead&&z.versusStatic==='grave'&&z.row===2).length;
    for (let i=0;i<400;i++){ rt.update(rt.FIXED_FRAME_DT); if (i%5===0) b.tick(0.2); rt.S7VersusAI.decide('zombie', b); }
    const graveAfter = st.zombies.filter(z=>!z.dead&&z.versusStatic==='grave'&&z.row===2).length;
    failed += check('受伤Target路补墓碑', graveAfter > graveBefore, `row2 graves ${graveBefore}->${graveAfter}`) ? 0 : 1;
  }

  // 5) Draft：BP ban 对方高价值核心
  {
    const rt = createS7HeadlessRuntime();
    const ban = rt.S7VersusAI.draftChoice('plant','ban', Object.keys(rt.S7VersusBattle.CARDS.zombie), ()=>false, {});
    failed += check('ban 优先僵尸核心', ['garg','giga','zomboni','dancer','bobsledSled'].includes(ban), `ban=${ban}`) ? 0 : 1;
    const pick = rt.S7VersusAI.draftChoice('zombie','pick', Object.keys(rt.S7VersusBattle.CARDS.zombie), id=>['garg','normal'].includes(id), {});
    failed += check('pick 避开已选并选可用卡', !!pick && !['garg','normal'].includes(pick), `pick=${pick}`) ? 0 : 1;
  }

  if (failed){ console.log(`AI_SEMANTIC_FAIL ${failed}`); process.exit(1); }
  console.log('AI_SEMANTIC_ALL_PASS');
}
run();
