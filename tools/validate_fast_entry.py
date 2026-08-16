#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'dist/S7_FAST_ENTRY.html'
OUT = ROOT / 'dist/fast-entry-validation.json'
errors: list[str] = []
html = ENTRY.read_text(encoding='utf-8')

if re.search(r'<script[^>]+src=', html, re.I):
    errors.append('external script tag remains')
if re.search(r'<link[^>]+stylesheet', html, re.I):
    errors.append('external stylesheet remains')
if 'window.s7ResolveEmbeddedAsset=function(path){return String(path||"");};' not in html:
    errors.append('external-asset resolver missing')
if '<base href="../">' not in html:
    errors.append('dist-to-project base path missing')
if 'data:application/octet-stream;base64' in html or 'type="application/octet-stream"' in html:
    errors.append('embedded asset payload unexpectedly present')
if 'S7_SPRITES.preloadAll();' in html or 'function s7RedrawWhenReady' in html:
    errors.append('eager sprite preload or permanent redraw poll returned')

scripts = re.findall(r'<script>(.*?)</script>', html, re.S | re.I)
with tempfile.TemporaryDirectory(prefix='s7-fast-check-') as temp_dir:
    temp = Path(temp_dir)
    for i, source in enumerate(scripts):
        path = temp / f'{i:02d}.js'
        path.write_text(source.replace('<\\/script>', '</script>'), encoding='utf-8')
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
        if result.returncode:
            errors.append(f'inline script {i} syntax error: {result.stderr.strip()[:240]}')

report = {
    'ok': not errors,
    'file': ENTRY.name,
    'bytes': ENTRY.stat().st_size,
    'inlineScriptCount': len(scripts),
    'externalAssets': True,
    'timelineRenderingPreserved': 'return S7_ANIMATION_RENDER_MODES.TIMELINE' in html,
    'errors': errors,
}
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['ok'] else 1)
