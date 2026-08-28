"""Cross-platform Chromium launcher for Playwright-based regression tests.

Resolution order:
1. Playwright's own browser resolution (used when its chromium is installed,
   e.g. after `playwright install chromium`).
2. PLAYWRIGHT_CHROMIUM_PATH environment variable override.
3. Platform-specific well-known browser paths (macOS / Linux).

Raises RuntimeError when no usable browser is found; a missing browser must
fail the test run, never silently pass.
"""
import os
import sys

_CANDIDATES_DARWIN = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    os.path.expanduser('~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
]
_CANDIDATES_LINUX = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
]


def _candidate_paths():
    env_path = os.environ.get('PLAYWRIGHT_CHROMIUM_PATH')
    if env_path:
        yield env_path
    platform_candidates = _CANDIDATES_DARWIN if sys.platform == 'darwin' else _CANDIDATES_LINUX
    yield from platform_candidates


def launch_chromium(pw, **kwargs):
    playwright_exe = pw.chromium.executable_path
    if os.path.exists(playwright_exe):
        return pw.chromium.launch(**kwargs)
    attempted = []
    for path in _candidate_paths():
        if path in attempted or not os.path.isfile(path):
            continue
        attempted.append(path)
        try:
            return pw.chromium.launch(executable_path=path, **kwargs)
        except Exception:
            continue
    raise RuntimeError(
        'No usable Chromium/Chrome found. Playwright resolved %r (missing); '
        'tried: %s. Set PLAYWRIGHT_CHROMIUM_PATH or run `playwright install chromium`.'
        % (playwright_exe, attempted or ['<none>'])
    )


_TEST_ORIGIN_URL = 'https://s7-test.local/__standalone__'


def open_standalone_page(page, html, wait_until='domcontentloaded', timeout=120000):
    """Load standalone HTML from a real https origin and wait for it.

    page.set_content() targets about:blank, whose opaque origin makes modern
    Chromium deny localStorage; routing a fixed fake URL gives the document a
    normal origin so game boot code behaves like production.
    """
    page.route(_TEST_ORIGIN_URL, lambda route: route.fulfill(content_type='text/html', body=html))
    page.goto(_TEST_ORIGIN_URL, wait_until=wait_until, timeout=timeout)
