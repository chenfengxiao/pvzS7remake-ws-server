"""Verify versus blind-box grave summon (type=blind, opens into random zombie),
blind card deployability, and ash plant 0.96s detonation."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from playwright_browser import launch_chromium, open_standalone_page

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'dist', 'S7_FAST_ENTRY.html')

with open(HTML, encoding='utf-8') as f:
    html = f.read()

GRAVE_RUN = """() => {
  const VB = window.S7VersusBattle;
  VB.start({mode:'practice', humanSide:'plant'});
  const B = VB.state;
  B.resources.zombie = 999999; B.resources.plant = 999999;
  let r = VB.performAction({type:'play', side:'zombie', cardId: VB.FIXED.zombie, row:1, x:7.5});
  if(!r.ok) return {fail:'grave: '+r.reason};
  r = VB.performAction({type:'play', side:'zombie', cardId: VB.FIXED.mystery, row:1, x:7.5});
  if(!r.ok) return {fail:'upgrade: '+r.reason};
  const summons = [];
  for(let i=0;i<3;i++){
    const before = new Set(state.zombies.map(z=>z.id));
    for(let t=0;t<310;t++) VB.tick(0.1);
    const news = state.zombies.filter(z=>!before.has(z.id) && z.versusStatic!=='grave' && z.versusStatic!=='target');
    if(news.length){
      const nz = news[news.length-1];
      const rec = {type:nz.type, blind:!!nz.blind, hp:nz.hp, armor:(nz.armors||[]).map(a=>a.name+':'+a.hp)};
      // 打掉盲盒护甲开盒（370护甲）：旧实体死亡被移除，新实体入场
      const before2 = new Set(state.zombies.map(q=>q.id));
      damageZombie(nz, 400, {});
      const opened = state.zombies.filter(q=>!before2.has(q.id) && !q.dead);
      rec.openedInto = opened.length ? opened.map(q=>q.type).join('+') : '(none)';
      rec.oldRemoved = nz.dead && !state.zombies.includes(nz);
      for(const q of state.zombies){ if(q.versusStatic!=='grave' && q.versusStatic!=='target') q.dead = true; }
      summons.push(rec);
    } else summons.push(null);
  }
  return {summons};
}"""

with sync_playwright() as pw:
    browser = launch_chromium(pw)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_standalone_page(page, html)
    page.wait_for_function("() => !!window.S7VersusBattle", timeout=60000)

    # T1: grave summons blind-box zombies that open into random types
    r1 = page.evaluate(GRAVE_RUN)
    print('T1 grave summons:', r1)

    # T2: blind card is deployable
    r2 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      VB.start({mode:'practice', humanSide:'plant'});
      VB.state.resources.zombie = 999999;
      const r = VB.performAction({type:'play', side:'zombie', cardId:'blind', row:2, x:7.5});
      if(!r.ok) return {fail: r.reason};
      const z = state.zombies.find(z=>z.id===r.entityId);
      return {ok:true, type:z.type, blind:!!z.blind, hp:z.hp, armor:(z.armors||[]).map(a=>a.name+':'+a.hp),
              icon: window.S7VersusBattle.state && 'ok'};
    }""")
    print('T2 blind card deploy:', r2)

    # T3: ash plants detonation + damage + crater
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
          window.__ashProbe = {plant, z, hp0: z.hp};
          return {ok:true};
        }""", [kind, col])
        if 'fail' in setup:
            print(f'T3 {kind}: SETUP FAIL {setup}')
            continue
        page.wait_for_timeout(1600)
        res = page.evaluate("""() => {
          const pr = window.__ashProbe;
          return {detonated: !!pr.plant.versusAsh.detonated,
                  zombieDead: !!(pr.z.dead || pr.z.dying)};
        }""")
        print(f'T3 {kind}:', res)

    # T4: crater blocks replant
    page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      VB.start({mode:'practice', humanSide:'plant'});
      VB.state.resources.plant = 999999;
      VB.performAction({type:'play', side:'plant', cardId:'doomshroom', row:2, col:4});
    }""")
    page.wait_for_timeout(1500)
    r4 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      const try1 = VB.performAction({type:'play', side:'plant', cardId:'wallnut', row:2, col:4});
      return {craterBlocked: !try1.ok ? try1.reason : 'NOT-BLOCKED'};
    }""")
    print('T4 crater:', r4)

    print('pageerrors:', errors[:5] if errors else 'none')
    browser.close()
