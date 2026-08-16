#!/usr/bin/env python3
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "dist/S7_FAST_ENTRY.html").read_text()
html = html.replace(
    'const QUAD_DOCUMENT_BASE = new URL(".", location.href).href;',
    'const QUAD_DOCUMENT_BASE = "https://example.invalid/game/";'
)
script = '''<script>(()=>{const names=['selfTest','hitFeedbackSmokeTest','plantingSmokeTest','sunflowerTimegrassSmokeTest','balloonGroundMotionSmokeTest','cactusBalloonModeSmokeTest','cattailPrioritySmokeTest','cattailTurretSpeedSmokeTest'];const r={};for(const n of names){try{r[n]=n==='selfTest'?S7Final.selfTest():S7Final[n]();}catch(e){r[n]={ok:false,error:String(e&&e.stack||e)}}}window.__R=r})()</script>'''
html = html.replace('</body>', script + '</body>')
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-gpu'])
    page = browser.new_page(viewport={'width':1440,'height':1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='load', timeout=120000)
    page.wait_for_function('window.__R', timeout=120000)
    result = page.evaluate('window.__R')
    browser.close()
result['pageErrors'] = errors
out = ROOT / 'dist/2026-08-04_runtime_smoke.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2))
failed = [name for name, value in result.items() if name != 'pageErrors' and isinstance(value, dict) and not value.get('ok')]
print(json.dumps({'ok': not failed and not errors, 'failed': failed, 'pageErrors': errors}, ensure_ascii=False, indent=2))
if failed or errors:
    raise SystemExit(1)
