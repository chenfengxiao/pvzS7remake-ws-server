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

# 注入: s7WSSend 收到消息后,模拟 server 响应(handle 消息)
INJECT = """
() => {
  window.__sent = [];
  const mkRoom = () => ({ id:'R1', kind:'versus', hostId:'P1', state:'lobby',
    versus:{ slots:6, bp:false, sides:{plant:null,zombie:null}, picks:{plant:[],zombie:[]}, bans:{plant:[],zombie:[]}, step:0, draftStarted:false, draftDone:false },
    players:[{id:'P1',nick:'HostA',connected:true}] });
  let room = mkRoom();
  const H = (m) => { try { window.S7VersusOnline?.handle?.(m); } catch(e) { console.error('HANDLE_ERR', String(e && e.message||e)); } };
  window.s7WSSend = (obj) => {
    window.__sent.push(obj.type);
    setTimeout(() => {
      if (obj.type === 'createVersusRoom') {
        room = mkRoom(); room.players[0].nick = obj.nick;
        room.players.push({id:'P2',nick:'GuestB',connected:true});
        room.versus.sides = {plant:'P1', zombie:'P2'};
        H({ type:'versusRoomCreated', room, playerId:'P1' });
      } else if (obj.type === 'versusClaim') {
        room.versus.sides[obj.side] = 'P1';
        H({ type:'roomUpdate', room: JSON.parse(JSON.stringify(room)) });
      } else if (obj.type === 'versusRules') {
        room.versus.slots = obj.slots; room.versus.bp = !!obj.bp;
        H({ type:'roomUpdate', room: JSON.parse(JSON.stringify(room)) });
      } else if (obj.type === 'versusStartDraft') {
        room.state = 'versusDraft';
        H({ type:'versusDraftState', room: JSON.parse(JSON.stringify(room)) });
      } else if (obj.type === 'versusDraftAction') {
        room.versus.step = (room.versus.step||0) + 1;
        H({ type:'versusDraftState', room: JSON.parse(JSON.stringify(room)) });
      }
    }, 60);
    return true;
  };
  window.s7WSConnected = () => true;
  window.s7GetSelectedMultiplayerServer = () => '1';
  window.s7GetGameVersion = () => '1.7.8';
  window.s7WSPlayerId = () => null;
  return true;
}
"""

errs = []
with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
    page = browser.new_page(viewport={'width':1440,'height':900})
    page.route('https://s7-test.local/assets/**', serve_asset)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append('C:'+m.text) if m.type=='error' else None)
    open_standalone_page(page, html)
    page.wait_for_timeout(900)
    page.evaluate(INJECT)
    page.wait_for_timeout(500)
    page.evaluate("window.S7ScreenNav?.show?.('versusOnlineEntryScreen',{hideHome:true})")
    page.wait_for_timeout(300)
    vis2 = page.evaluate("() => ({ entryHidden: document.getElementById('versusOnlineEntryScreen').classList.contains('hidden'), btnVisible: !!document.getElementById('versusCreateRoomBtn').offsetParent, startHidden: document.getElementById('startScreen').classList.contains('hidden') })")
    print('ENTRY_VIS', vis2, flush=True)
    page.fill('#versusNick', 'HostA')
    page.click('#versusCreateRoomBtn')
    page.wait_for_timeout(800)
    out = page.evaluate("""() => {
      const o = {};
      o.isHost = window.S7VersusOnline.isHost();
      o.sent = window.__sent;
      o.roomScreenHidden = document.getElementById('roomScreen').classList.contains('hidden');
      o.slots7Disabled = document.getElementById('versusSlots7Btn')?.disabled;
      o.startDraftDisabled = document.getElementById('versusRoomStartDraftBtn')?.disabled;
      o.roomState = window.S7VersusOnline.getRoom() && window.S7VersusOnline.getRoom().state;
      o.hErr = window.__hErr || null;
      return o;
    }""")
    print('AFTER_CREATE', out, flush=True)
    vis = page.evaluate("() => ({plantSide: !document.getElementById('versusPlantSideCard').classList.contains('hidden'), roomScreen: !document.getElementById('roomScreen').classList.contains('hidden')})")
    print('VIS', vis, flush=True)
    # 抢植物
    try: page.click('#versusPlantSideCard', timeout=3000)
    except Exception as e: print('CLICK_PLANT_ERR', e, flush=True)
    # 改规则 7槽 + BP
    page.click('#versusSlots7Btn'); page.wait_for_timeout(400)
    page.click('#versusBpBtn'); page.wait_for_timeout(400)
    out2 = page.evaluate("""() => {
      const room = window.S7VersusOnline.getRoom();
      return { slots: room && room.versus.slots, bp: room && room.versus.bp,
               sides: JSON.stringify(room && room.versus.sides),
               slots7Sel: document.getElementById('versusSlots7Btn').classList.contains('selected'),
               bpSel: document.getElementById('versusBpBtn').classList.contains('selected'),
               sent: window.__sent };
    }""")
    print('AFTER_RULES', out2)
    # 开始选卡
    page.click('#versusRoomStartDraftBtn'); page.wait_for_timeout(900)
    out3 = page.evaluate("""() => {
      const d = document.getElementById('versusOnlineDraftScreen');
      return { draftHidden: d.classList.contains('hidden'),
               progress: document.getElementById('versusDraftProgress')?.textContent,
               ruleBadge: document.getElementById('versusDraftRuleBadge')?.textContent,
               cards: document.querySelectorAll('#versusOnlineCardGrid .versusDraftCard').length,
               sent: window.__sent };
    }""")
    print('AFTER_DRAFT', out3)
    print('ERRORS', errs[:5])
    browser.close()
