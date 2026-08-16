#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

print('S7 development server: http://127.0.0.1:8000/index.html')
ThreadingHTTPServer(('127.0.0.1', 8000), NoCacheHandler).serve_forever()
