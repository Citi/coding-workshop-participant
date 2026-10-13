"""
Lightweight local API server (no Docker / LocalStack needed).

Wraps the Lambda handler in a plain HTTP server on port 3001 so the React app
can run against a local PostgreSQL with one command:

    POSTGRES_HOST=localhost POSTGRES_PASS=postgres123 python3 backend/local_server.py

The official workshop flow (./bin/start-dev.sh with LocalStack) still works;
this is just a faster inner loop for development and demos.
"""

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent / "tracker"))
os.environ.setdefault("IS_LOCAL", "true")

from function import handler  # noqa: E402  (path set up above)

PORT = int(os.getenv("PORT", "3001"))
# Lambda handles one request per container; mirror that so the shared DB connection is never used concurrently.
_LOCK = threading.Lock()
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


class LambdaProxy(BaseHTTPRequestHandler):
    """Translate HTTP requests into Lambda Function URL events."""

    def _dispatch(self) -> None:
        parts = urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None
        event = {
            "rawPath": parts.path,
            "requestContext": {"http": {"method": self.command}},
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "queryStringParameters": dict(parse_qsl(parts.query)) or None,
            "body": body,
        }
        with _LOCK:
            response = handler(event)
        payload = (response.get("body") or "").encode("utf-8")
        self.send_response(response["statusCode"])
        for key, value in {**response.get("headers", {}), **CORS}.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    do_GET = do_POST = do_PUT = do_DELETE = _dispatch  # noqa: N815

    def do_OPTIONS(self) -> None:  # noqa: N802
        """Answer CORS preflight requests."""
        self.send_response(204)
        for key, value in CORS.items():
            self.send_header(key, value)
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:
        """Compact access log."""
        sys.stderr.write(json.dumps({"request": self.requestline, "status": args[1] if len(args) > 1 else ""}) + "\n")


if __name__ == "__main__":
    print(f"Project Tracker API on http://localhost:{PORT}/api/tracker")
    ThreadingHTTPServer(("0.0.0.0", PORT), LambdaProxy).serve_forever()  # nosec B104 - local dev server
