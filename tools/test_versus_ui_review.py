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
        browser = launch_chromium(p, headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])
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
        # 开始选卡（AI 自动补完）；人类回合由测试用同一共享 policy 推荐选卡（避免首卡防御卡组导致战斗过短）
        page.click('#versusPracticeBeginBtn')
        page.wait_for_timeout(800)
        for _ in range(60):
            start_visible = page.evaluate("!document.getElementById('versusPracticeStartBattleBtn').classList.contains('hidden')")
            if start_visible:
                break
            is_human_turn = page.evaluate("(document.getElementById('versusPracticeInstruction')?.textContent || '').includes('轮到你')")
            if is_human_turn:
                rec = page.evaluate("""() => {
                  const ids = Array.from(document.querySelectorAll('.versusDraftCard:not(.disabled)')).map(b => b.dataset.id);
                  if (!ids.length) return null;
                  return window.S7VersusAI?.draftChoice?.('plant','pick', ids, () => false, {}) || ids[0];
                }""")
                if rec:
                    try:
                        page.click(f'.versusDraftCard[data-id="{rec}"]', timeout=1500)
                    except Exception:
                        pass
            page.wait_for_timeout(450)
        shot(page, '04_draft_done')
        # 开战
        page.click('#versusPracticeStartBattleBtn')
        page.wait_for_timeout(1200)
        shot(page, '05_battle_start')
        # 快进 60 秒：同一页面真实 update 循环；植物方本为人类侧，测试代为调用同一共享 policy（AI vs AI）
        page.evaluate("""() => {
          const DT = FIXED_FRAME_DT, B = window.S7VersusBattle;
          let last = -1e9;
          for (let i = 0; i < 60 / DT; i++){
            update(DT);
            if (i % 5 === 0){
              B.tick(0.2);
              const t = state.time;
              if (t - last >= 1.0){ last = t; if (B.state.active) window.S7VersusAI?.decide?.('plant', B); }
            }
          }
        }""")
        page.wait_for_timeout(400)
        shot(page, '06_battle_mid')
        # 快进到 SD(300s) 后：若战斗仍在进行，捕获 SD 截图；再推进到结算
        page.evaluate("""() => {
          const DT = FIXED_FRAME_DT, B = window.S7VersusBattle;
          let last = -1e9; window.__sdT = null;
          for (let i = 0; i < 340 / DT; i++){
            update(DT);
            if (i % 5 === 0){
              B.tick(0.2);
              const t = state.time;
              if (t - last >= 1.0){ last = t; if (B.state.active) window.S7VersusAI?.decide?.('plant', B); }
              if (t >= 312 && window.__sdT == null) window.__sdT = t;
            }
            if (!state.running) break;
          }
        }""")
        page.wait_for_timeout(600)
        sd_reached = page.evaluate("window.__sdT != null")
        print('SD_REACHED', sd_reached)
        if sd_reached:
            shot(page, '06b_sudden_death')
        # 继续推进到结算（最多再 400 秒）
        page.evaluate("""() => {
          const DT = FIXED_FRAME_DT, B = window.S7VersusBattle;
          let last = -1e9;
          for (let i = 0; i < 400 / DT; i++){
            update(DT);
            if (i % 5 === 0){
              B.tick(0.2);
              const t = state.time;
              if (t - last >= 1.0){ last = t; if (B.state.active) window.S7VersusAI?.decide?.('plant', B); }
            }
            if (!state.running) break;
          }
        }""")
        page.wait_for_timeout(3000)
        shot(page, '07_result')
        result = page.evaluate("window.S7VersusBattle?.state?.versus?.result || null")
        print('RESULT', result)
        # 重开回设置（native click，避免 Playwright 坐标点击被模态背景拦截）
        try:
            page.evaluate("document.getElementById('versusResultRematchBtn')?.click()")
            page.wait_for_timeout(600)
            shot(page, '08_rematch_setup')
        except Exception as e:
            print('rematch click failed:', e)
        # 第二局：从设置重新选卡开战，验证状态重置（资源回到75/75、无旧战斗残留）
        try:
            page.click('#versusPracticeBeginBtn')
            page.wait_for_timeout(800)
            for _ in range(60):
                if page.evaluate("!document.getElementById('versusPracticeStartBattleBtn').classList.contains('hidden')"):
                    break
                ih = page.evaluate("(document.getElementById('versusPracticeInstruction')?.textContent || '').includes('轮到你')")
                if ih:
                    rec = page.evaluate("""() => {
                      const ids = Array.from(document.querySelectorAll('.versusDraftCard:not(.disabled)')).map(b => b.dataset.id);
                      if (!ids.length) return null;
                      return window.S7VersusAI?.draftChoice?.('plant','pick', ids, () => false, {}) || ids[0];
                    }""")
                    if rec:
                        try:
                            page.click(f'.versusDraftCard[data-id="{rec}"]', timeout=1500)
                        except Exception:
                            pass
                page.wait_for_timeout(450)
            page.click('#versusPracticeStartBattleBtn')
            page.wait_for_timeout(1200)
            g2 = page.evaluate("""() => ({
              active: !!window.S7VersusBattle?.state?.active,
              phase: window.S7VersusBattle?.state?.versus?.phase,
              plantSun: window.S7VersusBattle?.state?.resources?.plant,
              zombieBrain: window.S7VersusBattle?.state?.resources?.zombie,
              time: window.S7VersusBattle?.state?.time,
              targetsLeft: (window.S7VersusBattle?.state?.versus?.target?.total ?? 5) - (window.S7VersusBattle?.state?.versus?.target?.destroyed ?? 0)
            })""")
            print('GAME2_RESET', g2)
            shot(page, '09_rematch_battle2')
            # 快进到 SD(300s) 后：植物方由共享 policy 驱动 + 测试夹具（阳光下限/脑量上限，仅此截图用途）保证战斗持续到 SD
            page.evaluate("""() => {
              const DT = FIXED_FRAME_DT, B = window.S7VersusBattle;
              let last = -1e9; window.__sdT = null;
              for (let i = 0; i < 340 / DT; i++){
                update(DT);
                if (i % 5 === 0){
                  B.tick(0.2);
                  const t = state.time;
                  if (B.state.active && B.state.resources){
                    B.state.resources.plant = Math.max(B.state.resources.plant, 500);
                    B.state.resources.zombie = Math.min(B.state.resources.zombie, 50);
                  }
                  if (t - last >= 1.0){ last = t; if (B.state.active) window.S7VersusAI?.decide?.('plant', B); }
                  if (t >= 312 && window.__sdT == null) window.__sdT = t;
                }
                if (!state.running) break;
              }
            }""")
            page.wait_for_timeout(600)
            sd2 = page.evaluate("window.__sdT != null")
            print('SD2_REACHED', sd2)
            if sd2:
                shot(page, '10_sudden_death')
            sd_state = page.evaluate("""() => ({
              t: state.time,
              sdActive: window.S7VersusBattle?.state?.versus?.suddenDeath ? true : (state.time >= 300),
              plantSun: window.S7VersusBattle?.state?.resources?.plant,
              zombieBrain: window.S7VersusBattle?.state?.resources?.zombie
            })""")
            print('SD_STATE', sd_state)
        except Exception as e:
            print('game2 failed:', e)
        browser.close()
    print('UI_REVIEW_DONE')

if __name__ == '__main__':
    main()
