#!/usr/bin/env python3
"""Serve a directory with no caching (and the right wasm MIME type). Usage: serve.py <dir> [port]"""

import functools
import http.server
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # editors fetch many files at once (lazy factory folders), 5 drops connections


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    directory = sys.argv[1] if len(sys.argv) > 1 else "."
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8123
    server = Server(("127.0.0.1", port), functools.partial(Handler, directory=directory))
    print(f"http://127.0.0.1:{port}/")
    server.serve_forever()
