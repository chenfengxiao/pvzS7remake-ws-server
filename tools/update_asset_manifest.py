#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'config/asset-manifest.json'
old = json.loads(MANIFEST.read_text(encoding='utf-8'))
old_by_path = {item['path']: item for item in old['assets']}
assets = []
for path in sorted((ROOT / 'assets').rglob('*')):
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT).as_posix()
    data = path.read_bytes()
    mime = old_by_path.get(rel, {}).get('mime') or mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    assets.append({'path': rel, 'mime': mime, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
old['assets'] = assets
MANIFEST.write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'updated {len(assets)} assets')
