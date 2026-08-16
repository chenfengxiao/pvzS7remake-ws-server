#!/usr/bin/env python3
"""Simplified validation: skip PIL image dimension checks."""
import base64, hashlib, json, subprocess, tempfile
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SINGLE = ROOT / 'dist/S7_REBUILT_SINGLEFILE.html'
BASELINE = ROOT / 'sources/BASELINE.json'
OUT = ROOT / 'dist/build-validation-noPIL.json'

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def file_info(path: Path) -> dict:
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': sha256(data)}

errors = []
manifest = json.loads((ROOT / 'config/asset-manifest.json').read_text(encoding='utf-8'))
expected = {'./' + item['path']: item for item in manifest['assets']}
html = SINGLE.read_text(encoding='utf-8')
soup = BeautifulSoup(html, 'html.parser')

# 1. Verify embedded assets
embedded = soup.select('script[type="application/octet-stream"][data-path]')
seen = set()
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

# 2. Script syntax check via node
scripts = [node for node in soup.find_all('script') if not node.get('src') and node.get('type') != 'application/octet-stream']
syntax_pass = 0
syntax_fail = 0
with tempfile.TemporaryDirectory(prefix='s7-check-') as temp_dir:
    temp = Path(temp_dir)
    for i, node in enumerate(scripts):
        path = temp / f'{i:02d}.js'
        path.write_text(node.get_text(), encoding='utf-8')
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
        if result.returncode:
            errors.append(f'inline script {i} syntax error: {result.stderr.strip()[:200]}')
            syntax_fail += 1
        else:
            syntax_pass += 1

# 3. Contract token checks
contract_tokens = [
    'const ZOMBIE_HIT_FLASH_DURATION = .12',
    'const ZOMBIE_HIT_FLASH_ALPHA = .5',
    'function s7MarkZombieHitFlash(',
    'function finiteArray(',
    'function finitePositive(',
    'plantingSmokeTest()',
    'const S7_SUNFLOWER_SHINE_TARGETS = new Set(',
    'function s7SunflowerCanShinePlant(',
    'sunflowerTimegrassSmokeTest()',
    'function s7NormalizeGroundedBalloon(',
    'const S7_CATTAIL_TURRET_PROJECTILE_SPEED = 3',
    'cattailTurretSpeedSmokeTest()',
    'balloonGroundMotionSmokeTest()',
    'cactusBalloonModeSmokeTest()',
    'cattailPrioritySmokeTest()',
    "file:'26_cactus_normal.png'",
    'homingSpeed: S7_CATTAIL_TURRET_PROJECTILE_SPEED',
    'cellsPerFrame:S7_CATTAIL_TURRET_PROJECTILE_SPEED*S7_ANIMATION_FIXED_DT',
]
for token in contract_tokens:
    if token not in html:
        errors.append(f'contract token missing: {token}')

report = {
    'ok': not errors,
    'rebuiltSingleFile': file_info(SINGLE),
    'embeddedAssetCount': len(embedded),
    'expectedAssetCount': len(expected),
    'missingAssets': len(missing),
    'hashErrors': sum('hash mismatch' in e for e in errors),
    'classicScriptCount': len(scripts),
    'scriptSyntaxPass': syntax_pass,
    'scriptSyntaxFail': syntax_fail,
    'errors': errors[:30],
}
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'errors'}, ensure_ascii=False, indent=2))
if errors:
    print(f'\nERRORS ({len(errors)}):')
    for e in errors[:20]:
        print(f'  - {e}')
else:
    print('\n✅ ALL CHECKS PASSED')
