#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from playwright_browser import launch_chromium, open_standalone_page
from playwright.sync_api import sync_playwright
import mimetypes

html = (ROOT / 'dist/S7_FAST_ENTRY.html').read_text(encoding='utf-8')
def serve_asset(route):
    url = route.request.url
    url = route.request.url
    rel = url.split('/assets/', 1)[1]
    path = ROOT / 'assets' / rel
    if path.exists():
        route.fulfill(content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream', body=path.read_bytes())
    else:
        route.abort()

INJECT = """
() => {
  window.__wsMsgs = [];
  window.__ws = new WebSocket('ws://localhost:43211');
  window.__ws.onopen = () => { window.__wsEv = (window.__wsEv||'') + 'open;'; };
  window.__ws.onerror = (e) => { window.__wsEv = (window.__wsEv||'') + 'error;'; };
  window.__ws.onclose = (e) => { window.__wsEv = (window.__wsEv||'') + 'close:' + e.code + ';'; };
  window.__ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    window.__wsMsgs.push(m.type);
    try { window.S7VersusOnline?.handle?.(m); } catch (e) { console.error('handle err', e); }
  };
  window.s7WSSend = (obj) => { if (window.__ws && window.__ws.readyState === 1) { window.__ws.send(JSON.stringify(obj)); return true; } return false; };
  window.s7WSConnected = () => true;
  window.s7GetSelectedMultiplayerServer = () => '1';
  window.s7GetGameVersion = () => '1.7.8';
  window.s7WSPlayerId = () => window.__pid || null;
  return true;
}
"""

errs = []
with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
    ctx = browser.new_context(viewport={'width':1440,'height':900})
    def new_page():
        pg = ctx.new_page()
        pg.route('http://s7-test.local/assets/**', serve_asset)
        pg.route('http://s7-test.local', lambda r: r.fulfill(content_type='text/html', body=html))
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE:'+m.text) if 'websocket' in m.text.lower() or 'mixed' in m.text.lower() or 'connect' in m.text.lower() else None)
        pg.goto('http://s7-test.local', wait_until='domcontentloaded', timeout=120000)
        pg.wait_for_timeout(900)
        pg.evaluate(INJECT)
        pg.wait_for_timeout(600)
        return pg
    A = new_page(); B = new_page()
    A.evaluate("window.S7ScreenNav?.show?.('versusOnlineEntryScreen',{hideHome:true})")
    A.wait_for_timeout(300)
    A.fill('#versusNick', 'HostA')
    A.click('#versusCreateRoomBtn')
    A.wait_for_timeout(1800)
    diag = A.evaluate("() => ({ wsReady: window.__ws ? window.__ws.readyState : -1, wsEv: window.__wsEv || '', msgs: window.__wsMsgs.slice(-6) })")
    print('A_DIAG', diag)
    room_id = A.evaluate("window.S7VersusOnline.getRoom()?.id")
    print('A_ROOM_ID', room_id)
    if not room_id:
        print('CREATE_FAILED')
        ctx.close(); sys.exit(1)
    B.evaluate("window.S7ScreenNav?.show?.('versusOnlineEntryScreen',{hideHome:true})")
    B.wait_for_timeout(300)
    B.fill('#versusNick', 'GuestB')
    B.fill('#versusJoinRoomId', room_id)
    B.click('#versusJoinRoomBtn')
    B.wait_for_timeout(1800)
    out = A.evaluate("""() => {
      const o = {};
      const room = window.S7VersusOnline.getRoom();
      o.roomState = room && room.state;
      o.isHost = window.S7VersusOnline.isHost();
      o.roomScreenHidden = document.getElementById('roomScreen').classList.contains('hidden');
      o.slots7Disabled = document.getElementById('versusSlots7Btn')?.disabled;
      o.bpDisabled = document.getElementById('versusBpBtn')?.disabled;
      o.startDraftDisabled = document.getElementById('versusRoomStartDraftBtn')?.disabled;
      return o;
    }""")
    print('ROOM_A', out)
    A.click('#versusPlantSideCard'); A.wait_for_timeout(400)
    B.click('#versusZombieSideCard'); B.wait_for_timeout(400)
    A.click('#versusSlots7Btn'); A.wait_for_timeout(400)
    A.click('#versusBpBtn'); A.wait_for_timeout(400)
    out2 = A.evaluate("""() => {
      const room = window.S7VersusOnline.getRoom();
      return { slots: room && room.versus.slots, bp: room && room.versus.bp,
               sides: JSON.stringify(room && room.versus.sides),
               slots7Sel: document.getElementById('versusSlots7Btn').classList.contains('selected'),
               bpSel: document.getElementById('versusBpBtn').classList.contains('selected') };
    }""")
    print('RULES_A', out2)
    A.click('#versusRoomStartDraftBtn'); A.wait_for_timeout(1500)
    out3 = A.evaluate("""() => {
      const draft = document.getElementById('versusOnlineDraftScreen');
      return { draftHidden: draft.classList.contains('hidden'),
               progress: document.getElementById('versusDraftProgress')?.textContent,
               ruleBadge: document.getElementById('versusDraftRuleBadge')?.textContent,
               cards: document.querySelectorAll('#versusOnlineCardGrid .versusDraftCard').length,
               wsMsgs: window.__wsMsgs.slice(-10) };
    }""")
    print('DRAFT_A', out3)
    print('PAGEERRORS', errs[:4])
    ctx.close()
