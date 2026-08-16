#!/usr/bin/env python3
"""Build a slim standalone HTML: no embedded image/audio assets, emoji-only rendering.

Optimizations:
  - Uses raw string manipulation instead of BeautifulSoup (much faster)
  - Minimal memory footprint (no 100MB+ base64 blobs)

Usage:
    python3 tools/build_slim_singlefile.py

Output:
    dist/S7_SLIM_SINGLEFILE.html
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/S7_SLIM_SINGLEFILE.html'


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def build() -> None:
    html = read_text(ROOT / 'index.html')

    # 1. Inline CSS
    css_pattern = re.compile(
        r'<link[^>]*\b(?:href|rel)=["\'][^"\']*["\'][^>]*/?>',
        re.IGNORECASE
    )

    def replace_css(m):
        tag = m.group(0)
        if 'stylesheet' not in tag.lower():
            return tag
        href_match = re.search(r'href=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if not href_match:
            return tag
        href = href_match.group(1).removeprefix('./')
        css = read_text(ROOT / href)
        return f'<style>\n{css}\n</style>'

    html = css_pattern.sub(replace_css, html)

    # 2. Inline scripts (skip dev resolver, force LEGACY mode)
    script_pattern = re.compile(
        r'<script[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>',
        re.IGNORECASE
    )

    def replace_script(m):
        src = m.group(1).removeprefix('./')
        if src == 'src/js/00_asset_paths.js':
            return ''
        js = read_text(ROOT / src)
        # Force LEGACY (emoji-only) render mode
        js = js.replace(
            'return S7_ANIMATION_RENDER_MODES.TIMELINE',
            'return S7_ANIMATION_RENDER_MODES.LEGACY'
        )
        return f'<script>\n{js}\n</script>'

    html = script_pattern.sub(replace_script, html)

    # 3. Inject no-op asset resolver
    resolver_js = (
        '(function(){\n'
        '  window.s7ResolveEmbeddedAsset=function(path){return "";};\n'
        '})();'
    )
    resolver_block = f'<script>\n{resolver_js}\n</script>'

    # 4. Insert resolver before the first inline <script>
    first_inline = re.search(r'<script>(?!\s*</script>)', html)
    if not first_inline:
        raise RuntimeError('first inline <script> not found')

    insert_point = first_inline.start()
    html = html[:insert_point] + resolver_block + '\n' + html[insert_point:]

    # 5. Patch title
    html = html.replace('S7 v10.9.21', 'S7 v10.9.21 瘦身版')

    # 6. Write output
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('<!doctype html>\n' + html, encoding='utf-8')
    size_kb = OUT.stat().st_size / 1024
    print(f'built {OUT} ({size_kb:.0f} KB)')


if __name__ == '__main__':
    build()
