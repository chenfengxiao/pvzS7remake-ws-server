#!/usr/bin/env python3
"""Repair the S7 plant/zombie runtime textures without touching gameplay.

The fixes are deterministic and intentionally limited to raster assets:
* remove leaked chroma-key backgrounds/edge spill from final zombie sheets;
* rebuild every red-eye giant sheet from the complete white-eye animation;
* restore the ladder walk/carry/attack atlases from complete source frames;
* rebuild the bobsled member death and complete four-rider sled animation;
* replace the one blank marigold skill frame with its nearest valid pose;
* emit full per-frame metrics for offline QA and median heights for runtime size only.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import statistics
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, find_objects, label


ROOT = Path(__file__).resolve().parents[1]
FINAL = ROOT / "assets" / "final_runtime"


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save_webp(image: Image.Image, path: Path) -> None:
    # WebP encoding is written atomically: an interrupted encoder must never
    # truncate the last known-good runtime texture.
    temporary = path.with_name(path.name + ".tmp")
    image.convert("RGBA").save(temporary, "WEBP", lossless=True, method=6)
    if not temporary.is_file() or temporary.stat().st_size <= 0:
        raise RuntimeError(f"empty WebP encoder output: {temporary}")
    temporary.replace(path)
    # Some overlay filesystems leave a zero-byte source placeholder after an
    # otherwise successful replace; it is never a runtime asset.
    if temporary.exists():
        temporary.unlink()


def frame(sheet: Image.Image, index: int, width: int, height: int, columns: int) -> Image.Image:
    left = (index % columns) * width
    top = (index // columns) * height
    return sheet.crop((left, top, left + width, top + height))


def pack(frames: list[Image.Image], width: int, height: int, columns: int) -> Image.Image:
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (width * columns, height * rows), (0, 0, 0, 0))
    for index, value in enumerate(frames):
        sheet.alpha_composite(value, ((index % columns) * width, (index // columns) * height))
    return sheet


def remove_green_chroma(image: Image.Image) -> Image.Image:
    """Remove only unmistakable neon-green key pixels, preserving zombie skin."""
    a = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = a[:, :, :3].astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hard = (
        (a[:, :, 3] > 0)
        & (green > 105)
        & (green > red * 1.42)
        & (green > blue * 1.32)
        & ((green - np.maximum(red, blue)) > 42)
    )
    a[hard, 3] = 0

    # Despill a two-pixel antialias fringe adjacent to removed chroma.
    fringe = binary_dilation(hard, iterations=2) & ~hard & (a[:, :, 3] > 0)
    tinted = fringe & (green > np.maximum(red, blue) + 14)
    neutral = np.maximum(red, blue)
    a[:, :, 1][tinted] = np.clip(neutral[tinted] + 5, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def remove_blue_chroma(image: Image.Image) -> Image.Image:
    """Key the generated pure-blue background while retaining soft outline alpha."""
    a = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = a[:, :, :3].astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    dominance = blue - np.maximum(red, green)
    hard = (blue > 120) & (dominance > 58)
    soft = (blue > 90) & (dominance > 18)
    alpha = a[:, :, 3].astype(np.float32)
    soft_alpha = np.clip((58 - dominance) / 40 * 255, 0, 255)
    alpha[soft] = np.minimum(alpha[soft], soft_alpha[soft])
    alpha[hard] = 0
    a[:, :, 3] = alpha.astype(np.uint8)

    # Blue despill on remaining edge pixels.
    edge = (a[:, :, 3] > 0) & (dominance > 8)
    a[:, :, 2][edge] = np.clip(np.maximum(red, green)[edge] + 4, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def recolor_giant_eyes(value: Image.Image) -> Image.Image:
    """Turn the Gargantuar's two sclera components red; never recolor the Imp."""
    a = np.array(value.convert("RGBA"), dtype=np.uint8)
    rgb = a[:, :, :3]
    pale = (
        (a[:, :, 3] > 8)
        & (rgb[:, :, 0] > 165)
        & (rgb[:, :, 1] > 165)
        & (rgb[:, :, 2] > 135)
        & ((rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)) < 80)
    )
    components, _ = label(pale)
    candidates: list[tuple[int, float, float, int]] = []
    for component_id, bounds in enumerate(find_objects(components), start=1):
        if bounds is None:
            continue
        mask = components[bounds] == component_id
        area = int(mask.sum())
        if area < 25:
            continue
        ys, xs = np.where(components == component_id)
        candidates.append((area, float(xs.mean()), float(ys.mean()), component_id))
    if not candidates:
        return value

    # The carried Imp is always higher than the giant face; choose the lowest
    # substantial pale eye component, then include the nearby second sclera.
    main = max(candidates, key=lambda item: (item[2], item[0]))
    _, cx, cy, main_id = main
    selected = {main_id}
    for _, x, y, component_id in candidates:
        if math.hypot(x - cx, y - cy) <= 36:
            selected.add(component_id)
    mask = np.isin(components, list(selected))
    luminance = (
        rgb[:, :, 0].astype(np.float32) * .30
        + rgb[:, :, 1].astype(np.float32) * .59
        + rgb[:, :, 2].astype(np.float32) * .11
    ) / 220.0
    a[:, :, 0][mask] = np.clip(220 * luminance[mask], 118, 244).astype(np.uint8)
    a[:, :, 1][mask] = np.clip(48 * luminance[mask], 22, 74).astype(np.uint8)
    a[:, :, 2][mask] = np.clip(32 * luminance[mask], 16, 58).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def repair_giants() -> None:
    specs = {
        "walk": (320, 216, 5, 10),
        "hammer": (320, 216, 8, 24),
        "throw": (320, 216, 8, 24),
        "death": (320, 216, 8, 22),
    }
    for action, (fw, fh, columns, count) in specs.items():
        source = rgba(FINAL / f"garg_{action}.webp")
        fixed: list[Image.Image] = []
        for index in range(count):
            complete = remove_green_chroma(frame(source, index, fw, fh, columns))
            fixed.append(recolor_giant_eyes(complete))
        save_webp(pack(fixed, fw, fh, columns), FINAL / f"giga_{action}.webp")

        # The white-eye sheets carried the same leaked green key outline.
        white = [remove_green_chroma(frame(source, i, fw, fh, columns)) for i in range(count)]
        save_webp(pack(white, fw, fh, columns), FINAL / f"garg_{action}.webp")


def clean_other_final_runtime() -> None:
    """Remove chroma spill from every remaining whole-zombie runtime atlas."""
    specs = {
        "catapult_drive": (288, 258, 8, 16),
        "catapult_throw": (288, 258, 8, 24),
        "balloon_fly": (280, 230, 8, 16),
        "balloon_pop": (280, 230, 8, 24),
        "balloon_walk": (280, 230, 8, 16),
        "balloon_attack": (280, 230, 8, 16),
        "balloon_death": (280, 230, 8, 23),
        "yeti_walk": (280, 214, 8, 7),
        "yeti_attack": (280, 214, 8, 7),
        "yeti_death": (280, 214, 8, 23),
        "bungee_descend": (256, 222, 8, 24),
        "bungee_grab": (256, 222, 8, 24),
        "bungee_ascend": (256, 222, 8, 22),
        "digger_walk": (240, 276, 8, 16),
        "digger_attack": (240, 276, 8, 16),
        "digger_surface": (240, 276, 8, 24),
        "digger_death": (240, 276, 8, 24),
        "digger_underground": (180, 180, 6, 6),
        "pogo_move": (240, 263, 8, 16),
        "pogo_walk": (240, 263, 8, 16),
        "pogo_attack": (240, 263, 8, 16),
        "pogo_death": (240, 263, 8, 24),
    }
    for stem, (fw, fh, columns, count) in specs.items():
        path = FINAL / f"{stem}.webp"
        source = rgba(path)
        fixed = [clean_frame_border(remove_green_chroma(frame(source, i, fw, fh, columns))) for i in range(count)]
        save_webp(pack(fixed, fw, fh, columns), path)


def clean_frame_border(value: Image.Image, margin: int = 3) -> Image.Image:
    """Remove long, sparse capture lines touching a cell boundary."""
    a = np.array(value.convert("RGBA"), dtype=np.uint8)
    mask = a[:, :, 3] > 8
    components, _ = label(mask)
    height, width = mask.shape
    for component_id, bounds in enumerate(find_objects(components), start=1):
        if bounds is None:
            continue
        y_slice, x_slice = bounds
        box_w = x_slice.stop - x_slice.start
        box_h = y_slice.stop - y_slice.start
        area = int((components[bounds] == component_id).sum())
        touches = x_slice.start <= margin or y_slice.start <= margin or x_slice.stop >= width - margin or y_slice.stop >= height - margin
        is_line = (box_w > width * .70 and box_h <= 7) or (box_h > height * .70 and box_w <= 7)
        sparse_border = touches and area < max(80, box_w * box_h * .12) and (box_w > width * .55 or box_h > height * .55)
        if is_line or sparse_border:
            a[:, :, 3][components == component_id] = 0
    return Image.fromarray(a, "RGBA")


def retile_ladder(source_name: str, target_name: str) -> None:
    source = rgba(FINAL / source_name)
    fw, fh, count = 240, 311, 15
    fixed = [clean_frame_border(remove_green_chroma(frame(source, i, fw, fh, 8))) for i in range(count)]
    save_webp(pack(fixed, fw, fh, 5), FINAL / target_name)


def build_ladder_attack() -> None:
    source = rgba(ROOT / "assets" / "zombies_b04a" / "body.attack.png")
    frames: list[Image.Image] = []
    for index in range(6):
        original = frame(source, index, 200, 200, 6)
        canvas = Image.new("RGBA", (240, 311), (0, 0, 0, 0))
        # Preserve native PVZ art; pad rather than stretch, with a stable foot line.
        canvas.alpha_composite(original, (20, 79))
        frames.append(canvas)
    save_webp(pack(frames, 240, 311, 3), FINAL / "ladder_attack_new.webp")


def repair_ladders() -> None:
    retile_ladder("ladder_carry.webp", "ladder_carry_new.webp")
    retile_ladder("ladder_walk.webp", "ladder_walk_new.webp")
    build_ladder_attack()

    # The uploaded carry-attack sheet is physically sliced across cell borders:
    # heads and legs land in adjacent frames. Rebuild a complete aggressive lean
    # cycle from the intact carry poses instead of preserving corrupt fragments.
    carry = rgba(FINAL / "ladder_carry_new.webp")
    carry_frames = [frame(carry, i, 240, 311, 5) for i in range(15)]
    sequence = [9, 10, 11, 12, 13, 14, 13, 12, 11, 10, 9, 10, 11, 12, 13]
    frames = [carry_frames[index].copy() for index in sequence]
    repaired = pack(frames, 240, 311, 5)
    save_webp(repaired, FINAL / "ladder_carry_attack.webp")
    repaired.save(FINAL / "ladder_carry_attack.png", "PNG", optimize=True)


def transform_about_foot(source: Image.Image, angle: float, shift_x: float, shift_y: float, opacity: float) -> Image.Image:
    bbox = source.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if not bbox:
        return source.copy()
    sprite = source.crop(bbox)
    rotated = sprite.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    rotated_bbox = rotated.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if rotated_bbox:
        rotated = rotated.crop(rotated_bbox)
    # Place the complete expanded sprite by visual center/bottom; this makes it
    # impossible for the head to be clipped by the original 704x768 cell.
    base_center = (bbox[0] + bbox[2]) / 2
    base_bottom = bbox[3]
    target_x = round(base_center + shift_x - rotated.width / 2)
    target_y = round(base_bottom + shift_y - rotated.height)
    target_x = max(4, min(source.width - rotated.width - 4, target_x))
    target_y = max(4, min(source.height - rotated.height - 4, target_y))
    result = Image.new("RGBA", source.size, (0, 0, 0, 0))
    result.alpha_composite(rotated, (target_x, target_y))
    if opacity < 1:
        alpha = result.getchannel("A").point(lambda value: round(value * opacity))
        result.putalpha(alpha)
    return result


def repair_bobsled_members() -> None:
    walk_sheet = rgba(FINAL / "bobsled_walk.webp")
    walk_frames = [clean_frame_border(frame(walk_sheet, i, 704, 768, 8)) for i in range(32)]
    save_webp(pack(walk_frames, 704, 768, 8), FINAL / "bobsled_walk.webp")

    attack_sheet = rgba(FINAL / "bobsled_attack.webp")
    attack_frames = [clean_frame_border(frame(attack_sheet, i, 704, 768, 8)) for i in range(36)]
    # Frame zero was an unrelated prone pose; begin from the first complete bite pose.
    attack_frames[0] = attack_frames[1].copy()
    save_webp(pack(attack_frames, 704, 768, 8), FINAL / "bobsled_attack.webp")

    # The supplied death atlas omitted the head/body in alternating layers. Build
    # a connected full-body fall from the complete walk pose instead.
    base = walk_frames[0]
    death_frames: list[Image.Image] = []
    for index in range(27):
        t = index / 26
        eased = t * t * (3 - 2 * t)
        angle = 83 * eased
        shift_x = 100 * eased
        shift_y = 80 * eased + 8 * math.sin(math.pi * min(1, t * 1.2))
        opacity = 1 if index < 22 else max(.20, 1 - (index - 21) / 6)
        death_frames.append(transform_about_foot(base, angle, shift_x, shift_y, opacity))
    save_webp(pack(death_frames, 704, 768, 8), FINAL / "bobsled_death.webp")


def build_bobsled_sled(master_path: Path) -> None:
    keyed = remove_blue_chroma(rgba(master_path))
    bbox = keyed.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox()
    if not bbox:
        raise RuntimeError("The supplied bobsled master has no foreground after blue-key removal")
    vehicle = keyed.crop(bbox)
    # Keep a reproducible, cleaned source alongside the runtime sheet.
    master = vehicle.copy()
    master.thumbnail((1536, 512), Image.Resampling.LANCZOS)
    master.save(FINAL / "bobsled_sled_master.png", "PNG", optimize=True)

    fw, fh = 384, 192
    vehicle.thumbnail((368, 152), Image.Resampling.LANCZOS)
    bob = [0, 2, 4, 2, 0, -1]
    pitch = [0, -0.6, -1.1, -0.4, 0.5, 0.2]
    frames: list[Image.Image] = []
    for dy, angle in zip(bob, pitch):
        pose = vehicle.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        cell = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        x = (fw - pose.width) // 2
        # All runners settle back onto the same baseline by the end of the cycle.
        y = 174 - pose.height - dy
        cell.alpha_composite(pose, (x, y))
        frames.append(cell)
    save_webp(pack(frames, fw, fh, 6), FINAL / "bobsled_sled.webp")


def repair_marigold_blank() -> None:
    path = ROOT / "assets" / "plants_video_dual" / "marigold_skill.png"
    image = rgba(path)
    # B05E manifest cell geometry: 640x640, 5 columns, 10 frames.
    if image.size != (3200, 1280):
        raise RuntimeError(f"unexpected marigold skill geometry: {image.size}")
    frames = [frame(image, i, 640, 640, 5) for i in range(10)]
    nonempty = [i for i, value in enumerate(frames) if value.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox()]
    for index, value in enumerate(frames):
        if value.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox():
            continue
        nearest = min(nonempty, key=lambda candidate: abs(candidate - index))
        frames[index] = frames[nearest].copy()
    pack(frames, 640, 640, 5).save(path, "PNG", optimize=True)


def manifest_specs() -> dict[str, tuple[int, int, int, int]]:
    specs: dict[str, tuple[int, int, int, int]] = {}
    pattern = re.compile(
        r"(?:file|idleFile|skillFile)\s*:\s*['\"]([^'\"]+)['\"][^{}]{0,900}?"
        r"frameWidth\s*:\s*(\d+)[^{}]{0,300}?frameHeight\s*:\s*(\d+)[^{}]{0,300}?"
        r"columns\s*:\s*(\d+)[^{}]{0,300}?frameCount\s*:\s*(\d+)",
        re.DOTALL,
    )
    for path in sorted((ROOT / "src" / "js").glob("*.js")):
        text = path.read_text(encoding="utf-8")
        for match in pattern.finditer(text):
            specs[Path(match.group(1)).name] = tuple(int(match.group(i)) for i in range(2, 6))
    specs.update(
        {
            "bobsled_sled.webp": (384, 192, 6, 6),
            "ladder_attack_new.webp": (240, 311, 3, 6),
        }
    )
    return specs


def metric_for(path: Path, spec: tuple[int, int, int, int] | None) -> dict | None:
    try:
        image = rgba(path)
    except Exception:
        return None
    if spec:
        fw, fh, columns, count = spec
        rows = math.ceil(count / columns)
        if image.width < fw * columns or image.height < fh * rows:
            return None
    else:
        fw, fh, columns, count = image.width, image.height, 1, 1
    records: list[dict | None] = []
    for index in range(count):
        value = frame(image, index, fw, fh, columns)
        bbox = value.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox()
        if not bbox:
            records.append(None)
            continue
        left, top, right, bottom = bbox
        records.append(
            {
                "cx": round((left + right) / 2, 2),
                "bottom": bottom,
                "height": bottom - top,
                "width": right - left,
            }
        )
    valid = [value for value in records if value]
    if not valid:
        return None
    return {
        "h": round(statistics.median(value["height"] for value in valid), 2),
        "cx": round(statistics.median(value["cx"] for value in valid), 2),
        "bottom": round(statistics.median(value["bottom"] for value in valid), 2),
        "frames": records,
    }


def build_visual_metrics() -> None:
    try:
        from audit_visual_assets import parse_manifest_specs, select_spec
    except ImportError:
        from tools.audit_visual_assets import parse_manifest_specs, select_spec
    spec_records = parse_manifest_specs(ROOT / "src" / "js")
    overrides = {
        "bobsled_sled.webp": (384, 192, 6, 6),
        "ladder_attack_new.webp": (240, 311, 3, 6),
        "ladder_carry_attack.webp": (240, 311, 5, 15),
    }
    metrics: dict[str, dict] = {}
    roots = [
        ROOT / "assets" / "cornpult",
        ROOT / "assets" / "custom_plants",
        ROOT / "assets" / "plants_b03a",
        ROOT / "assets" / "plants_b03b",
        ROOT / "assets" / "plants_b03c",
        ROOT / "assets" / "plants_b06",
        ROOT / "assets" / "plants_video_dual",
        ROOT / "assets" / "plants_video_skills",
        ROOT / "assets" / "user_grid_plants",
        ROOT / "assets" / "newspaper",
        ROOT / "assets" / "zombies_b04a",
        ROOT / "assets" / "zombies_b04b",
        ROOT / "assets" / "zombies_b04c",
        ROOT / "assets" / "zombies_b04d",
        ROOT / "assets" / "zombies_b04r",
        ROOT / "assets" / "zombies_b05a",
        ROOT / "assets" / "zombies_b05b",
        ROOT / "assets" / "final_runtime",
    ]
    for asset_root in roots:
        if not asset_root.exists():
            continue
        for path in sorted(asset_root.iterdir()):
            if path.suffix.lower() not in {".png", ".webp", ".gif"} or path.name.endswith("_backup.webp"):
                continue
            try:
                with Image.open(path) as opened:
                    width, height = opened.size
            except Exception:
                continue
            chosen = select_spec(path, width, height, spec_records)
            spec = overrides.get(path.name)
            if spec is None and chosen:
                spec = (
                    int(chosen["frameWidth"]),
                    int(chosen["frameHeight"]),
                    int(chosen.get("columns", max(1, width // int(chosen["frameWidth"])))),
                    int(chosen.get("frameCount", int(chosen.get("columns", 1)) * int(chosen.get("rows", 1)))),
                )
            value = metric_for(path, spec)
            if value:
                key = "./" + path.relative_to(ROOT).as_posix()
                metrics[key] = value
    report = ROOT / "dist" / "source-frame-metrics.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    output = ROOT / "src" / "js" / "09_visual_calibration.js"
    heights = {key: value["h"] for key, value in metrics.items()}
    payload = json.dumps(heights, ensure_ascii=False, separators=(",", ":"))
    output.write_text(
        '"use strict";\n\n'
        "/* Median silhouette heights only. Frame positions are baked into textures offline. */\n"
        f"const S7_VISUAL_HEIGHTS = Object.freeze({payload});\n\n"
        "function s7VisualHeightForMeta(meta) {\n"
        "  const src=String(meta?.src||'').split('?')[0];\n"
        "  return finiteNumber(S7_VISUAL_HEIGHTS[src] ?? S7_VISUAL_HEIGHTS[src.startsWith('./')?src:'./'+src],0);\n"
        "}\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bobsled-master", type=Path, required=True)
    args = parser.parse_args()
    if not args.bobsled_master.is_file():
        raise SystemExit(f"missing bobsled master: {args.bobsled_master}")
    repair_giants()
    clean_other_final_runtime()
    repair_ladders()
    repair_bobsled_members()
    build_bobsled_sled(args.bobsled_master)
    repair_marigold_blank()
    build_visual_metrics()
    print("visual texture repair complete")


if __name__ == "__main__":
    main()
