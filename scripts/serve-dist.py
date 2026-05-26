#!/usr/bin/env python3
"""
Local dev server for the merged `dist/` directory.

Mimics Cloudflare Pages behavior for pretty URLs:
- Paths under `/app/*` that don't resolve to a file (or directory index)
  fall back to `/app/index.html` so client-side routing works on refresh.
- Everything else uses standard static file resolution (landing page,
  /privacy.html, /terms.html, /licenses.html).

The server pins itself to the absolute `dist/` path (resolved relative to
this script's location), not the current working directory — so an
`rm -rf dist && rebuild` cycle elsewhere doesn't break it.
"""
import os
import sys
from http import server
from http.server import SimpleHTTPRequestHandler


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'dist'))


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Anchor to the absolute dist dir so a parallel `rm -rf dist`
        # (during rebuilds) can't yank our cwd out from under us.
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):  # noqa: N802 — http.server API name
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        fs_path = self.translate_path(path)
        # 1. Direct file hit → serve as usual.
        if os.path.isfile(fs_path):
            return super().do_GET()
        # 2. Directory with an index.html → serve as usual.
        if os.path.isdir(fs_path) and os.path.isfile(os.path.join(fs_path, 'index.html')):
            return super().do_GET()
        # 3. /app/<anything>.html attempt (Expo Router exports each route
        #    as `<route>.html`; an SPA client navigates with pretty URLs).
        if path.startswith('/app/') and not path.endswith('/'):
            html_candidate = self.translate_path(path + '.html')
            if os.path.isfile(html_candidate):
                self.path = path + '.html'
                return super().do_GET()
        # 4. SPA fallback for /app/ routes — but ONLY for pages, not assets.
        #    A request for /app/_expo/static/js/web/foo-<oldhash>.js (a
        #    cached chunk that no longer exists in the latest build) must
        #    return a real 404. Otherwise the browser receives the
        #    fallback HTML, tries to parse it as JS, and crashes with
        #    "Unexpected token '<'". Asset path heuristic: the last path
        #    segment contains a dot (e.g. `.js`, `.css`, `.wasm`,
        #    `.woff2`). Pretty URLs like `/app/library` have no dot.
        last_segment = path.rsplit('/', 1)[-1]
        looks_like_asset = '.' in last_segment
        if path.startswith('/app') and not looks_like_asset:
            fallback = self.translate_path('/app/index.html')
            if os.path.isfile(fallback):
                self.path = '/app/index.html'
                return super().do_GET()
        return super().do_GET()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    with server.ThreadingHTTPServer(('', port), SPAHandler) as httpd:
        print(f'Serving dist/ on http://localhost:{port}/')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
