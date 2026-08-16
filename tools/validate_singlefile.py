#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ModuleNotFoundError:
    BeautifulSoup = None
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SINGLE = ROOT / 'dist/S7_REBUILT_SINGLEFILE.html'
if not SINGLE.exists():
    candidates = sorted((ROOT / 'dist').glob('S7_REBUILT_SINGLEFILE_v*.html'), key=lambda p: p.stat().st_mtime, reverse=True)
    if candidates:
        SINGLE = candidates[0]
BASELINE = ROOT / 'sources/BASELINE.json'
OUT = ROOT / 'dist/build-validation.json'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_info(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': sha256(data)}


class _ScriptNode:
    def __init__(self, attrs: dict[str, str], text: str) -> None:
        self.attrs = attrs
        self.text = text

    def get(self, key: str, default=None):
        return self.attrs.get(key, default)

    def get_text(self, strip: bool = False) -> str:
        return self.text.strip() if strip else self.text


class _ScriptSoupFallback:
    """Minimal script-tag reader used when optional BeautifulSoup is absent."""

    def __init__(self, html: str) -> None:
        import re
        self.nodes: list[_ScriptNode] = []
        for match in re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.IGNORECASE | re.DOTALL):
            attrs = {
                item.group(1).lower(): item.group(2)
                for item in re.finditer(r'([:\w-]+)=["\']([^"\']*)["\']', match.group(1))
            }
            self.nodes.append(_ScriptNode(attrs, match.group(2)))

    def select(self, _selector: str) -> list[_ScriptNode]:
        return [node for node in self.nodes if node.get('type') == 'application/octet-stream' and node.get('data-path')]

    def find_all(self, tag: str) -> list[_ScriptNode]:
        return self.nodes if tag == 'script' else []


def main() -> int:
    errors: list[str] = []
    if not SINGLE.exists():
        raise SystemExit(f'missing built single file: {SINGLE}')
    manifest = json.loads((ROOT / 'config/asset-manifest.json').read_text(encoding='utf-8'))
    expected = {'./' + item['path']: item for item in manifest['assets']}
    html = SINGLE.read_text(encoding='utf-8')
    # BeautifulSoup is disproportionately slow and memory-heavy on the 139 MB embedded build.
    # The validator only needs script tags, so use the purpose-built linear fallback for large files.
    use_bs4 = BeautifulSoup is not None and SINGLE.stat().st_size < 32 * 1024 * 1024
    soup = BeautifulSoup(html, 'html.parser') if use_bs4 else _ScriptSoupFallback(html)

    embedded = soup.select('script[type="application/octet-stream"][data-path]')
    seen: set[str] = set()
    decoded: dict[str, bytes] = {}
    for node in embedded:
        path = str(node.get('data-path') or '')
        if path in seen:
            errors.append(f'duplicate embedded asset: {path}')
            continue
        seen.add(path)
        try:
            data = base64.b64decode(node.get_text(strip=True), validate=True)
        except Exception as exc:
            errors.append(f'base64 decode failed: {path}: {exc}')
            continue
        decoded[path] = data
        item = expected.get(path)
        if not item:
            errors.append(f'unexpected embedded asset: {path}')
            continue
        if len(data) != item['bytes']:
            errors.append(f'embedded byte size mismatch: {path}')
        if sha256(data) != item['sha256']:
            errors.append(f'embedded hash mismatch: {path}')
    missing = sorted(set(expected) - seen)
    if missing:
        errors.append(f'missing embedded assets: {missing[:8]}')

    scripts = [node for node in soup.find_all('script') if not node.get('src') and node.get('type') != 'application/octet-stream']
    with tempfile.TemporaryDirectory(prefix='s7-single-check-') as temp_dir:
        temp = Path(temp_dir)
        for i, node in enumerate(scripts):
            path = temp / f'{i:02d}.js'
            path.write_text(node.get_text(), encoding='utf-8')
            result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(f'inline script {i} syntax error: {result.stderr.strip()}')

    bobsled_expected = {
        './assets/final_runtime/bobsled_walk.webp': ((2816, 1536), '742c0270ced7b36e99b14fd5f02b150bf69fabe5d480d102423446bb66f86fd0'),
        './assets/final_runtime/bobsled_attack.webp': ((2816, 1920), '73757cdad43e0de0069cfb9d600ef1733fa70224715d188de46903c22c3a5a90'),
        './assets/final_runtime/bobsled_death.webp': ((2816, 1536), '7e9944fd176b44d47ca296ea812ed2e23c50f0e1e5de8e24d8f9d01205e9af43'),
        './assets/final_runtime/bobsled_sled.webp': ((2304, 192), 'c770e67cb98032981993bf4cd30dde070f4fec660e0436fa91a836951ed7d2ec'),
    }
    bobsled_report: dict[str, object] = {}
    for path, (size, digest) in bobsled_expected.items():
        data = decoded.get(path)
        if data is None:
            errors.append(f'bobsled asset not embedded: {path}')
            continue
        if sha256(data) != digest:
            errors.append(f'bobsled embedded source mismatch: {path}')
        image_path = ROOT / path.removeprefix('./')
        with Image.open(image_path) as image:
            actual_size = image.size
        if actual_size != size:
            errors.append(f'bobsled dimensions mismatch: {path}: {actual_size}')
        bobsled_report[path] = {'bytes': len(data), 'sha256': sha256(data), 'size': actual_size}

    contract_tokens = [
        'const ZOMBIE_HIT_FLASH_DURATION = .12',
        'const ZOMBIE_HIT_FLASH_ALPHA = .5',
        'function s7MarkZombieHitFlash(',
        'ctx.globalAlpha = zombieSpriteBaseAlpha * ZOMBIE_HIT_FLASH_ALPHA',
        '"bobsled_walk":{file:"bobsled_walk.webp",frameWidth:352,frameHeight:384',
        'clipId:"zombie.final.bobsled_walk"',
        'clipId:"zombie.final.bobsled_attack"',
        'clipId:"zombie.final.bobsled_death"',
        'clipId:"zombie.final.bobsled_sled"',
    ]
    for token in contract_tokens:
        if token not in html:
            errors.append(f'built repair contract missing: {token}')

    for helper in ('finiteArray', 'finitePositive'):
        token = f'function {helper}('
        if html.count(token) != 1:
            errors.append(f'built modular bootstrap helper must appear exactly once: {helper}')
    if html.count('plantingSmokeTest()') != 1:
        errors.append('built planting runtime smoke test missing or duplicated')
    if 'const S7_USER_GRID_PLANT_MANIFEST = Object.freeze({' not in html:
        errors.append('built user-grid plant manifest missing')
    if html.count('const S7_SUNFLOWER_SHINE_TARGETS = new Set(') != 1:
        errors.append('built sunflower shine target registry missing or duplicated')
    if html.count('function s7SunflowerCanShinePlant(') != 1:
        errors.append('built sunflower shine target predicate missing or duplicated')
    if html.count('sunflowerTimegrassSmokeTest()') != 1:
        errors.append('built sunflower/timegrass runtime smoke test missing or duplicated')
    if '"firelotus", "spikerock", "cactus", "timegrass"' not in html:
        errors.append('built sunflower shine target registry excludes timegrass')
    if 'if (s7SunflowerCanShinePlant(target)) {' not in html:
        errors.append('built side-sun resolution bypasses the unified shine predicate')

    blind_visual_token = "blind:{head:'imitater_head.webp',scale:.00305,x:-.035,y:-.335}"
    if html.count(blind_visual_token) != 1:
        errors.append('built blind-box imitater-head-only config missing or duplicated')
    if 'cone:true' in html[html.find("blind:{head:'imitater_head.webp'"):html.find("blind:{head:'imitater_head.webp'") + 160]:
        errors.append('built blind-box cone-hat visual layer returned')
    if 'armors: [armor("盲盒路障", armorHp, 1, false)]' not in html:
        errors.append('built blind-box mechanical armor contract missing')
    if 'emoji: opt.emoji || "🎁"' not in html or '🎁🚧' in html:
        errors.append('built blind-box fallback icon still contains a roadblock')

    size_contract_tokens = [
        'const S7_ENTITY_VISUAL_SCALE = {',
        'const S7_TIMELINE_ZOMBIE_SIZE_TIERS = Object.freeze({',
        'giantCharged: 1',
        'giantNormal: 2',
        'giantHuge: 3',
        'normal:1.2,flag:1.2,ducky:1.2,snorkel:1.2,bobsled:.6,bobsledSled:1.125',
        'balloon:1,wallz:1,tallz:1,zomboni:1.8,yeti:1,catapult:1.5,bungee:1,garg:1,giga:1',
        'function s7TimelineZombieSizeTier(',
        'function s7ZombieFallbackGlyphScale(',
        'function s7TimelineZombieSizeSmokeTest() {',
        'ctx.font = `${layout.cell*zombieGlyphScale}px serif`',
    ]
    for token in size_contract_tokens:
        if token not in html:
            errors.append(f'built timeline zombie size contract missing: {token}')
    if html.count('m *= s7TimelineZombieSizeTier(entity);') != 1:
        errors.append('built timeline size multiplier application count changed')
    if html.count('timelineZombieSizeSmokeTest() {') != 1:
        errors.append('built timeline zombie size smoke test public method missing or duplicated')
    for token in ('S7_VISUAL_FRAME_METRICS','s7VisualMetricsForMeta','S7_ENTITY_VISUAL_ANCHORS',
                  's7EntityVisualAnchor','groupDx','groupDy','stableState=','frameDx','frameDy'):
        if token in html:
            errors.append(f'built runtime frame-position compensation returned: {token}')
    for token in ('const S7_VISUAL_HEIGHTS = Object.freeze(', 'function s7VisualHeightForMeta(',
                  'return {state:"grave.red",clipId:"zombie.b04r.normal.move"};',
                  "ctx.filter = 'sepia(.45) saturate(2.1) hue-rotate(55deg) brightness(1.02)';"):
        if html.count(token) != 1:
            errors.append(f'built frame-local visual contract missing or duplicated: {token}')
    if 'timelineZombieSpriteDrawn && z.s7?.variant' in html:
        errors.append('built rectangular green variant curtain returned')

    latest_contract_tokens = [
        'function s7NormalizeGroundedBalloon(',
        'z.dir = z.friendly ? 1 : -1',
        'onlyFlyingBalloon: balloonMode',
        'groundOnly: !balloonMode',
        'S7_VIDEO_SKILL_CLIPS.cactusNormal',
        "file:'26_cactus_normal.png'",
        'preferFlyingBalloon: true',
        'const S7_CATTAIL_TURRET_PROJECTILE_SPEED = 3',
        'homingSpeed: S7_CATTAIL_TURRET_PROJECTILE_SPEED',
        'cellsPerFrame:S7_CATTAIL_TURRET_PROJECTILE_SPEED*S7_ANIMATION_FIXED_DT',
        'cattailTurretSpeedSmokeTest() {',
        'balloonGroundMotionSmokeTest() {',
        'cactusBalloonModeSmokeTest() {',
        'cattailPrioritySmokeTest() {',
    ]
    for token in latest_contract_tokens:
        if token not in html:
            errors.append(f'built balloon/cactus/cattail contract missing: {token}')
    if html.count('"sunflower":"sunflower"') != 0:
        errors.append('built timeline sunflower video-skill mapping returned')
    if 'p?.key === "sunflower"' not in html or 'S7_B03C_DEFAULT_CLIPS.sunflower' not in html:
        errors.append('built timeline sunflower legacy animation resolver missing')

    report = {
        'ok': not errors,
        'sourceSingleFile': json.loads(BASELINE.read_text(encoding='utf-8')),
        'rebuiltSingleFile': file_info(SINGLE),
        'embeddedAssetCount': len(embedded),
        'embeddedAssetHashErrors': sum('embedded hash mismatch' in e for e in errors),
        'classicScriptCount': len(scripts),
        'classicScriptSyntax': 'PASS' if not any('syntax error' in e for e in errors) else 'FAIL',
        'bobsledAssets': bobsled_report,
        'repairContract': {
            'hitDurationSeconds': 0.12,
            'hitAlpha': 0.5,
            'frameGeometry': '352x384 members; all original frame counts retained; 384x192 six-frame complete sled',
            'blindBoxVisual': 'imitater-head-only',
            'blindBoxMechanicalArmor': 'preserved',
            'modularPlantingDependency': 'bootstrap guards loaded before animation registration',
            'plantingSmokeTest': 'embedded',
            'sunflowerTimegrass': 'side sun grants 4s shine; cooldown interval divided by 1.3',
            'timelineZombieSizes': {'chargedGiant': '1x ordinary', 'normalGiant': '2x ordinary', 'hugeGiant': '3x ordinary', 'zomboni': 'current baseline 1.8x', 'catapult': 'kept at 1.5x', 'bobsledMember': 'current baseline 0.6x', 'bobsledSled': 'current baseline 1.125x', 'scope': 'timeline render only'},
            'groundedVariantBalloon': 'walks forward after landing; bites only when a blocking plant is reached',
            'sunflowerTimelineVisual': 'legacy JSPVZ idle animation; video skill effect removed',
            'cactusModes': 'airborne balloon only + raised animation; otherwise ground only + extracted normal attack animation',
            'cattailTurretSpeed': '3 cells/s = 0.12 cell per 40ms frame',
            'cattailPriority': 'currently airborne balloon zombies first; grounded balloons are ordinary targets',
        },
        'errors': errors,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
