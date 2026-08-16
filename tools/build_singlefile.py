#!/usr/bin/env python3
"""Build a standalone single-file HTML with all assets inlined as base64.

Optimizations over the original build_singlefile.py:
  - Uses raw string manipulation instead of BeautifulSoup (10-50x faster)
  - Reads all asset files in parallel with ThreadPoolExecutor
  - Pre-computes base64 strings before assembling the final HTML
  - Avoids re-parsing HTML tree for each injected node

Usage:
    python3 tools/build_singlefile.py

Output:
    dist/S7_REBUILT_SINGLEFILE_v<version>.html
"""
from __future__ import annotations

import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _detect_version(html: str) -> str:
    """从 index.html <title> 中提取版本号，兜底读取 GAME_VERSION。"""
    m = re.search(r'<title>[^<]*?([\d]+\.[\d]+\.[\d]+(?:[.-][\w]+)?)</title>', html)
    if m:
        return m.group(1)
    # 兜底：在 inline script 中找 GAME_VERSION
    m2 = re.search(r'GAME_VERSION\s*=\s*["\']([^"\']+)["\']', html)
    if m2:
        return m2.group(1)
    return "unknown"


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def read_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode('ascii')


def build() -> None:
    html = read_text(ROOT / 'index.html')
    ver = _detect_version(html)
    out_name = f'S7_REBUILT_SINGLEFILE_v{ver}.html'
    OUT = ROOT / 'dist' / out_name

    # 1. Inline CSS: find all <link rel="stylesheet" href="..."> and replace with <style>
    import re
    css_pattern = re.compile(
        r'<link[^>]*\b(?:href|rel)=["\'][^"\']*["\'][^>]*/?>',
        re.IGNORECASE
    )

    def replace_css(m):
        tag = m.group(0)
        if 'stylesheet' not in tag.lower():
            return tag  # Not a stylesheet link
        href_match = re.search(r'href=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if not href_match:
            return tag
        href = href_match.group(1).removeprefix('./')
        css = read_text(ROOT / href)
        return f'<style>\n{css}\n</style>'

    html = css_pattern.sub(replace_css, html)

    # 2. Inline scripts: find all <script src="..."> and replace with inline
    #    Skip the dev asset-path resolver
    script_pattern = re.compile(
        r'<script[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>',
        re.IGNORECASE
    )

    def replace_script(m):
        src = m.group(1).removeprefix('./')
        if src == 'src/js/00_asset_paths.js':
            return ''  # Remove dev resolver
        js = read_text(ROOT / src)
        return f'<script>\n{js}\n</script>'

    html = script_pattern.sub(replace_script, html)

    # 3. Load asset manifest and read all assets in parallel
    manifest = json.loads(read_text(ROOT / 'config/asset-manifest.json'))
    assets = manifest['assets']

    with ThreadPoolExecutor(max_workers=8) as executor:
        b64_results = list(executor.map(
            lambda a: (a, read_b64(ROOT / a['path'])),
            assets
        ))

    # 4. Build the embedded asset block and resolver
    asset_blocks = []
    for index, (item, b64_data) in enumerate(b64_results):
        path = './' + item['path']
        mime = item['mime']
        asset_blocks.append(
            f'<script type="application/octet-stream" id="s7a{index}" '
            f'data-path="{path}" data-mime="{mime}">{b64_data}</script>'
        )

    resolver_js = (
        '(function(){\n'
        '  var nodes=new Map();\n'
        '  document.querySelectorAll(\'script[type="application/octet-stream"][data-path]\')'
        '.forEach(function(el){nodes.set(el.dataset.path,el);});\n'
        '  var cache=new Map();\n'
        '  window.s7ResolveEmbeddedAsset=function(path){\n'
        '    var key=String(path||"");\n'
        '    if(!key||key.startsWith("data:")||key.startsWith("blob:"))return key;\n'
        '    if(cache.has(key))return cache.get(key);\n'
        '    var el=nodes.get(key);\n'
        '    if(!el)return key;\n'
        '    var uri="data:"+(el.dataset.mime||"application/octet-stream")+";base64,"+el.textContent.trim();\n'
        '    cache.set(key,uri);\n'
        '    return uri;\n'
        '  };\n'
        '})();'
    )

    resolver_block = f'<script>\n{resolver_js}\n</script>'

    # 5. Insert assets + resolver before the first inline <script>
    #    Find the first <script> that doesn't have src= (inline script)
    first_inline = re.search(r'<script>(?!\s*</script>)', html)
    if not first_inline:
        raise RuntimeError('first inline <script> not found')

    insert_point = first_inline.start()
    all_assets = '\n'.join(asset_blocks) + '\n' + resolver_block + '\n'
    html = html[:insert_point] + all_assets + html[insert_point:]

    # 6. Write output
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('<!doctype html>\n' + html, encoding='utf-8')
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f'built {OUT} ({size_mb:.1f} MB, {len(assets)} assets)')


if __name__ == '__main__':
    build()
