from __future__ import annotations

import asyncio
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import parse_qs, urlparse

from services.wayfinder.worker import account_state, configure_wayfinder, request_status

MAX_REQUEST_BYTES = 32_768


def send_json(handler: BaseHTTPRequestHandler, status: HTTPStatus, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, separators=(",", ":")).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"wayfinder-function {self.address_string()} {format % args}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/wayfinder", "/wayfinder/health"}:
            send_json(self, HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        send_json(
            self,
            HTTPStatus.OK,
            {
                "status": "ok",
                "mode": "read-only",
                "rpcConfigured": bool(os.environ.get("ETHEREUM_RPC_URL", "").strip()),
            },
        )

    def do_POST(self) -> None:
        token = os.environ.get("WAYFINDER_SERVICE_TOKEN", "")
        authorization = self.headers.get("Authorization", "")
        if not token or authorization != f"Bearer {token}":
            print(
                "wayfinder_unauthorized "
                f"configured_length={len(token)} received_length={len(authorization)}"
            )
            send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        try:
            configure_wayfinder()
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("request body size is invalid")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("request body must be an object")
            parsed = urlparse(self.path)
            operation = parse_qs(parsed.query).get("operation", [""])[0]
            if not operation and parsed.path.endswith("/v1/lido/account-state"):
                operation = "account-state"
            if not operation and parsed.path.endswith("/v1/lido/request-status"):
                operation = "request-status"
            if operation == "account-state":
                result = asyncio.run(account_state(payload))
            elif operation == "request-status":
                result = asyncio.run(request_status(payload))
            else:
                send_json(self, HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            send_json(self, HTTPStatus.OK, {"ok": True, "result": result})
        except (ValueError, json.JSONDecodeError) as error:
            send_json(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "invalid_request", "message": str(error)},
            )
        except Exception as error:
            print(f"wayfinder_read_failed: {type(error).__name__}")
            send_json(self, HTTPStatus.BAD_GATEWAY, {"error": "wayfinder_read_failed"})
