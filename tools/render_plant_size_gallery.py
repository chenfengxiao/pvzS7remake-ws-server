#!/usr/bin/env python3
"""Render every playable plant in a board-cell gallery for visual calibration.

This deliberately mirrors the runtime's native sprite-sheet crop, median-height
normalization and pivot.  It never recenters a frame.  It is a visual QA helper,
not a gameplay test: the output puts the real ghost mushroom silhouette behind
every plant so perceived occupied-cell size can be judged directly.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CELL = 240
# Leave enough spill room to match the real canvas, where a plant is not clipped
# to its own cell and may overlap the neighbouring row/column visually.
TILE_W = 900
TILE_H = 850
PIVOT = (TILE_W // 2, 560)

PLANT_ORDER = [
    "wallnut", "tallnut", "cactus", "explodenut", "chomper", "garlic", "spikerock", "snowpea",
    "repeater", "puff", "scaredy", "squash", "threepeater", "seashroom", "splitpea", "cabbage",
    "cattail", "firelotus", "reverseRepeater", "ghost", "sniper", "sunflower", "sunshroom", "hypno",
    "iceshroom", "kelp", "torchwood", "plantern", "blover", "magnet", "kernel", "umbrella", "marigold",
    "goldmagnet", "timegrass", "barley", "starfruit", "fume", "gloom", "potato", "melon", "gatling", "winter",
]


@dataclass(frozen=True)
class Spec:
    path: str
    frame_w: int
    frame_h: int
    columns: int
    frames: int
    pixel_scale: float = 0.0
    pivot_y: float = 0.72
    direct_scale: float = 0.0
    normalize: bool = True


def atlas(path: str, fw: int, fh: int, columns: int, frames: int, pixel_scale: float, pivot_y: float) -> Spec:
    return Spec(path, fw, fh, columns, frames, pixel_scale=pixel_scale, pivot_y=pivot_y)


def b03a(path: str, fw: int, fh: int, frames: int) -> Spec:
    return atlas(f"assets/plants_b03a/{path}.png", fw, fh, 8, frames, .92 / max(fw, fh), .70)


def b03b(path: str, fw: int, fh: int, frames: int, pivot_y: float = .72) -> Spec:
    return atlas(f"assets/plants_b03b/{path}.png", fw, fh, 8, frames, .94 / max(fw, fh), pivot_y)


def b03c(path: str, fw: int, fh: int, frames: int) -> Spec:
    return atlas(f"assets/plants_b03c/{path}.png", fw, fh, 8, frames, .94 / max(fw, fh), .72)


def dual(key: str, pixel_scale: float) -> Spec:
    return atlas(f"assets/plants_video_dual/{key}_idle.png", 640, 640, 5, 10, pixel_scale, .875)


def user_grid(key: str, scale: float) -> Spec:
    return Spec(f"assets/user_grid_plants/{key}_normalized.png", 256, 256, 4, 4,
                pivot_y=.80, direct_scale=scale, normalize=False)


SPECS = {
    "wallnut": b03a("wallnut", 65, 73, 16),
    "tallnut": b03a("tallnut", 83, 119, 14),
    "cactus": b03a("cactus", 86, 84, 11),
    "explodenut": atlas("assets/plants_b03b/explodenut_red.png", 65, 73, 8, 16, .92 / 73, .70),
    "chomper": b03c("chomper", 130, 114, 13),
    "garlic": b03c("garlic", 60, 59, 12),
    "spikerock": b03a("spikerock", 84, 43, 8),
    "snowpea": b03a("snowpea", 71, 71, 15),
    "repeater": b03a("repeater", 73, 71, 15),
    "puff": b03a("puff", 40, 66, 14),
    "scaredy": b03c("scaredy", 57, 81, 17),
    "squash": b03b("squash", 100, 226, 17),
    "threepeater": b03b("threepeater", 73, 80, 16),
    "seashroom": b03a("seashroom", 48, 99, 25),
    "splitpea": b03a("splitpea", 92, 72, 14),
    "cabbage": dual("cabbage", .003630508),
    "cattail": dual("cattail", .003517457),
    "firelotus": atlas("assets/custom_plants/firelotus_sprite.png", 352, 316, 1, 1, .0028, .82),
    "reverseRepeater": b03a("repeater", 73, 71, 15),
    "ghost": user_grid("ghost", 1.06),
    "sniper": user_grid("sniper", 1.10),
    "sunflower": b03c("sunflower", 73, 74, 18),
    "sunshroom": b03c("sunshroom", 59, 61, 10),
    "hypno": b03c("hypno", 68, 76, 15),
    "iceshroom": b03c("iceshroom", 83, 75, 11),
    "kelp": b03c("kelp", 90, 72, 1),
    "torchwood": b03c("torchwood", 73, 87, 9),
    "plantern": b03c("plantern", 86, 88, 19),
    "blover": b03b("blover", 118, 92, 30),
    "magnet": dual("magnet", .003066667),
    "umbrella": dual("umbrella", .020768834),
    "marigold": dual("marigold", .003562432),
    "goldmagnet": dual("goldmagnet", .003066667),
    "timegrass": user_grid("timegrass", 1.00),
    "barley": dual("barley", .003066667),
    "starfruit": b03a("starfruit", 77, 70, 13),
    "fume": b03a("fume", 100, 88, 16),
    "gloom": b03a("gloom", 95, 83, 12),
    "potato": b03a("potato", 75, 55, 8),
    "melon": dual("melon", .003456284),
    "gatling": b03b("gatling", 88, 84, 13),
    "winter": dual("winter", .003564478),
}


def frame_crop(spec: Spec, index: int) -> Image.Image:
    image = Image.open(ROOT / spec.path).convert("RGBA")
    x = (index % spec.columns) * spec.frame_w
    y = (index // spec.columns) * spec.frame_h
    return image.crop((x, y, x + spec.frame_w, y + spec.frame_h))


def alpha_stats(image: Image.Image) -> dict[str, float]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= 16 else 0)
    box = mask.getbbox()
    if not box:
        return {"left": 0, "top": 0, "right": 1, "bottom": 1, "w": 1, "h": 1, "cx": .5, "area": 1}
    left, top, right, bottom = box
    hist = mask.histogram()
    area = hist[255]
    return {
        "left": left, "top": top, "right": right, "bottom": bottom,
        "w": right - left, "h": bottom - top, "cx": (left + right) / 2,
        "area": area,
    }


def median_source_stats(spec: Spec) -> tuple[dict[str, float], int]:
    stats = [alpha_stats(frame_crop(spec, i)) for i in range(spec.frames)]
    median = {
        key: statistics.median(item[key] for item in stats)
        for key in ("w", "h", "cx", "bottom", "area")
    }
    # Show the frame whose silhouette is closest to the temporal median.
    index = min(range(len(stats)), key=lambda i: (
        abs(stats[i]["h"] - median["h"]) / max(1, median["h"]) +
        abs(stats[i]["w"] - median["w"]) / max(1, median["w"]) +
        abs(stats[i]["area"] - median["area"]) / max(1, median["area"])
    ))
    return median, index


def resize_rgba(image: Image.Image, scale: float) -> Image.Image:
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def paste_with_pivot(canvas: Image.Image, image: Image.Image, x: float, y: float,
                     pivot_x: float, pivot_y: float, rotation: float = 0.0) -> None:
    if rotation:
        image = image.rotate(-math.degrees(rotation), Image.Resampling.BICUBIC, expand=True)
        pivot_x = .5
        pivot_y = .5
    left = round(x - image.width * pivot_x)
    top = round(y - image.height * pivot_y)
    canvas.alpha_composite(image, (left, top))


def render_kernel(override: float) -> Image.Image:
    canvas = Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))
    layers = [
        ("assets/cornpult/Cornpult_husk4.png", -.22, .255, .0105, .5, .5, -.16, 1.05),
        ("assets/cornpult/Cornpult_arm_video_idle.png", -.01, -.285, .00445, .95, .89, 0, 1),
        ("assets/cornpult/Cornpult_kernal.png", -.61, -.58, .0105, .5, .5, 0, .78),
        ("assets/cornpult/Cornpult_body.png", .02, .035, .0102, .5, .5, 0, 1),
        ("assets/cornpult/Cornpult_husk1.png", -.18, .235, .0105, .5, .5, .15, 1),
        ("assets/cornpult/Cornpult_husk2.png", .18, .245, .0105, .5, .5, -.05, 1),
        ("assets/cornpult/Cornpult_husktip1.png", -.31, .30, .0108, .5, .5, .12, 1),
        ("assets/cornpult/Cornpult_eyebrow.png", .045, -.205, .0103, .5, .5, -.05, 1),
    ]
    for path, dx, dy, pixel_scale, px, py, rotation, layer_scale in layers:
        image = Image.open(ROOT / path).convert("RGBA")
        image = resize_rgba(image, pixel_scale * CELL * layer_scale * override)
        paste_with_pivot(canvas, image, PIVOT[0] + dx * CELL * override,
                         PIVOT[1] + dy * CELL * override, px, py, rotation)
    return canvas


def render_plant(key: str, override: float = 1.0) -> Image.Image:
    if key == "kernel":
        return render_kernel(override)
    spec = SPECS[key]
    median, frame_index = median_source_stats(spec)
    image = frame_crop(spec, frame_index)
    if spec.normalize:
        group_scale = max(.35, min(3.2, .72 / max(.001, median["h"] * spec.pixel_scale)))
        scale = spec.pixel_scale * CELL * group_scale * override
        image = resize_rgba(image, scale)
        canvas = Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))
        paste_with_pivot(canvas, image, PIVOT[0], PIVOT[1], .5, spec.pivot_y)
        return canvas
    image = resize_rgba(image, spec.direct_scale * CELL * override / spec.frame_w)
    canvas = Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))
    paste_with_pivot(canvas, image, PIVOT[0], PIVOT[1] - .015 * CELL, .5, spec.pivot_y)
    return canvas


def perceived_stats(image: Image.Image) -> dict[str, float]:
    stats = alpha_stats(image)
    bbox_area = max(1, stats["w"] * stats["h"])
    # Geometric mean of actual painted mass and occupied bounding rectangle.
    # It behaves linearly under scaling while tracking both visual weight and extent.
    perceived = (max(1, stats["area"]) * bbox_area) ** .25
    stats["perceived"] = perceived
    return stats


def load_overrides(path: Path | None) -> dict[str, float]:
    if not path:
        return {key: 1.0 for key in PLANT_ORDER}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {key: float(raw.get(key, 1.0)) for key in PLANT_ORDER}


def ghost_overlay() -> Image.Image:
    ghost = render_plant("ghost", 1.0)
    tinted = Image.new("RGBA", ghost.size, (172, 93, 255, 0))
    alpha = ghost.getchannel("A").point(lambda value: round(value * .18))
    tinted.putalpha(alpha)
    return tinted


def background_tile() -> Image.Image:
    tile = Image.new("RGBA", (TILE_W, TILE_H), (36, 97, 54, 255))
    draw = ImageDraw.Draw(tile)
    cell_left = PIVOT[0] - CELL // 2
    cell_top = PIVOT[1] - CELL // 2
    for y in range(cell_top, cell_top + CELL, 24):
        for x in range(cell_left, cell_left + CELL, 24):
            color = (61, 128, 68, 255) if ((x // 24 + y // 24) & 1) else (47, 113, 60, 255)
            draw.rectangle((x, y, x + 23, y + 23), fill=color)
    draw.rectangle((cell_left, cell_top, cell_left + CELL, cell_top + CELL), outline=(235, 238, 176, 130), width=2)
    draw.line((cell_left - 25, PIVOT[1], cell_left + CELL + 25, PIVOT[1]), fill=(255, 220, 92, 100), width=1)
    return tile


def build_galleries(output_dir: Path, overrides: dict[str, float]) -> dict[str, dict[str, float]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    ghost = ghost_overlay()
    reference = perceived_stats(render_plant("ghost", 1.0))["perceived"]
    metrics: dict[str, dict[str, float]] = {}
    font = ImageFont.load_default()
    columns, rows = 5, 3
    for sheet_index, start in enumerate(range(0, len(PLANT_ORDER), columns * rows), 1):
        sheet = Image.new("RGBA", (columns * TILE_W, rows * TILE_H), (10, 25, 18, 255))
        for offset, key in enumerate(PLANT_ORDER[start:start + columns * rows]):
            tile = background_tile()
            tile.alpha_composite(ghost)
            plant = render_plant(key, overrides[key])
            tile.alpha_composite(plant)
            stats = perceived_stats(plant)
            stats["ratio_to_ghost"] = stats["perceived"] / reference
            stats["override"] = overrides[key]
            metrics[key] = stats
            draw = ImageDraw.Draw(tile)
            label = f"{start + offset + 1:02d} {key}  {stats['ratio_to_ghost']:.2f}x"
            draw.rounded_rectangle((8, TILE_H - 35, TILE_W - 8, TILE_H - 8), radius=5, fill=(4, 13, 8, 220))
            draw.text((14, TILE_H - 27), label, font=font, fill=(245, 247, 220, 255))
            x = (offset % columns) * TILE_W
            y = (offset // columns) * TILE_H
            sheet.alpha_composite(tile, (x, y))
        sheet.convert("RGB").save(output_dir / f"plant-size-gallery-{sheet_index}.jpg", quality=94)
    (output_dir / "plant-size-metrics.json").write_text(
        json.dumps({"ghost_reference": reference, "plants": metrics}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metrics


def suggest_overrides(metrics: dict[str, dict[str, float]]) -> dict[str, float]:
    ghost = metrics["ghost"]["perceived"]
    result = {}
    for key in PLANT_ORDER:
        current = metrics[key]["perceived"]
        # Keep the exact ghost as 1.0 and avoid pathological values from effects.
        result[key] = round(max(.55, min(2.4, ghost / max(1, current))), 3)
    result["ghost"] = 1.0
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--overrides", type=Path)
    parser.add_argument("--write-suggestion", type=Path)
    args = parser.parse_args()
    overrides = load_overrides(args.overrides)
    metrics = build_galleries(args.output, overrides)
    if args.write_suggestion:
        args.write_suggestion.parent.mkdir(parents=True, exist_ok=True)
        args.write_suggestion.write_text(
            json.dumps(suggest_overrides(metrics), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
