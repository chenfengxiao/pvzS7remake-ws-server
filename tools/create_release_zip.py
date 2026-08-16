#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'S丐版_1.2.4_僵尸临界值与盲盒路障血量最终版_2026-08-05.zip'
SKIP_DIRS = {'node_modules', '__pycache__', 'frame-position-review', 'frame-position-review-before'}
SKIP_FILES = {'S7_SLIM_SINGLEFILE.html', 'S7_REBUILT_SINGLEFILE.html'}

with ZipFile(OUT, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if path.is_dir() or any(part in SKIP_DIRS for part in rel.parts) or path.suffix == '.pyc' or path.name in SKIP_FILES:
            continue
        archive.write(path, Path(ROOT.name) / rel)
print(OUT)
