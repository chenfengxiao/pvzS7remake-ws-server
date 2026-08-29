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
errs = []
with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
    page = browser.new_page(viewport={'width':1440,'height':900})
    page.route('https://s7-test.local/assets/**', serve_asset)
    page.on('pageerror', lambda e: errs.append(str(e)))
    open_standalone_page(page, html)
    page.wait_for_timeout(800)
    # 进入双人对战入口
    page.evaluate("window.S7ScreenNav?.show?.('versusOnlineEntryScreen',{hideHome:true})")
    page.wait_for_timeout(300)
    r = page.evaluate("""() => {
      const out = { wsPlayerIdBefore: window.s7WSPlayerId?.(), wsPlayerIdAfter: null, hostId: null };
      // 模拟:房主创建房间成功
      const room = {id:'R1',hostId:'P1',state:'lobby',versus:{slots:6,bp:false,sides:{plant:null,zombie:null},picks:{plant:[],zombie:[]},bans:{plant:[],zombie:[]},step:0,draftStarted:false,draftDone:false},players:[{id:'P1',nick:'H',connected:true}]};
      try { window.S7VersusOnline.handle({type:'versusRoomCreated', room, playerId:'P1'}); } catch(e) { out.err_create = String(e && e.message || e); }
      out.isHost = window.S7VersusOnline.isHost(); out.wsPlayerIdAfter = window.s7WSPlayerId?.(); out.hostId = window.S7VersusOnline.getRoom()?.hostId;
      const roomScreen = document.getElementById('roomScreen');
      out.roomScreenVisible = roomScreen && !roomScreen.classList.contains('hidden');
      out.slots7Disabled = document.getElementById('versusSlots7Btn')?.disabled;
      out.bpBtnDisabled = document.getElementById('versusBpBtn')?.disabled;
      out.startDraftDisabled = document.getElementById('versusRoomStartDraftBtn')?.disabled;
      // 模拟改规则(server 确认 7槽+BP)
      room.versus.slots = 7; room.versus.bp = true;
      try { window.S7VersusOnline.handle({type:'roomUpdate', room}); } catch(e) { out.err_update = String(e && e.message || e); }
      out.slots7Selected = document.getElementById('versusSlots7Btn')?.classList.contains('selected');
      out.bpSelected = document.getElementById('versusBpBtn')?.classList.contains('selected');
      // 模拟开始选卡(server 返回 versusDraftState)
      room.state = 'versusDraft'; room.versus.sides = {plant:'P1', zombie:null}; room.versus.step = 0;
      try { window.S7VersusOnline.handle({type:'versusDraftState', room}); } catch(e) { out.err_draft = String(e && e.message || e); }
      const draftScreen = document.getElementById('versusOnlineDraftScreen');
      out.draftScreenVisible = draftScreen && !draftScreen.classList.contains('hidden');
      out.draftProgress = document.getElementById('versusDraftProgress')?.textContent;
      out.draftRule = document.getElementById('versusDraftRuleBadge')?.textContent;
      out.cardGridCount = document.querySelectorAll('#versusOnlineCardGrid .versusDraftCard').length;
      return out;
    }""")
    print('UI_SIM', r)
    print('PAGEERRORS', errs[:3])
    browser.close()
