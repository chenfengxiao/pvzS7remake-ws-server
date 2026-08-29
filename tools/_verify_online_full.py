#!/usr/bin/env python3
import sys, time, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from playwright_browser import launch_chromium, open_standalone_page
from playwright.sync_api import sync_playwright
import mimetypes

html = (ROOT / 'dist/S7_FAST_ENTRY.html').read_text(encoding='utf-8')
WSS = 'wss://pvzs7remake-ws-server-production.up.railway.app'
def serve_asset(route):
    url = route.request.url
    rel = url.split('/assets/', 1)[1]
    path = ROOT / 'assets' / rel
    if path.exists():
        route.fulfill(content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream', body=path.read_bytes())
    else:
        route.abort()

INJECT = """
(() => {
  const WSS = %s;
  let ws = null;
  const listeners = {};
  window.s7WSOn = (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { const a = listeners[ev]||[]; const i = a.indexOf(fn); if (i>=0) a.splice(i,1); }; };
  window.s7WSConnected = () => !!ws && ws.readyState === 1;
  window.s7WSPlayerId = () => null;
  window.s7GetSelectedMultiplayerServer = () => '1';
  function dispatch(ev, data) { (listeners[ev]||[]).slice().forEach(fn => { try { fn(data); } catch(e) { console.error('[test ws]', ev, e); } }); }
  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { ws = new WebSocket(WSS); } catch(e) { dispatch('error', {message:String(e)}); return; }
    ws.onopen = () => { dispatch('connected', {}); };
    ws.onerror = () => dispatch('error', {message:'ws error'});
    ws.onclose = () => { dispatch('disconnected', {}); ws = null; };
    ws.onmessage = (ev) => { let m = null; try { m = JSON.parse(ev.data); } catch(e) { return; } dispatch('message', m); };
  }
  window.s7WSConnect = connect;
  window.s7WSSend = (o) => { if (!ws || ws.readyState !== 1) return false; try { ws.send(JSON.stringify(o)); return true; } catch(e) { return false; } };
  window.s7ShowServerSelect = (purpose) => { if (purpose === 'versus') { window.S7VersusOnline?.showEntryForSelectedServer?.({id:'1',name:'Railway 外服'}); } };
})();
""" % json.dumps(WSS)

def new_page(browser):
    page = browser.new_page(viewport={'width':1440,'height':900})
    page.route('https://s7-test.local/assets/**', serve_asset)
    page.add_init_script(INJECT)
    open_standalone_page(page, html)
    page.wait_for_timeout(1200)
    return page

def enter_entry(page, nick, room_id=None):
    page.evaluate("window.S7VersusOnline?.showEntryForSelectedServer?.({id:'1',name:'Railway 外服'})")
    page.wait_for_timeout(400)
    page.fill('#versusNick', nick)
    if room_id:
        page.fill('#versusJoinRoomId', room_id)
    return room_id is not None

def wait_room(page, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        if page.evaluate("!!window.S7VersusOnline?.getRoom?.()"):
            return True
        page.wait_for_timeout(400)
    return False

def claim_side(page, side):
    page.click('#versusPlantSideCard' if side == 'plant' else '#versusZombieSideCard')
    time.sleep(0.5)

def start_draft(page):
    page.wait_for_timeout(300)
    page.evaluate("""() => { const b = document.getElementById('versusRoomStartDraftBtn'); if (b && !b.disabled) b.click(); }""")

def do_draft_both(host, guest, timeout=120):
    """并行驱动双端选卡: 轮到自己就点第一个可用卡。"""
    end = time.time() + timeout
    while time.time() < end:
        done = 0
        for pg in (host, guest):
            if pg.evaluate("""() => {
              const ins = document.getElementById('versusDraftInstruction');
              return !!ins && ins.textContent.includes('选卡完成');
            }"""):
                done += 1
        if done == 2:
            return True
        for pg in (host, guest):
            mine = pg.evaluate("""() => {
              const ins = document.getElementById('versusDraftInstruction');
              return !!ins && ins.textContent.includes('轮到你');
            }""")
            if mine:
                picked = pg.evaluate("""() => {
                  const cards = Array.from(document.querySelectorAll('.versusDraftCard:not(.disabled)'));
                  return cards.length ? cards[0].dataset.id : null;
                }""")
                if picked:
                    try:
                        pg.click('.versusDraftCard[data-id="%s"]' % picked, timeout=2000)
                    except Exception:
                        pass
        pg.wait_for_timeout(400) if False else None
        time.sleep(0.4)
    return False

def start_battle(page):
    page.wait_for_timeout(300)
    page.evaluate("""() => { const b = document.getElementById('versusDraftStartBattleBtn'); if (b && !b.classList.contains('hidden')) b.click(); }""")

def battle_ready(page, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        st = page.evaluate("""() => { const S = window.S7VersusBattle; return S?.state?.active ? {active:S.state.active, mp:window._mpBattleActive, rng:window.s7BattleRngInfo?.()} : null; }""")
        if st and st['active']:
            return st
        page.wait_for_timeout(400)
    return None

with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
    host = new_page(browser)
    guest = new_page(browser)

    enter_entry(host, 'HOST')
    page_ = host
    host.click('#versusCreateRoomBtn')
    assert wait_room(host), 'host room not ready'
    room_id = host.evaluate("window.S7VersusOnline.getRoom().id")
    print('ROOM', room_id, flush=True)

    enter_entry(guest, 'GUEST', room_id)
    guest.click('#versusJoinRoomBtn')
    assert wait_room(guest), 'guest room not ready'
    time.sleep(0.8)

    claim_side(host, 'plant'); claim_side(guest, 'zombie')
    time.sleep(0.8)
    print('SIDES', host.evaluate("() => { const v=window.S7VersusOnline.getRoom().versus; return {p:v.sides.plant, z:v.sides.zombie}; }"), flush=True)

    start_draft(host)
    time.sleep(1.0)
    ok = do_draft_both(host, guest)
    print('DRAFT ok=%s' % ok, flush=True)

    start_battle(host)
    hst = battle_ready(host)
    print('BATTLE_HOST', hst, flush=True)

    if hst and hst['active']:
        r = host.evaluate("""() => {
          const tw = state.plants.filter(p=>p.versusCore==='twin'&&!p.dead).map(p=>p.row+','+p.col);
          const gr = state.zombies.filter(z=>z.versusStatic==='grave'&&!z.dead).map(z=>z.row+','+Math.round(z.x*10)/10);
          const tg = state.zombies.filter(z=>z.versusObjective).length;
          return { twins: tw, graves: gr, targets: tg, mode: window.S7VersusBattle.state.mode };
        }""")
        print('HOST_CORE', r, flush=True)

    gst = guest.evaluate("""() => ({ realtime: !document.getElementById('versusRealtimeScreen').classList.contains('hidden'), notice: !document.getElementById('versusConnectionNotice').classList.contains('hidden') })""")
    print('GUEST_VIEW', gst, flush=True)

    browser.close()
