#!/usr/bin/env python3
"""Serve the public Dino Tycoon files locally for development."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
PUBLIC_DIRS = {"src", "styles", "vendor"}


class PublicHandler(SimpleHTTPRequestHandler):
    """Serve only the app entry point and its three public asset folders."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path: str) -> str:
        # Resolve after URL decoding and normalization, then enforce both an
        # allowlisted top-level path and containment (including symlinks).
        request_path = unquote(urlsplit(path).path)
        relative = Path(request_path.lstrip("/"))
        candidate = (ROOT / relative).resolve()
        try:
            inside_root = candidate.is_relative_to(ROOT)
        except AttributeError:  # Python < 3.9 compatibility
            inside_root = candidate == ROOT or ROOT in candidate.parents
        if not inside_root:
            return str(ROOT / "__forbidden__")
        if not relative.parts or relative == Path("."):
            return str(ROOT / "index.html")
        if candidate in {ROOT / "index.html", ROOT / "zoo.html"}:
            return str(candidate)
        resolved_relative = candidate.relative_to(ROOT)
        if resolved_relative.parts and resolved_relative.parts[0] in PUBLIC_DIRS and candidate.is_file():
            return str(candidate)
        return str(ROOT / "__forbidden__")

    def end_headers(self):
        # Development assets should reflect edits immediately.
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000)")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="listen on all network interfaces so a phone on your LAN can connect",
    )
    args = parser.parse_args()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = ThreadingHTTPServer((host, args.port), PublicHandler)
    print(f"Serving Dino Tycoon at http://{host}:{args.port}/ (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
