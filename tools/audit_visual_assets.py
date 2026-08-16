#!/usr/bin/env python3
"""Audit every raster asset used by the S7 plant/zombie animation system.

The report is intentionally deterministic: it checks file geometry, alpha
coverage, frame-edge clipping, per-frame bounds and baseline drift.  It also
creates contact sheets for visual review; it never mutates source art.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


IMAGE_SUFFIXES = {".png", ".webp", ".gif", ".jpg", ".jpeg"}
PLANT_MARKERS = ("/plants_", "/custom_plants/", "/user_grid_plants/", "/cornpult/")
ZOMBIE_MARKERS = ("/zombies_", "/newspaper/", "/final_runtime/")


def classify(path: Path) -> str:
    value = "/" + path.as_posix().lower()
    if any(marker in value for marker in PLANT_MARKERS):
        return "plant"
    if any(marker in value for marker in ZOMBIE_MARKERS):
        return "zombie"
    return "other"


def parse_manifest_specs(js_dir: Path) -> dict[str, list[dict[str, int | str]]]:
    """Extract nearby file/frame geometry literals from readable JS manifests."""
    specs: dict[str, list[dict[str, int | str]]] = defaultdict(list)
    object_pattern = re.compile(r"\{[^{}]{0,1600}\}")
    file_pattern = re.compile(r"['\"]?(?:file|idleFile|skillFile)['\"]?\s*:\s*['\"]([^'\"]+)['\"]")
    number_patterns = {
        key: re.compile(rf"['\"]?{key}['\"]?\s*:\s*(\d+)")
        for key in ("frameWidth", "frameHeight", "columns", "frameCount", "rows")
    }
    for js_path in sorted(js_dir.glob("*.js")):
        text = js_path.read_text(encoding="utf-8")
        for object_match in object_pattern.finditer(text):
            block = object_match.group(0)
            files = list(file_pattern.finditer(block))
            if not files:
                continue
            record: dict[str, int | str] = {"source": js_path.name}
            for key, pattern in number_patterns.items():
                number = pattern.search(block)
                if number:
                    record[key] = int(number.group(1))
            if "frameWidth" in record and "frameHeight" in record:
                for match in files:
                    specs[Path(match.group(1)).name].append(record.copy())

    # Dynamic register calls still contain literal filenames and geometry.
    register_pattern = re.compile(
        r"['\"]([^'\"]+\.(?:png|webp|gif|jpg|jpeg))['\"]\s*,\s*"
        r"\{[^{}]{0,260}?frameWidth\s*:\s*(\d+)\s*,\s*"
        r"frameHeight\s*:\s*(\d+)\s*,\s*columns\s*:\s*(\d+)\s*,\s*frameCount\s*:\s*(\d+)",
        re.IGNORECASE,
    )
    for js_path in sorted(js_dir.glob("*.js")):
        text = js_path.read_text(encoding="utf-8")
        for match in register_pattern.finditer(text):
            specs[Path(match.group(1)).name].append(
                {
                    "source": js_path.name,
                    "frameWidth": int(match.group(2)),
                    "frameHeight": int(match.group(3)),
                    "columns": int(match.group(4)),
                    "frameCount": int(match.group(5)),
                }
            )
    return specs


def select_spec(path: Path, width: int, height: int, specs: dict[str, list[dict]]) -> dict | None:
    candidates = specs.get(path.name, [])
    if not candidates:
        return None
    scored: list[tuple[int, dict]] = []
    for spec in candidates:
        fw = int(spec["frameWidth"])
        fh = int(spec["frameHeight"])
        columns = int(spec.get("columns", max(1, width // fw)))
        count = int(spec.get("frameCount", columns * max(1, height // fh)))
        rows = math.ceil(count / max(1, columns))
        mismatch = abs(width - fw * columns) + abs(height - fh * rows)
        scored.append((mismatch, spec))
    return min(scored, key=lambda item: item[0])[1]


def alpha_bbox(alpha: Image.Image, threshold: int = 8) -> tuple[int, int, int, int] | None:
    return alpha.point(lambda value: 255 if value > threshold else 0).getbbox()


def audit_image(path: Path, root: Path, specs: dict[str, list[dict]]) -> dict:
    try:
        with Image.open(path) as opened:
            rgba = opened.convert("RGBA")
    except Exception as error:
        return {
            "path": path.relative_to(root).as_posix(),
            "category": classify(path),
            "format": path.suffix.lower().lstrip("."),
            "width": 0,
            "height": 0,
            "alpha": {"transparentRatio": 0, "semitransparentRatio": 0, "opaqueRatio": 0, "bbox": None, "borderPixels": 0},
            "manifest": None,
            "frameGeometry": {"width": 0, "height": 0, "columns": 0, "count": 0, "ok": False},
            "drift": {"bottomRange": 0, "centerXRange": 0, "widthRange": 0, "heightRange": 0},
            "frames": [],
            "flags": ["unreadable_image"],
            "error": str(error),
        }
    width, height = rgba.size
    alpha = rgba.getchannel("A")
    histogram = alpha.histogram()
    pixels = width * height
    transparent = sum(histogram[:9])
    semitransparent = sum(histogram[9:255])
    opaque = histogram[255]
    bbox = alpha_bbox(alpha)
    outer = Image.new("L", (width, height), 0)
    outer_pixels = outer.load()
    for x in range(width):
        outer_pixels[x, 0] = 255
        outer_pixels[x, height - 1] = 255
    for y in range(height):
        outer_pixels[0, y] = 255
        outer_pixels[width - 1, y] = 255
    border_alpha = Image.composite(alpha, Image.new("L", (width, height), 0), outer)
    border_nontransparent = sum(border_alpha.point(lambda value: 1 if value > 8 else 0).getdata())

    spec = select_spec(path, width, height, specs)
    frame_records: list[dict] = []
    geometry_ok = True
    frame_width = width
    frame_height = height
    columns = 1
    frame_count = 1
    if spec:
        frame_width = int(spec["frameWidth"])
        frame_height = int(spec["frameHeight"])
        columns = int(spec.get("columns", max(1, width // frame_width)))
        frame_count = int(spec.get("frameCount", columns * max(1, height // frame_height)))
        required_rows = math.ceil(frame_count / max(1, columns))
        geometry_ok = width >= frame_width * columns and height >= frame_height * required_rows
        if geometry_ok:
            for index in range(frame_count):
                sx = (index % columns) * frame_width
                sy = (index // columns) * frame_height
                frame_alpha = alpha.crop((sx, sy, sx + frame_width, sy + frame_height))
                frame_bbox = alpha_bbox(frame_alpha)
                if frame_bbox:
                    left, top, right, bottom = frame_bbox
                    frame_records.append(
                        {
                            "index": index,
                            "bbox": [left, top, right, bottom],
                            "width": right - left,
                            "height": bottom - top,
                            "centerX": (left + right) / 2,
                            "bottom": bottom,
                            "touchesEdge": left == 0 or top == 0 or right == frame_width or bottom == frame_height,
                        }
                    )
                else:
                    frame_records.append({"index": index, "empty": True, "touchesEdge": False})

    nonempty = [frame for frame in frame_records if not frame.get("empty")]
    def spread(field: str) -> float:
        values = [float(frame[field]) for frame in nonempty]
        return round(max(values) - min(values), 3) if values else 0.0

    flags: list[str] = []
    if not geometry_ok:
        flags.append("geometry_mismatch")
    if border_nontransparent:
        flags.append("sheet_edge_content")
    if any(frame.get("touchesEdge") for frame in frame_records):
        flags.append("frame_edge_content")
    if any(frame.get("empty") for frame in frame_records):
        flags.append("empty_frame")
    if pixels and transparent / pixels < 0.05 and classify(path) in {"plant", "zombie"}:
        flags.append("low_transparency")
    if spread("bottom") > frame_height * 0.16:
        flags.append("large_bottom_drift")
    if spread("centerX") > frame_width * 0.18:
        flags.append("large_horizontal_drift")
    if spread("width") > frame_width * 0.42 or spread("height") > frame_height * 0.42:
        flags.append("large_extent_variation")

    return {
        "path": path.relative_to(root).as_posix(),
        "category": classify(path),
        "format": path.suffix.lower().lstrip("."),
        "width": width,
        "height": height,
        "alpha": {
            "transparentRatio": round(transparent / pixels, 6),
            "semitransparentRatio": round(semitransparent / pixels, 6),
            "opaqueRatio": round(opaque / pixels, 6),
            "bbox": list(bbox) if bbox else None,
            "borderPixels": border_nontransparent,
        },
        "manifest": spec,
        "frameGeometry": {
            "width": frame_width,
            "height": frame_height,
            "columns": columns,
            "count": frame_count,
            "ok": geometry_ok,
        },
        "drift": {
            "bottomRange": spread("bottom"),
            "centerXRange": spread("centerX"),
            "widthRange": spread("width"),
            "heightRange": spread("height"),
        },
        "frames": frame_records,
        "flags": flags,
    }


def make_contact_sheet(records: list[dict], root: Path, output: Path, title: str, category: str, flagged_only: bool) -> None:
    selected = [r for r in records if r["category"] == category and (r["flags"] or not flagged_only)]
    if not selected:
        return
    tile_w, tile_h, columns = 280, 235, 4
    rows = math.ceil(len(selected) / columns)
    sheet = Image.new("RGB", (tile_w * columns, tile_h * rows + 42), "#161a1d")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((12, 12), title, fill="white", font=font)
    for number, record in enumerate(selected):
        x = (number % columns) * tile_w
        y = (number // columns) * tile_h + 42
        path = root / record["path"]
        try:
            with Image.open(path) as source:
                rgba = source.convert("RGBA")
        except Exception:
            continue
        fw = int(record["frameGeometry"]["width"])
        fh = int(record["frameGeometry"]["height"])
        count = int(record["frameGeometry"]["count"])
        columns_in_asset = int(record["frameGeometry"]["columns"])
        sample_indices = sorted(set([0, max(0, count // 3), max(0, 2 * count // 3), max(0, count - 1)]))
        thumbs: list[Image.Image] = []
        if record["frameGeometry"]["ok"]:
            for frame_index in sample_indices:
                sx = (frame_index % columns_in_asset) * fw
                sy = (frame_index // columns_in_asset) * fh
                thumbs.append(rgba.crop((sx, sy, sx + fw, sy + fh)))
        else:
            thumbs.append(rgba)
        preview = Image.new("RGBA", (tile_w - 16, 150), (35, 41, 45, 255))
        slot_w = preview.width // max(1, len(thumbs))
        for index, thumb in enumerate(thumbs):
            thumb.thumbnail((slot_w - 6, 144), Image.Resampling.LANCZOS)
            tx = index * slot_w + (slot_w - thumb.width) // 2
            ty = (preview.height - thumb.height) // 2
            preview.alpha_composite(thumb, (tx, ty))
        sheet.paste(preview.convert("RGB"), (x + 8, y + 8))
        name = record["path"]
        if len(name) > 42:
            name = "…" + name[-41:]
        draw.text((x + 8, y + 165), name, fill="#f4f4f4", font=font)
        draw.text((x + 8, y + 181), f"{record['width']}x{record['height']}  frames:{count}", fill="#b7c4cc", font=font)
        flag_text = ", ".join(record["flags"][:3]) or "ok"
        draw.text((x + 8, y + 197), flag_text, fill="#ff8e72" if record["flags"] else "#74c69d", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    project = args.project.resolve()
    output = (args.out or project / "dist" / "visual-audit").resolve()
    assets = project / "assets"
    specs = parse_manifest_specs(project / "src" / "js")
    paths = sorted(path for path in assets.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    records = [audit_image(path, project, specs) for path in paths]
    output.mkdir(parents=True, exist_ok=True)
    (output / "visual-asset-audit.json").write_text(
        json.dumps({"assetCount": len(records), "records": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with (output / "visual-asset-audit.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["path", "category", "size", "frames", "transparent_ratio", "bottom_drift", "horizontal_drift", "flags"])
        for record in records:
            writer.writerow(
                [
                    record["path"],
                    record["category"],
                    f"{record['width']}x{record['height']}",
                    record["frameGeometry"]["count"],
                    record["alpha"]["transparentRatio"],
                    record["drift"]["bottomRange"],
                    record["drift"]["centerXRange"],
                    "|".join(record["flags"]),
                ]
            )
    make_contact_sheet(records, project, output / "flagged-plants.jpg", "S7 flagged plant assets", "plant", True)
    make_contact_sheet(records, project, output / "flagged-zombies.jpg", "S7 flagged zombie assets", "zombie", True)
    summary = {
        "assetCount": len(records),
        "plantCount": sum(r["category"] == "plant" for r in records),
        "zombieCount": sum(r["category"] == "zombie" for r in records),
        "flaggedCount": sum(bool(r["flags"]) for r in records),
        "flags": {flag: sum(flag in r["flags"] for r in records) for flag in sorted({f for r in records for f in r["flags"]})},
    }
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
