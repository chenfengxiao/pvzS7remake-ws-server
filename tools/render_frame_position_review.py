#!/usr/bin/env python3
"""Render every multi-frame plant/zombie atlas in its untouched frame cells.

This is an offline visual-review tool.  It does not calculate or apply runtime
anchors: every panel shows the pixels exactly where they live in the atlas so
an incorrect source frame can be corrected at the texture layer.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from audit_visual_assets import classify, parse_manifest_specs, select_spec


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "frame-position-review"
CELL = 210
LABEL = 44
COLS = 8


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def metrics() -> dict[str, dict]:
    path = ROOT / "dist" / "source-frame-metrics.json"
    if not path.is_file():
        raise RuntimeError("run build_visual_metrics() before rendering frame review")
    return json.loads(path.read_text(encoding="utf-8"))


OVERRIDES = {
    "bobsled_sled.webp": (384, 192, 6, 6),
    "ladder_attack_new.webp": (240, 311, 3, 6),
    "ladder_carry_attack.webp": (240, 311, 5, 15),
}


def geometry(path: Path, count: int, specs: dict[str, list[dict]]) -> tuple[int, int, int, int] | None:
    if path.name in OVERRIDES:
        return OVERRIDES[path.name]
    with Image.open(path) as image:
        chosen = select_spec(path, image.width, image.height, specs)
        if not chosen:
            return None
        fw = int(chosen["frameWidth"])
        fh = int(chosen["frameHeight"])
        columns = int(chosen.get("columns", max(1, image.width // fw)))
        frames = int(chosen.get("frameCount", int(chosen.get("columns", columns)) * int(chosen.get("rows", 1))))
        return fw, fh, columns, frames


def checker(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#20322a")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], 16):
        for x in range(0, size[0], 16):
            draw.rectangle(
                (x, y, x + 15, y + 15),
                fill="#294338" if ((x + y) // 16) & 1 else "#243a31",
            )
    return image


def render(path: Path, record: dict, spec: tuple[int, int, int, int], target: Path) -> None:
    fw, fh, columns, count = spec
    rows = math.ceil(count / COLS)
    sheet = checker((COLS * CELL, 70 + rows * (CELL + LABEL)))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((0, 0, sheet.width, 69), fill="#08150f")
    draw.text((16, 12), path.relative_to(ROOT).as_posix(), fill="#f0fff6", font=font(24))
    draw.text((16, 42), f"native cell {fw}x{fh} · {count} frames · pixels are not recentered",
              fill="#a7c8b4", font=font(16))
    scale = min((CELL - 18) / fw, (CELL - 18) / fh)
    frames = record["frames"][:count]
    with Image.open(path) as source:
        atlas = source.convert("RGBA")
        for index in range(count):
            col, row = index % COLS, index // COLS
            left, top = col * CELL, 70 + row * (CELL + LABEL)
            x = (index % columns) * fw
            y = (index // columns) * fh
            value = atlas.crop((x, y, x + fw, y + fh))
            resized = value.resize((max(1, round(fw * scale)), max(1, round(fh * scale))), Image.Resampling.LANCZOS)
            px = left + CELL / 2 - resized.width / 2
            py = top + CELL / 2 - resized.height / 2
            sheet.paste(resized, (round(px), round(py)), resized)
            draw.line((left + CELL / 2, top + 5, left + CELL / 2, top + CELL - 5), fill="#38d9f5", width=1)
            median_bottom = float(record["bottom"])
            gy = top + CELL / 2 + (median_bottom - fh / 2) * scale
            draw.line((left + 5, gy, left + CELL - 5, gy), fill="#f5ce42", width=1)
            frame = frames[index] if index < len(frames) else None
            if frame:
                dx = float(frame["cx"]) - float(record["cx"])
                dy = float(frame["bottom"]) - median_bottom
                label = f"f{index:02d}  bbox Δx {dx:+.1f}  Δy {dy:+.1f}"
            else:
                label = f"f{index:02d}  EMPTY"
            draw.rectangle((left, top + CELL, left + CELL - 1, top + CELL + LABEL - 1), fill="#0b1912")
            draw.text((left + 8, top + CELL + 10), label, fill="#e5f5eb", font=font(15))
    sheet.save(target, "JPEG", quality=93, subsampling=0)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = parse_manifest_specs(ROOT / "src/js")
    report = {"reviewed": [], "skipped": []}
    for source, record in sorted(metrics().items()):
        if len(record.get("frames", [])) <= 1:
            continue
        path = ROOT / source.removeprefix("./")
        category = classify(path)
        if category not in {"plant", "zombie"} or not path.is_file():
            continue
        spec = geometry(path, len(record["frames"]), specs)
        if not spec:
            report["skipped"].append(source)
            continue
        safe = path.relative_to(ROOT / "assets").as_posix().replace("/", "__")
        target = OUT / category / f"{safe}.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        render(path, record, spec, target)
        report["reviewed"].append({"path": source, "sheet": target.relative_to(ROOT).as_posix(), "frames": spec[3]})
    report["ok"] = not report["skipped"]
    (OUT / "frame-position-review.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"ok": report["ok"], "reviewed": len(report["reviewed"]),
                      "skipped": report["skipped"]}, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
