#!/usr/bin/env python3
"""Bake the reviewed frame shifts into texture cells once, offline.

The game never reads the correction manifest.  Runtime rendering therefore has
no position-compensation layer and cannot reinterpret deliberate animation
motion as drift.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tools" / "frame_position_corrections.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pack(frames: list[Image.Image], width: int, height: int, columns: int) -> Image.Image:
    sheet = Image.new("RGBA", (width * columns, height * math.ceil(len(frames) / columns)))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % columns) * width, (index // columns) * height))
    return sheet


def shifted(frame: Image.Image, dx: int, dy: int) -> Image.Image:
    target = Image.new("RGBA", frame.size)
    target.alpha_composite(frame, (dx, dy))
    return target


def save(sheet: Image.Image, path: Path) -> None:
    if path.suffix.lower() == ".webp":
        sheet.save(path, "WEBP", lossless=True, quality=100, method=6, exact=True)
    else:
        sheet.save(path, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    results = []
    for relative, spec in data["assets"].items():
        path = ROOT / relative
        current = digest(path)
        corrected = spec.get("correctedSha256")
        if corrected and current == corrected:
            results.append({"path": relative, "status": "already-corrected", "sha256": current})
            continue
        if current != spec["sourceSha256"]:
            raise SystemExit(f"unexpected source hash: {relative}: {current}")
        if args.verify:
            raise SystemExit(f"correction not yet applied: {relative}")
        fw, fh = int(spec["frameWidth"]), int(spec["frameHeight"])
        columns, count = int(spec["columns"]), int(spec["frameCount"])
        dx, dy = (int(value) for value in spec["shift"])
        with Image.open(path) as source:
            atlas = source.convert("RGBA")
        frames = []
        for index in range(count):
            x, y = (index % columns) * fw, (index // columns) * fh
            frames.append(shifted(atlas.crop((x, y, x + fw, y + fh)), dx, dy))
        save(pack(frames, fw, fh, columns), path)
        results.append({"path": relative, "status": "corrected", "sha256": digest(path)})
    print(json.dumps({"ok": True, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
