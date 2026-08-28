// Legacy practice heuristic (pre-101), preserved ONLY as an A/B baseline
// opponent inside the lab. Never shipped; never used by real practice.
// Mirrors the old 100_versus_practice.js aiTick + autoChoice behavior.
export function makeLegacyDecide(){
  const lastAt = {plant: -1e9, zombie: -1e9};
  return function legacyDecide(side, api, st){
    const B = api.state;
    if (!B?.active || B.versus?.phase !== 'battle') return null;
    if (st.time - lastAt[side] < 1.0) return null;
    lastAt[side] = st.time;
    const list = api.cardsFor(side).slice(1);
    if (side === 'plant'){
      const giants = st.zombies.filter(z=>!z.dead&&!z.friendly&&(z.type==='garg'||z.type==='giga'));
      if (giants.length){ const g=giants.sort((a,b)=>a.x-b.x)[0];
        for (const id of ['jalapeno','cherrybomb','doomshroom']) if (list.includes(id)){
          const r=api.performAction({type:'play',side:'plant',cardId:id,row:g.row,col:Math.max(0,Math.min(8,Math.floor(g.x)))},'ai'); if(r.ok) return r } }
      const mowers=B.versus?.mowers||[];
      const targets=st.zombies.filter(z=>!z.dead&&z.versusObjective&&!z._targetCounted);
      const usedLanes=mowers.map((m,i)=>m?.state==='used'?i:-1).filter(x=>x>=0);
      if (usedLanes.length){ const dz=st.zombies.filter(z=>!z.dead&&!z.friendly&&!z.versusObjective&&usedLanes.includes(z.row)&&z.x<4);
        if (dz.length){ for (const id of ['wallnut','tallnut','spikerock']) if (list.includes(id)){
          const z=dz.sort((a,b)=>a.x-b.x)[0]; const col=Math.max(0,Math.min(5,Math.floor(z.x)-1));
          const r=api.performAction({type:'play',side:'plant',cardId:id,row:z.row,col},'ai'); if(r.ok) return r } } }
      if (targets.length>=2){ const weakest=targets.sort((a,b)=>(a.hp||0)-(b.hp||0))[0]; const tr=weakest.row;
        for (const id of ['snowpea','repeater','gatling','melon']) if (list.includes(id)){
          for (let col=5;col>=0;col--){ const r=api.performAction({type:'play',side:'plant',cardId:id,row:tr,col},'ai'); if(r.ok) return r } } }
      const ids=['snowpea','repeater','spikerock','melon','gatling','wallnut'].filter(x=>list.includes(x));
      for (const id of ids) for (let row=0;row<5;row++) for (let col=0;col<8;col++){
        const r=api.performAction({type:'play',side:'plant',cardId:id,row,col},'ai'); if(r.ok) return r }
    } else {
      const mowers=B.versus?.mowers||[];
      const readyLanes=mowers.map((m,i)=>m?.state==='ready'?i:-1).filter(x=>x>=0);
      const usedLanes=mowers.map((m,i)=>m?.state==='used'?i:-1).filter(x=>x>=0);
      if (readyLanes.length&&list.includes('normal')){
        const row=readyLanes[Math.floor(st.time/7)%readyLanes.length];
        const r=api.performAction({type:'play',side:'zombie',cardId:'normal',row},'ai'); if(r.ok) return r }
      const pushLanes=usedLanes.length?usedLanes:readyLanes;
      if (pushLanes.length){
        const order=['garg','giga','blackolive','zomboni','football','dancer','bucket'].filter(x=>list.includes(x));
        for (const id of order){ const c=api.cfg('zombie',id);
          const guar=!!(c?.guaranteed&&B.resources.zombie>=c.guaranteed&&((B.variantMeter[id]||0)<.35));
          const row=pushLanes[Math.floor(st.time/5)%pushLanes.length];
          const r=api.performAction({type:'play',side:'zombie',cardId:id,row,guaranteed:guar},'ai'); if(r.ok) return r } }
      const order=['garg','giga','blackolive','zomboni','football','dancer','bucket','normal'].filter(x=>list.includes(x));
      for (const id of order.concat(list)){ const c=api.cfg('zombie',id);
        const guar=!!(c?.guaranteed&&B.resources.zombie>=c.guaranteed&&((B.variantMeter[id]||0)<.35));
        const row=(Math.floor(st.time/3)+list.indexOf(id)+5)%5;
        const r=api.performAction({type:'play',side:'zombie',cardId:id,row,guaranteed:guar},'ai'); if(r.ok) return r }
    }
    return null;
  };
}
