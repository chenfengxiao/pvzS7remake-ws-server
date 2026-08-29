"""Verify versus blind-box zombie determinism/diversity and ash plant 0.96s detonation."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from playwright_browser import launch_chromium, open_standalone_page

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'dist', 'S7_FAST_ENTRY.html')

with open(HTML, encoding='utf-8') as f:
    html = f.read()

BLIND_BOX_RUN = """() => {
  const VB = window.S7VersusBattle;
  VB.start({mode:'practice', humanSide:'plant'});
  const B = VB.state;
  B.resources.zombie = 999999; B.resources.plant = 999999;
  let r = VB.performAction({type:'play', side:'zombie', cardId: VB.FIXED.zombie, row:1, x:7.5});
  if(!r.ok) return {fail:'grave: '+r.reason};
  r = VB.performAction({type:'play', side:'zombie', cardId: VB.FIXED.mystery, row:1, x:7.5});
  if(!r.ok) return {fail:'upgrade: '+r.reason};
  const picks = [];
  for(let i=0;i<8;i++){
    const before = new Set(state.zombies.map(z=>z.id));
    for(let t=0;t<310;t++) VB.tick(0.1);
    const news = state.zombies.filter(z=>!before.has(z.id) && z.versusStatic!=='grave' && z.versusStatic!=='target');
    picks.push(news.length ? news.map(z=>z.type).join('+') : '(none)');
    for(const z of state.zombies){ if(z.versusStatic!=='grave' && z.versusStatic!=='target') z.dead = true; }
  }
  return {picks};
}"""

with sync_playwright() as pw:
    browser = launch_chromium(pw)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_standalone_page(page, html)
    page.wait_for_function("() => !!window.S7VersusBattle", timeout=60000)

    r1 = page.evaluate(BLIND_BOX_RUN)
    print('T1 blind-box picks:', r1)
    r2 = page.evaluate(BLIND_BOX_RUN)
    print('T2 repeat picks:  ', r2)
    print('T1==T2 deterministic:', r1 == r2)

    # --- Ash plants: real-time detonation ---
    for kind, col in [('cherrybomb', 5), ('jalapeno', 0), ('doomshroom', 5)]:
        setup = page.evaluate("""(args) => {
          const [kind, col] = args;
          const VB = window.S7VersusBattle;
          VB.start({mode:'practice', humanSide:'plant'});
          const B = VB.state;
          B.resources.zombie = 999999; B.resources.plant = 999999;
          const zr = VB.performAction({type:'play', side:'zombie', cardId:'bucket', row:2, x:6.5});
          if(!zr.ok) return {fail:'zombie: '+zr.reason};
          const pr = VB.performAction({type:'play', side:'plant', cardId:kind, row:2, col});
          if(!pr.ok) return {fail:'plant: '+pr.reason};
          const plant = state.plants.find(p=>p.versusAsh && p.versusAsh.kind===kind);
          const z = state.zombies.find(z=>z.id===zr.entityId);
          window.__ashProbe = {plant, z, t0: state.time, hp0: z.hp};
          return {ok:true, hp0: z.hp};
        }""", [kind, col])
        if 'fail' in setup:
            print(f'T3 {kind}: SETUP FAIL {setup}')
            continue
        page.wait_for_timeout(1600)  # >0.96s real time for main loop
        res = page.evaluate("""() => {
          const pr = window.__ashProbe;
          return {kind: pr.plant.versusAsh.kind, detonated: !!pr.plant.versusAsh.detonated,
                  detTime: pr.plant.versusAsh.detonated ? null : (state.time - pr.t0),
                  zombieHpBefore: pr.hp0, zombieHpAfter: pr.z.hp,
                  zombieDead: !!(pr.z.dead || pr.z.dying)};
        }""")
        print(f'T3 {kind}:', res)

    # --- Doomshroom crater blocks replanting ---
    r4 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      VB.start({mode:'practice', humanSide:'plant'});
      const B = VB.state;
      B.resources.zombie = 999999; B.resources.plant = 999999;
      const pr = VB.performAction({type:'play', side:'plant', cardId:'doomshroom', row:2, col:4});
      if(!pr.ok) return {fail:'plant: '+pr.reason};
      const plant = state.plants.find(p=>p.versusAsh && p.versusAsh.kind==='doomshroom');
      window.__craterProbe = {plant};
      return {ok:true};
    }""")
    page.wait_for_timeout(1500)
    r5 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      const det = window.__craterProbe.plant.versusAsh.detonated;
      const try1 = VB.performAction({type:'play', side:'plant', cardId:'wallnut', row:2, col:4});
      const try2 = VB.performAction({type:'play', side:'plant', cardId:'wallnut', row:2, col:3});
      return {detonated: det, craterBlocked: !try1.ok ? try1.reason : 'NOT-BLOCKED', otherCell: try2.ok ? 'ok' : try2.reason};
    }""")
    print('T4 crater:', r5)

    print('pageerrors:', errors[:5] if errors else 'none')
    browser.close()
