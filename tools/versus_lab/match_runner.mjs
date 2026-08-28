// Headless Versus match runner: drives the REAL 99 battle controller + shared
// 101 AI policy at fixed logic quantum. No wall-clock, no RNG beyond the
// battle seed. Both sides use S7VersusAI.decide (same API as real practice).
import {createS7HeadlessRuntime} from './headless_runtime.mjs';

export function runMatch({seed=1, plantCards=null, zombieCards=null, maxSeconds=2500, decideInterval=1.0, tickStep=0.2, onFrame=null}={}){
  const rt = createS7HeadlessRuntime();
  const battle = rt.S7VersusBattle;
  if (typeof rt.s7SetBattleSeed === 'function') rt.s7SetBattleSeed(seed >>> 0 || 1);
  const pools = {plant: Object.keys(battle.CARDS.plant), zombie: Object.keys(battle.CARDS.zombie)};
  if (!plantCards) plantCards = rt.S7VersusAI.draftDeck('plant', pools.plant, 5);
  if (!zombieCards) zombieCards = rt.S7VersusAI.draftDeck('zombie', pools.zombie, 5);
  battle.start({mode:'practice', humanSide:null, plantCards, zombieCards, online:false, isHost:true});
  const DT = rt.FIXED_FRAME_DT;
  const st = rt.getState();
  let acc = 0;
  let lastDecide = {plant: -1e9, zombie: -1e9};
  let frames = 0;
  const maxFrames = Math.ceil((maxSeconds + 30) / DT);
  while (st.running && frames < maxFrames){
    rt.update(DT);
    acc += DT; frames++;
    if (acc >= tickStep - 1e-9){ battle.tick(acc); acc = 0; }
    const t = st.time;
    for (const side of ['plant','zombie']){
      if (t - lastDecide[side] >= decideInterval){ lastDecide[side] = t; rt.S7VersusAI.decide(side, battle); }
    }
    if (onFrame) onFrame(rt, battle, frames);
  }
  const result = battle.state.versus?.result || null;
  return {
    result, time: st.time, frames,
    plantCards, zombieCards,
    ledger: battle.getLedger(),
    snapshot: battle.getSnapshot()
  };
}
