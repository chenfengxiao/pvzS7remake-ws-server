// Versus rule scenario engine. This file is plain script (no imports) so the
// SAME text can be eval'd inside the headless VM and a real browser page.
// Scenarios are pure data + string expressions; outcomes must be identical
// in both environments (real-vs-headless rule parity).
globalThis.__VERSUS_SCENARIO_RUN = function(spec){
  const battle = window.S7VersusBattle;
  const DT = FIXED_FRAME_DT;
  if (typeof s7SetBattleSeed === 'function') s7SetBattleSeed(spec.seed >>> 0 || 1);
  battle.start({mode:'practice', humanSide:null, plantCards:spec.plantCards||['repeater'], zombieCards:spec.zombieCards||['normal'], online:false, isHost:true});
  const st = state;
  const ctx = {battle, st, actions: [], log: []};
  const evalIn = code => eval(code);
  for (const s of (spec.setup || [])) evalIn(s.code);
  const maxFrames = Math.ceil((spec.maxSeconds || 60) / DT);
  let acc = 0;
  let stop = false;
  for (let f = 0; f < maxFrames && !stop; f++){
    update(DT); acc += DT;
    if (acc >= 0.2 - 1e-9){ battle.tick(acc); acc = 0; }
    for (const a of (spec.actions || [])){
      if (a._done) continue;
      if (a.at != null && st.time >= a.at){ a._done = true; a.result = a.eval ? evalIn(a.eval) : battle.performAction(a.act, 'ai'); }
      else if (a.when && evalIn(a.when)){ a._done = true; a.result = a.eval ? evalIn(a.eval) : battle.performAction(a.act, 'ai'); }
    }
    if (spec.stopWhen && evalIn(spec.stopWhen)) stop = true;
    if (!st.running) break;
  }
  const probes = {};
  for (const [k, code] of Object.entries(spec.probes || {})){
    try { probes[k] = evalIn(code); } catch (e) { probes[k] = 'PROBE_ERROR:' + String(e && e.message || e); }
  }
  return { name: spec.name, time: Math.round(st.time * 1000) / 1000, result: battle.state.versus?.result || null,
    probes, actions: (spec.actions || []).map(a => ({at: a.at, when: a.when, done: !!a._done, ok: a.result && a.result.ok !== undefined ? a.result.ok : undefined, reason: a.result && a.result.reason})) };
};
