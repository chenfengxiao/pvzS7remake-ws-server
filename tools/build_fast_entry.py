#!/usr/bin/env python3
"""Build a feature-complete fast HTML entry with external assets.

All CSS and JavaScript are inlined, but image/audio files remain in assets/ and
are loaded lazily by the runtime. This avoids the 100MB+ base64 DOM cost of the
fully embedded compatibility build while keeping timeline rendering and every
mechanic enabled.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/S7_FAST_ENTRY.html'


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def build() -> None:
    html = read_text(ROOT / 'index.html')
    # The generated entry lives in dist/, while assets remain at the project root.
    html = html.replace('<head>', '<head>\n<base href="../">', 1)

    css_pattern = re.compile(r'<link[^>]*\b(?:href|rel)=["\'][^"\']*["\'][^>]*/?>', re.I)
    def replace_css(match: re.Match[str]) -> str:
        tag = match.group(0)
        if 'stylesheet' not in tag.lower():
            return tag
        href_match = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
        if not href_match:
            return tag
        href = href_match.group(1).removeprefix('./')
        return f'<style>\n{read_text(ROOT / href)}\n</style>'
    html = css_pattern.sub(replace_css, html)

    script_pattern = re.compile(r'<script[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>', re.I)
    def replace_script(match: re.Match[str]) -> str:
        src = match.group(1).removeprefix('./')
        if src == 'src/js/00_asset_paths.js':
            return ''
        js = read_text(ROOT / src).replace('</script>', '<\\/script>')
        return f'<script>\n{js}\n</script>'
    html = script_pattern.sub(replace_script, html)

    resolver = '''<script>
(function(){
  window.s7ResolveEmbeddedAsset=function(path){return String(path||"");};
})();
</script>
'''
    first_script = html.find('<script>')
    if first_script < 0:
        raise RuntimeError('first inline script not found')
    html = html[:first_script] + resolver + html[first_script:]
    html = html.replace('<title>S丐版 1.0</title>', '<title>S丐版 1.0 高性能入口</title>')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('<!doctype html>\n' + html, encoding='utf-8')
    print(f'built {OUT} ({OUT.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    build()
