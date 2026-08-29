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
    rel = url.split('/assets/', 1)[1]
    path = ROOT / 'assets' / rel
    if path.exists():
        route.fulfill(content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream', body=path.read_bytes())
    else:
        route.abort()

INJECT = """
() => {
  window.__wsMsgs = [];
  window.__pid = null;
  window.__ws = new WebSocket('wss://pvzs7remake-ws-server-production.up.railway.app');
  window.__ws.onopen = () => { window.__wsEv = 'open;'; };
  window.__ws.onerror = () => { window.__wsEv = (window.__wsEv||'') + 'error;'; };
  window.__ws.onclose = (e) => { window.__wsEv = (window.__wsEv||'') + 'close:' + e.code + ';'; };
  window.__ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    window.__wsMsgs.push(m.type);
    if (m.playerId) window.__pid = m.playerId;
    try { window.S7VersusOnline?.handle?.(m); } catch (e) { console.error('handle err', e); }
  };
  window.s7WSSend = (obj) => { if (window.__ws && window.__ws.readyState === 1) { window.__ws.send(JSON.stringify(obj)); return true; } return false; };
  window.s7WSConnected = () => true;
  window.s7GetSelectedMultiplayerServer = () => '1';
  window.s7GetGameVersion = () => '1.7.8';
  window.s7WSPlayerId = () => window.__pid;
  return true;
}
"""

errs = []
with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
    ctx = browser.new_context(viewport={'width':1440,'height':900})
    def new_page():
        pg = ctx.new_page()
        pg.route('https://s7-test.local/assets/**', serve_asset)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        open_standalone_page(pg, html)
        pg.wait_for_timeout(1000)
        pg.evaluate(INJECT)
        pg.wait_for_timeout(1200)
        return pg
    A = new_page(); B = new_page()
    def probe(pg, name):
        pg.evaluate("window.S7ScreenNav?.show?.('versusOnlineEntryScreen',{hideHome:true})")
        pg.wait_for_timeout(300)
    probe(A, 'A'); probe(B, 'B')
    A.fill('#versusNick', 'HostA')
    A.click('#versusCreateRoomBtn')
    A.wait_for_timeout(2500)
    diag = A.evaluate("() => ({ wsReady: window.__ws?window.__ws.readyState:-1, ev: window.__wsEv||'', msgs: window.__wsMsgs.slice(-5), roomId: window.S7VersusOnline.getRoom()?.id, isHost: window.S7VersusOnline.isHost(), roomHidden: document.getElementById('roomScreen').classList.contains('hidden') })")
    print('A_DIAG', diag, flush=True)
    room_id = A.evaluate("window.S7VersusOnline.getRoom()?.id")
    if not room_id:
        print('CREATE_FAILED'); ctx.close(); sys.exit(1)
    B.fill('#versusNick', 'GuestB')
    B.fill('#versusJoinRoomId', room_id)
    B.click('#versusJoinRoomBtn')
    B.wait_for_timeout(2500)
    out = A.evaluate("""() => {
      const room = window.S7VersusOnline.getRoom();
      return { state: room&&room.state, isHost: window.S7VersusOnline.isHost(),
        roomHidden: document.getElementById('roomScreen').classList.contains('hidden'),
        s7Disabled: document.getElementById('versusSlots7Btn')?.disabled,
        bpDisabled: document.getElementById('versusBpBtn')?.disabled,
        startDisabled: document.getElementById('versusRoomStartDraftBtn')?.disabled };
    }""")
    print('ROOM_A', out, flush=True)
    A.click('#versusPlantSideCard'); A.wait_for_timeout(500)
    B.click('#versusZombieSideCard'); B.wait_for_timeout(500)
    A.click('#versusSlots7Btn'); A.wait_for_timeout(500)
    A.click('#versusBpBtn'); A.wait_for_timeout(500)
    out2 = A.evaluate("""() => { const r=window.S7VersusOnline.getRoom(); return { slots: r&&r.versus.slots, bp: r&&r.versus.bp, sides: JSON.stringify(r&&r.versus.sides), s7Sel: document.getElementById('versusSlots7Btn').classList.contains('selected'), bpSel: document.getElementById('versusBpBtn').classList.contains('selected') }; }""")
    print('RULES_A', out2, flush=True)
    A.click('#versusRoomStartDraftBtn'); A.wait_for_timeout(2000)
    out3 = A.evaluate("""() => {
      const d = document.getElementById('versusOnlineDraftScreen');
      return { draftHidden: d.classList.contains('hidden'), progress: document.getElementById('versusDraftProgress')?.textContent,
        rule: document.getElementById('versusDraftRuleBadge')?.textContent, cards: document.querySelectorAll('#versusOnlineCardGrid .versusDraftCard').length,
        msgs: window.__wsMsgs.slice(-8) };
    }""")
    print('DRAFT_A', out3, flush=True)
    print('ERRORS', errs[:4], flush=True)
    # 清理房间
    A.evaluate("window.s7WSSend && window.s7WSSend({type:'leaveRoom'})")
    B.evaluate("window.s7WSSend && window.s7WSSend({type:'leaveRoom'})")
    ctx.close()
