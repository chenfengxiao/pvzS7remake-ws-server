"""Verify versus fixes: spikerock/shadow-spike veil respect, cabbage single-grave lock,
HP mult badge creation, squash ignoring graves/targets."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from playwright_browser import launch_chromium, open_standalone_page

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, 'dist', 'S7_FAST_ENTRY.html'), encoding='utf-8') as f:
    html = f.read()

INIT = """() => {
  const VB = window.S7VersusBattle;
  VB.start({mode:'practice', humanSide:'plant'});
  const B = VB.state;
  B.resources.zombie = 999999; B.resources.plant = 999999;
  B.cooldowns.plant = {}; B.cooldowns.zombie = {};
  return true;
}"""

with sync_playwright() as pw:
    browser = launch_chromium(pw)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_standalone_page(page, html)
    page.wait_for_function("() => !!window.S7VersusBattle", timeout=60000)

    # --- T5: cabbage cd 15s ---
    print('T5 cabbage cd:', page.evaluate("() => window.S7VersusBattle.cfg('plant','cabbage').cd"))

    # --- T6: badge created and visible ---
    page.evaluate(INIT)
    page.wait_for_timeout(700)
    print('T6 badge:', page.evaluate("""() => {
      const e = document.getElementById('versusHpMultBadge');
      if(!e) return {exists:false};
      const cs = getComputedStyle(e);
      return {exists:true, display:cs.display, text:e.textContent, visible:cs.display!=='none'};
    }"""))

    # --- T7: shadow spike (summoned by spikerock) respects grave veil on targets ---
    # un-veiled positive control
    page.evaluate(INIT)
    r7a = page.evaluate("""() => {
      const t = state.zombies.find(z=>z.versusStatic==='target');
      const VB = window.S7VersusBattle;
      VB.performAction({type:'play', side:'plant', cardId:'spikerock', row:t.row, col:0});
      const p = state.plants.find(p=>p.key==='spikerock'&&!p.dead);
      state.shadowSpikes=state.shadowSpikes||[];state.shadowSpikes.push({row:t.row, x:t.x-0.6, dmgCd:0, level:0, hp:300, ownerId:p.id});
      window.__probe = {tid: t.id, hp0: t.hp};
      return {targetX:t.x, hp0:t.hp};
    }""")
    page.wait_for_timeout(2500)
    r7a2 = page.evaluate("() => { const t = state.zombies.find(z=>z.id===window.__probe.tid); return {hpAfter: t ? t.hp : '(dead/removed)'}; }")
    print('T7a shadow spike vs un-veiled target:', {**r7a, **r7a2})

    page.evaluate(INIT)
    r7b = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      const t = state.zombies.find(z=>z.versusStatic==='target');
      VB.performAction({type:'play', side:'zombie', cardId:VB.FIXED.zombie, row:t.row, x:8.5});
      VB.performAction({type:'play', side:'plant', cardId:'spikerock', row:t.row, col:0});
      const p = state.plants.find(p=>p.key==='spikerock'&&!p.dead);
      state.shadowSpikes=state.shadowSpikes||[];state.shadowSpikes.push({row:t.row, x:t.x-0.6, dmgCd:0, level:0, hp:300, ownerId:p.id});
      window.__probe = {tid: t.id, hp0: t.hp};
      return {hp0:t.hp};
    }""")
    page.wait_for_timeout(2500)
    r7b2 = page.evaluate("() => { const t = state.zombies.find(z=>z.id===window.__probe.tid); return {hpAfter: t ? t.hp : '(dead/removed)'}; }")
    print('T7b shadow spike vs veiled target:', {**r7b, **r7b2})

    # --- T8: cabbage locks at most one (frontmost) grave ---
    page.evaluate(INIT)
    r8 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      VB.performAction({type:'play', side:'zombie', cardId:VB.FIXED.zombie, row:0, x:6.5});
      VB.performAction({type:'play', side:'zombie', cardId:VB.FIXED.zombie, row:0, x:8.5});
      const r = VB.performAction({type:'play', side:'plant', cardId:'cabbage', row:0, col:0});
      const p = state.plants.find(p=>p.key==='cabbage'&&!p.dead);
      if(p) p.cd = 0;
      return {placed:r.ok};
    }""")
    page.wait_for_timeout(3000)
    r8b = page.evaluate("""() => {
      const pults = state.bullets.filter(b=>b.kind==='pult');
      const graveXs = [];
      for (const b of pults) {
        const t = b.target || state.zombies.find(z=>z.id===b.targetId);
        if (t && t.versusStatic==='grave') graveXs.push(t.x);
      }
      return {pultCount: pults.length, graveTargetsX: graveXs};
    }""")
    print('T8 cabbage grave scatter:', {**r8, **r8b})

    # --- T9: squash ignores graves and targets ---
    page.evaluate(INIT)
    r9 = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      // grave in range of squash at col 5 (front 2 cells: up to 7.55)
      VB.performAction({type:'play', side:'zombie', cardId:VB.FIXED.zombie, row:2, x:6.5});
      const r = VB.performAction({type:'play', side:'plant', cardId:'squash', row:2, col:5});
      return {placed:r.ok};
    }""")
    page.wait_for_timeout(1500)
    r9b = page.evaluate("""() => {
      const p = state.plants.find(p=>p.key==='squash'&&!p.dead);
      return {squashState: p ? (p.s7.squashState||null) : 'gone'};
    }""")
    print('T9 squash vs grave only:', {**r9, **r9b})

    page.evaluate(INIT)
    r9c = page.evaluate("""() => {
      const VB = window.S7VersusBattle;
      VB.performAction({type:'play', side:'zombie', cardId:'normal', row:2, x:6.5});
      VB.performAction({type:'play', side:'plant', cardId:'squash', row:2, col:5});
      return true;
    }""")
    page.wait_for_timeout(1500)
    r9d = page.evaluate("""() => {
      const p = state.plants.find(p=>p.key==='squash'&&!p.dead);
      return {squashState: p ? (p.s7.squashState||null) : 'gone'};
    }""")
    print('T9b squash vs real zombie:', r9d)

    print('pageerrors:', errors[:5] if errors else 'none')
    browser.close()
