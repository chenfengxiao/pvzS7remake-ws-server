#!/usr/bin/env python3
# Real-browser vs headless rule parity: runs the SAME scenario specs in a real
# Chromium page (dist build) and asserts probe equality with headless results.
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from playwright_browser import launch_chromium, open_standalone_page
from playwright.sync_api import sync_playwright

def main():
    # 1. rebuild fast entry from current src
    subprocess.run(['python3', 'tools/build_fast_entry.py'], cwd=ROOT, check=True)
    # 2. headless reference results (also asserts expectations internally)
    subprocess.run(['node', 'tools/versus_lab/run_scenarios.mjs'], cwd=ROOT, check=True)
    headless = {r['name']: r for r in json.loads((ROOT / 'dist/versus_lab/headless_scenarios.json').read_text())}
    scenarios = json.loads(subprocess.run(['node', 'tools/versus_lab/dump_scenarios.mjs'], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    engine = (ROOT / 'tools/versus_lab/scenario_engine.js').read_text(encoding='utf-8')
    html = (ROOT / 'dist/S7_FAST_ENTRY.html').read_text(encoding='utf-8')

    results = {}
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=True, args=['--no-sandbox', '--disable-gpu'])
        page = browser.new_page()
        open_standalone_page(page, html)
        for spec in scenarios:
            res = page.evaluate(
                "([engineSrc, specJson]) => { eval(engineSrc); return __VERSUS_SCENARIO_RUN(JSON.parse(specJson)); }",
                [engine, json.dumps(spec)])
            results[spec['name']] = res
            print(f"browser done: {spec['name']} t={res['time']}")
        browser.close()

    failures = []
    for spec in scenarios:
        name = spec['name']
        h, b = headless.get(name), results.get(name)
        if not h or not b:
            failures.append(f'{name}: missing result (headless={bool(h)} browser={bool(b)})')
            continue
        for k, hv in h['probes'].items():
            bv = b['probes'].get(k)
            if isinstance(hv, float) or isinstance(bv, float):
                same = hv is not None and bv is not None and abs(float(hv) - float(bv)) < 1e-6
            else:
                same = hv == bv
            if not same:
                failures.append(f'{name}.{k}: headless={hv!r} browser={bv!r}')
        hw, bw = (h.get('result') or {}).get('winner'), (b.get('result') or {}).get('winner')
        if hw != bw:
            failures.append(f'{name}.winner: headless={hw!r} browser={bw!r}')

    out = ROOT / 'dist/versus_lab/browser_scenarios.json'
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    if failures:
        print('PARITY FAIL')
        for f in failures:
            print('  ' + f)
        raise SystemExit(1)
    print(f'VERSUS_RULE_PARITY_PASS {len(scenarios)}/{len(scenarios)} scenarios identical (headless == real browser)')

if __name__ == '__main__':
    main()
