#!/usr/bin/env python3
from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else 'S7_SINGLEFILE_FINAL_OPTIMIZED.html').resolve()
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'unpacked').resolve()
OUT.mkdir(parents=True, exist_ok=True)
soup = BeautifulSoup(SOURCE.read_text(encoding='utf-8'), 'html.parser')
count = 0
for node in soup.find_all('script', {'type': 'application/octet-stream'}):
    rel = str(node.get('data-path') or '').removeprefix('./').lstrip('/')
    payload = re.sub(r'\s+', '', node.string or '')
    data = base64.b64decode(payload, validate=True)
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    count += 1
print(f'extracted {count} assets to {OUT}')
