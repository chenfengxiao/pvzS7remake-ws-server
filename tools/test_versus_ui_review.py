#!/usr/bin/env python3
# 真实浏览器完整 Versus 流程复盘 + 截图证据（进入/选边/选卡/战斗/结算/重开）。
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from playwright_browser import launch_chromium, open_standalone_page
from playwright.sync_api import sync_playwright

OUT = ROOT / 'dist/versus_lab/screens'
OUT.mkdir(parents=True, exist_ok=True)

def shot(page, name):
    page.screenshot(path=str(OUT / f'{name}.png'), full_page=False)
    print('SCREENSHOT', name)

def main():
    subprocess_ok = True
    import subprocess
    subprocess.run(['python3', 'tools/build_fast_entry.py'], cwd=ROOT, check=True)
    html = (ROOT / 'dist/S7_FAST_ENTRY.html').read_text(encoding='utf-8')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=True, args=['--no-sandbox', '--disable-gpu'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        open_standalone_page(page, html)
        page.wait_for_timeout(800)
        # 入口
        try:
            page.evaluate("window.S7ScreenNav?.show?.('versusPracticeEntryScreen',{hideHome:true})")
        except Exception:
            pass
        try:
            window_ok = page.evaluate("!!document.getElementById('versusPracticeEntryScreen')")
            print('entry screen present:', window_ok)
        except Exception as e:
            print('eval err', e)
        page.wait_for_timeout(300)
        shot(page, '01_entry')
        # 创建房间 -> 设置
        page.click('#versusPracticeCreateRoomBtn')
        page.wait_for_timeout(200)
        shot(page, '02_setup')
        # 选植物 + 6槽 No-BP
        page.click('.versusPracticeSide[data-side="plant"]')
        page.wait_for_timeout(150)
        shot(page, '03_side_selected')
        # 开始选卡（AI 自动补完）
        page.click('#versusPracticeBeginBtn')
        page.wait_for_timeout(3500)
        shot(page, '04_draft_done')
        # 开战
        page.click('#versusPracticeStartBattleBtn')
        page.wait_for_timeout(1200)
        shot(page, '05_battle_start')
        # 快进: 用真实 update 循环推进 60 秒游戏时间（同一页面真实代码）
        page.evaluate("""() => {
          const DT = FIXED_FRAME_DT;
          for (let i = 0; i < 60 / DT; i++){ update(DT); if (i % 5 === 0) window.S7VersusBattle.tick(0.2); }
        }""")
        page.wait_for_timeout(400)
        shot(page, '06_battle_mid')
        # 快进到结算（推进至多 400 秒或结束）
        page.evaluate("""() => {
          const DT = FIXED_FRAME_DT;
          for (let i = 0; i < 400 / DT; i++){ update(DT); if (i % 5 === 0) window.S7VersusBattle.tick(0.2); if (!state.running) break; }
        }""")
        page.wait_for_timeout(3000)
        shot(page, '07_result')
        result = page.evaluate("window.S7VersusBattle?.state?.versus?.result || null")
        print('RESULT', result)
        # 重开回设置
        try:
            page.click('#versusResultRematchBtn', timeout=3000)
            page.wait_for_timeout(400)
            shot(page, '08_rematch_setup')
        except Exception as e:
            print('rematch click failed:', e)
        browser.close()
    print('UI_REVIEW_DONE')

if __name__ == '__main__':
    main()
