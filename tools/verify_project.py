#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNINGS: list[str] = []

BOBSLED_ASSETS = {
    'assets/final_runtime/bobsled_walk.webp': {
        'sha256': '742c0270ced7b36e99b14fd5f02b150bf69fabe5d480d102423446bb66f86fd0',
        'bytes': 1078592,
        'size': (2816, 1536),
    },
    'assets/final_runtime/bobsled_attack.webp': {
        'sha256': '73757cdad43e0de0069cfb9d600ef1733fa70224715d188de46903c22c3a5a90',
        'bytes': 1197354,
        'size': (2816, 1920),
    },
    'assets/final_runtime/bobsled_death.webp': {
        'sha256': '7e9944fd176b44d47ca296ea812ed2e23c50f0e1e5de8e24d8f9d01205e9af43',
        'bytes': 997220,
        'size': (2816, 1536),
    },
    'assets/final_runtime/bobsled_sled.webp': {
        'sha256': 'c770e67cb98032981993bf4cd30dde070f4fec660e0436fa91a836951ed7d2ec',
        'bytes': 329564,
        'size': (2304, 192),
    },
}


def check_js(path: Path) -> None:
    result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
    if result.returncode:
        ERRORS.append(f'JS syntax: {path.relative_to(ROOT)}: {result.stderr.strip()}')


def main() -> int:
    asset_manifest = json.loads((ROOT / 'config/asset-manifest.json').read_text(encoding='utf-8'))
    script_order = json.loads((ROOT / 'config/script-order.json').read_text(encoding='utf-8'))
    index = (ROOT / 'index.html').read_text(encoding='utf-8')

    seen_paths: set[str] = set()
    image_count = 0
    audio_count = 0
    for item in asset_manifest['assets']:
        rel = item['path']
        if rel in seen_paths:
            ERRORS.append(f'duplicate asset manifest path: {rel}')
        seen_paths.add(rel)
        path = ROOT / rel
        if not path.exists():
            ERRORS.append(f'missing asset: {rel}')
            continue
        data = path.read_bytes()
        if not data:
            ERRORS.append(f'empty asset: {rel}')
        digest = hashlib.sha256(data).hexdigest()
        if digest != item['sha256']:
            ERRORS.append(f'asset hash changed: {rel}; run update_asset_manifest.py if intentional')
        mime = item.get('mime', '')
        if mime.startswith('image/'):
            image_count += 1
            try:
                with Image.open(path) as image:
                    actual_size = image.size
                    image.verify()
                expected = BOBSLED_ASSETS.get(rel)
                if expected and actual_size != expected['size']:
                    ERRORS.append(f'bobsled dimensions changed: {rel}: {actual_size} != {expected["size"]}')
            except Exception as exc:
                ERRORS.append(f'image decode failed: {rel}: {exc}')
        elif mime.startswith('audio/'):
            audio_count += 1

    scripts = script_order['scripts']
    index_positions = []
    for item in scripts:
        path = ROOT / item['file']
        if not path.exists():
            ERRORS.append(f'missing script: {item["file"]}')
            continue
        check_js(path)
        marker = './' + item['file']
        pos = index.find(marker)
        if pos < 0:
            ERRORS.append(f'script not referenced by index: {item["file"]}')
        index_positions.append(pos)
    if index_positions != sorted(index_positions):
        ERRORS.append('index script order differs from config/script-order.json')

    css_path = ROOT / 'src/styles/main.css'
    if not css_path.exists() or './src/styles/main.css' not in index:
        ERRORS.append('main stylesheet missing or not referenced')

    # Static architecture guards.
    joined = '\n'.join((ROOT / item['file']).read_text(encoding='utf-8') for item in scripts if (ROOT / item['file']).exists())
    if 'zombie.b05h' in joined:
        ERRORS.append('legacy zombie.b05h reference returned')
    if joined.count('onearm') > 1:
        WARNINGS.append('multiple onearm tokens exist; verify legacy arm-loss code is not active')
    if joined.count('function s7PlantReleaseSocket(') != 1:
        ERRORS.append('s7PlantReleaseSocket must have exactly one definition')
    if joined.count('function s7DrawB06Projectile(') != 1:
        ERRORS.append('s7DrawB06Projectile must have exactly one definition')
    if 'S7_ANIM.setState("bullet"' in joined or "S7_ANIM.setState('bullet'" in joined:
        ERRORS.append('generic bullet animation runtime/self-spin returned')

    # Performance regression guards. These are structural, not gameplay shortcuts.
    if 'S7_SPRITES.preloadAll();' in joined:
        ERRORS.append('eager all-sprite boot preload returned')
    if 'function s7RedrawWhenReady' in joined:
        ERRORS.append('permanent all-image requestAnimationFrame poll returned')
    for token in ('FULL_CLEANUP_INTERVAL_FRAMES: 8', 'MAX_UNCHANGED_RENDER_GAP_MS: 120',
                  'function compactArrayInPlace(', 'S7_SPRITES.preloadClip(getClip(nextClipId));'):
        if joined.count(token) != 1:
            ERRORS.append(f'performance contract missing or duplicated: {token}')
    if joined.count('"balloon_walk":{file:"balloon_walk_new.webp",frameWidth:514,frameHeight:674,columns:5,frameCount:20') != 1:
        ERRORS.append('balloon walk sheet geometry must remain the real 5x4 / 20-frame layout')

    # Modular dependency contract: these helpers must be available before animation registration.
    bootstrap_text = (ROOT / 'src/js/00_bootstrap.js').read_text(encoding='utf-8')
    effects_text = (ROOT / 'src/js/13_projectiles_effects.js').read_text(encoding='utf-8')
    for helper in ('finiteArray', 'finitePositive'):
        token = f'function {helper}('
        if bootstrap_text.count(token) != 1:
            ERRORS.append(f'{helper} must be defined exactly once in 00_bootstrap.js')
        if token in effects_text:
            ERRORS.append(f'{helper} must not remain in the later projectile/effect module')
        if joined.count(token) != 1:
            ERRORS.append(f'{helper} must have exactly one project-wide definition')
    if joined.count('plantingSmokeTest()') != 1:
        ERRORS.append('planting runtime smoke test must appear exactly once')
    if 'S7_USER_GRID_PLANT_MANIFEST' not in joined:
        ERRORS.append('user-grid plant manifest missing')
    if joined.count('const S7_SUNFLOWER_SHINE_TARGETS = new Set(') != 1:
        ERRORS.append('sunflower shine target registry must have exactly one definition')
    if joined.count('function s7SunflowerCanShinePlant(') != 1:
        ERRORS.append('sunflower shine target predicate must have exactly one definition')
    if joined.count('sunflowerTimegrassSmokeTest()') != 1:
        ERRORS.append('sunflower/timegrass runtime smoke test must appear exactly once')
    if '"firelotus", "spikerock", "cactus", "timegrass"' not in joined:
        ERRORS.append('timegrass is missing from the sunflower shine target registry')
    if 'if (s7SunflowerCanShinePlant(target)) {' not in joined:
        ERRORS.append('sunflower side-sun resolution no longer uses the unified shine target predicate')

    # Timeline-only visual size contract. Gameplay geometry remains untouched.
    size_contracts = {
        'const S7_ENTITY_VISUAL_SCALE = {': 'single final visual scale registry',
        'const S7_TIMELINE_ZOMBIE_SIZE_TIERS = Object.freeze({': 'timeline zombie size tier registry',
        'giantCharged: 1': 'charged giant 1x tier',
        'giantNormal: 2': 'normal giant 2x tier',
        'giantHuge: 3': 'huge giant 3x tier',
        'normal:1.2,flag:1.2,ducky:1.2,snorkel:1.2,bobsled:.6,bobsledSled:1.125': 'ordinary and bobsled scales',
        'balloon:1,wallz:1,tallz:1,zomboni:1.8,yeti:1,catapult:1.5,bungee:1,garg:1,giga:1': 'kept and vehicle scales',
        'function s7TimelineZombieSizeTier(': 'timeline zombie size resolver',
        'function s7ZombieFallbackGlyphScale(': 'timeline fallback glyph size resolver',
        'function s7TimelineZombieSizeSmokeTest() {': 'timeline zombie size smoke test helper',
    }
    for token, label in size_contracts.items():
        if joined.count(token) != 1:
            ERRORS.append(f'{label} must appear exactly once')
    if joined.count('m *= s7TimelineZombieSizeTier(entity);') != 1:
        ERRORS.append('timeline giant tier multiplier must be applied exactly once')
    if joined.count('timelineZombieSizeSmokeTest() {') != 1:
        ERRORS.append('timeline zombie size smoke test public method must appear exactly once')
    if "ctx.font = `${layout.cell*zombieGlyphScale}px serif`" not in joined:
        ERRORS.append('zombie timeline fallback renderer no longer uses the unified glyph scale')
    if "if (renderMode === S7_ANIMATION_RENDER_MODES.TIMELINE)" not in joined:
        ERRORS.append('timeline-only fallback glyph sizing guard is missing')
    if 'Math.min(6, finiteNumber(m,1))' not in joined:
        ERRORS.append('visual scale clamp no longer permits the requested 3x giant tier')

    # Every playable plant keeps one explicit final scale, derived from the
    # preserved pre-request baseline and the user's named multiplier groups.
    config_text = (ROOT / 'src/js/20_config_rules.js').read_text(encoding='utf-8')
    order_match = re.search(r'const PLANT_ORDER = \[(.*?)\];', config_text, re.S)
    plant_keys = re.findall(r'"([A-Za-z0-9_]+)"', order_match.group(1)) if order_match else []
    calibration_path = ROOT / 'tools/plant_visual_calibration.json'
    baseline_path = ROOT / 'tools/plant_visual_size_baseline.json'
    if not plant_keys:
        ERRORS.append('unable to parse playable plant order for visual calibration coverage')
    if not calibration_path.exists() or not baseline_path.exists():
        ERRORS.append('plant visual calibration/baseline data missing')
    else:
        calibration = json.loads(calibration_path.read_text(encoding='utf-8'))
        baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
        missing = sorted(set(plant_keys) - set(calibration))
        extra = sorted(set(calibration) - set(plant_keys))
        if missing:
            ERRORS.append(f'plants missing ghost-relative visual calibration: {missing}')
        if extra:
            ERRORS.append(f'non-playable keys in plant visual calibration: {extra}')
        if set(baseline) != set(calibration):
            ERRORS.append('plant visual baseline and final calibration keys differ')
        keep = {'explodenut','cattail','firelotus','ghost','sniper','kelp','magnet','kernel','umbrella','marigold','timegrass','potato'}
        slight = {'melon','winter'}
        triple = {'squash','seashroom'}
        for key, base in baseline.items():
            factor = 1 if key in keep else 1.1 if key in slight else 3 if key in triple else 2
            if abs(float(calibration.get(key, 0)) - float(base) * factor) > 1e-9:
                ERRORS.append(f'plant final scale violates requested group: {key}')
    zombie_calibration = json.loads((ROOT / 'tools/zombie_visual_calibration.json').read_text(encoding='utf-8'))
    expected_zombie = {
        'normal':2,'flag':2,'ducky':2,'snorkel':2,'bobsled':1,'bobsledSled':1.125,'imp':2,'backup':2,
        'peaz':1,'gatlingz':1,'squashz':1,'jalapenoz':1,'blind':1,'cone':2,'bucket':2,'newspaper':2,
        'screen':2,'football':2,'digger':2,'pogo':1,'pole':2,'jack':2,'ladder':1,'dolphin':2,'dancer':2,
        'balloon':1,'wallz':1,'tallz':1,'zomboni':4.5,'yeti':1,'catapult':1.5,'bungee':1,'garg':1,'giga':1,
        'immortal':2,'bombdoor':2,'blackolive':2,'polecmd':2,'warflag':2,'tacticflag':2,
    }
    if zombie_calibration != expected_zombie:
        ERRORS.append('zombie visual calibration differs from the requested size groups')
    if "const visualScale=s7VisualScaleMultiplier('plant',p,'body');" not in joined:
        ERRORS.append('user-grid plants no longer apply ghost-relative visual calibration')
    if "const layerOffsetScale=(kind==='plant'||kind==='zombie')?visualScale:1;" not in joined:
        ERRORS.append('layered entity component offsets no longer scale as one illustration')
    geometry_files = [ROOT / 'src/js/30_state_geometry.js', ROOT / 'src/js/51_damage_combat.js', ROOT / 'src/js/60_zombie_simulation.js']
    for geometry_file in geometry_files:
        geometry_text = geometry_file.read_text(encoding='utf-8')
        if 'S7_TIMELINE_ZOMBIE_SIZE_TIERS' in geometry_text or 's7TimelineZombieSizeTier' in geometry_text or 'frameDx' in geometry_text or 'frameDy' in geometry_text:
            ERRORS.append(f'timeline visual size leaked into gameplay geometry: {geometry_file.relative_to(ROOT)}')

    # Position is a source-art concern. Runtime frame/bbox anchoring and the old
    # rectangular variant curtain are forbidden.
    forbidden_runtime = ('S7_VISUAL_FRAME_METRICS','s7VisualMetricsForMeta','S7_ENTITY_VISUAL_ANCHORS',
                         's7EntityVisualAnchor','groupDx','groupDy','stableState=','frameDx','frameDy')
    for token in forbidden_runtime:
        if token in joined:
            ERRORS.append(f'runtime frame-position compensation returned: {token}')
    for token in ('const S7_VISUAL_HEIGHTS = Object.freeze(', 'function s7VisualHeightForMeta(',
                  'return {state:"grave.red",clipId:"zombie.b04r.normal.move"};',
                  "ctx.filter = 'sepia(.45) saturate(2.1) hue-rotate(55deg) brightness(1.02)';"):
        if joined.count(token) != 1:
            ERRORS.append(f'frame-local visual contract missing or duplicated: {token}')
    if 'timelineZombieSpriteDrawn && z.s7?.variant' in joined:
        ERRORS.append('rectangular green variant curtain returned')

    correction_path = ROOT / 'tools/frame_position_corrections.json'
    if not correction_path.exists():
        ERRORS.append('reviewed source-frame correction manifest missing')
    else:
        corrections = json.loads(correction_path.read_text(encoding='utf-8'))
        entries = corrections.get('assets', {})
        if sum(int(item.get('frameCount', 0)) for item in entries.values()) != 98:
            ERRORS.append('reviewed source-frame correction count must remain 98')
        for rel, item in entries.items():
            path = ROOT / rel
            if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != item.get('correctedSha256'):
                ERRORS.append(f'corrected source-frame hash mismatch: {rel}')

    # Repair-specific regression guards: exact time-space bobsled sheets and hit feedback contract.
    manifest_by_path = {item['path']: item for item in asset_manifest['assets']}
    for rel, expected in BOBSLED_ASSETS.items():
        item = manifest_by_path.get(rel)
        if not item:
            ERRORS.append(f'bobsled asset missing from manifest: {rel}')
            continue
        if item.get('sha256') != expected['sha256']:
            ERRORS.append(f'bobsled source hash mismatch: {rel}')
        if item.get('bytes') != expected['bytes']:
            ERRORS.append(f'bobsled source byte size mismatch: {rel}')

    required_once = {
        'const ZOMBIE_HIT_FLASH_DURATION = .12': '12cs zombie hit duration',
        'const ZOMBIE_HIT_FLASH_ALPHA = .5': '50% zombie hit alpha',
        'function s7MarkZombieHitFlash(': 'zombie hit marker helper',
        'function s7ZombieHitFlashActive(': 'zombie hit active helper',
        'function drawZombie(': 'zombie renderer',
        'hitFeedbackSmokeTest()': 'hit feedback smoke test',
    }
    for token, label in required_once.items():
        if joined.count(token) != 1:
            ERRORS.append(f'{label} must appear exactly once')
    if joined.count('hitFlashUntil: 0') != 2:
        ERRORS.append('hitFlashUntil must be initialized once for normal zombies and once for blind boxes')
    if 'ctx.globalAlpha = zombieSpriteBaseAlpha * ZOMBIE_HIT_FLASH_ALPHA' not in joined:
        ERRORS.append('zombie renderer no longer applies hit transparency to the body sprite')
    if 'ctx.globalAlpha = zombieSpriteBaseAlpha;' not in joined:
        ERRORS.append('zombie renderer no longer restores alpha before overlays')

    # Blind-box visual contract: keep the mechanical armor, but render only the imitater head.
    blind_visual_token = "blind:{head:'imitater_head.webp',scale:.00305,x:-.035,y:-.335}"
    if joined.count(blind_visual_token) != 1:
        ERRORS.append('blind-box imitater-head-only animation config must appear exactly once')
    if re.search(r"blind:\{head:'imitater_head\.webp'[^}]*cone\s*:\s*true", joined):
        ERRORS.append('blind-box cone-hat visual layer returned')
    if joined.count('armors: [armor("盲盒路障", armorHp, 1, false)]') != 1:
        ERRORS.append('blind-box mechanical armor contract changed')
    if joined.count('emoji: opt.emoji || "🎁"') != 1:
        ERRORS.append('blind-box fallback icon must exclude the roadblock symbol')
    if '🎁🚧' in joined:
        ERRORS.append('legacy blind-box roadblock fallback icon returned')

    bobsled_geometry = {
        'bobsled_walk': (352, 384, 32),
        'bobsled_attack': (352, 384, 36),
        'bobsled_death': (352, 384, 27),
    }
    for key, (width, height, frames) in bobsled_geometry.items():
        pattern = rf'"{key}":\{{file:"{key}\.webp",frameWidth:{width},frameHeight:{height},columns:8,frameCount:{frames},'
        if not re.search(pattern, joined):
            ERRORS.append(f'bobsled frame geometry/binding changed: {key}')
    binding_contracts = [
        'z?.type === "bobsled"',
        'clipId:"zombie.final.bobsled_attack"',
        'clipId:"zombie.final.bobsled_walk"',
        'clipId:"zombie.final.bobsled_death"',
        'z?.type === "bobsledSled"',
        'clipId:"zombie.final.bobsled_sled"',
    ]
    for token in binding_contracts:
        if token not in joined:
            ERRORS.append(f'bobsled animation binding missing: {token}')
    # Check bindings, not the generated all-asset calibration dictionary (whose
    # single JSON line legitimately contains both bobsled and jack filenames).
    binding_source = (ROOT / 'src/js/12_animation_zombies.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'src/js/13_projectiles_effects.js').read_text(encoding='utf-8')
    bobsled_lines = '\n'.join(line for line in binding_source.splitlines() if 'bobsled' in line.lower())
    if 'zombie.b05a.jack' in bobsled_lines or 'jack_' in bobsled_lines:
        ERRORS.append('bobsled binding is contaminated by Jack-in-the-box assets')

    report = {
        'ok': not ERRORS,
        'assets': len(asset_manifest['assets']),
        'images': image_count,
        'audio': audio_count,
        'scripts': len(scripts),
        'errors': ERRORS,
        'warnings': WARNINGS,
    }
    out = ROOT / 'dist/verify-report.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
