from __future__ import annotations

import asyncio
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from wayfinder_paths.adapters.lido_adapter.adapter import LidoAdapter
from wayfinder_paths.core.config import set_rpc_urls
from wayfinder_paths.core.constants.lido_contracts import LIDO_BY_CHAIN
from wayfinder_paths.core.utils.web3 import web3_from_chain_id

HOST = "0.0.0.0"
PORT = 8090
MAX_REQUEST_BYTES = 32_768
WAYFINDER_VERSION = "0.11.1"
HOODI_CHAIN_ID = 560048
HOODI_LIDO_CONTRACTS = {
    "steth": "0x3508A952176b3c15387C97BE809eaffB1982176a",
    "wsteth": "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
    "withdrawal_queue": "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
}


def configure_wayfinder() -> None:
    LIDO_BY_CHAIN.setdefault(HOODI_CHAIN_ID, HOODI_LIDO_CONTRACTS)
    rpc_url = os.environ.get("ETHEREUM_RPC_URL", "").strip()
    if rpc_url:
        set_rpc_urls({str(HOODI_CHAIN_ID): [rpc_url]})


def require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    return value.strip()


def require_request_ids(value: Any) -> list[int]:
    if not isinstance(value, list) or not value or len(value) > 64:
        raise ValueError("requestIds must contain between 1 and 64 items")
    ids = [int(item) for item in value]
    if any(item <= 0 for item in ids):
        raise ValueError("requestIds must be positive integers")
    return sorted(set(ids))


def serialize_uint(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RuntimeError("Wayfinder returned an invalid unsigned integer")
    return str(value)


def serialize_status(status: Any) -> dict[str, Any]:
    if not isinstance(status, dict):
        raise RuntimeError("Wayfinder returned an invalid withdrawal status")
    return {
        **status,
        "request_id": serialize_uint(status.get("request_id")),
        "amount_of_steth": serialize_uint(status.get("amount_of_steth")),
        "amount_of_shares": serialize_uint(status.get("amount_of_shares")),
        "timestamp": serialize_uint(status.get("timestamp")),
    }


async def current_block_number() -> str:
    async with web3_from_chain_id(HOODI_CHAIN_ID) as web3:
        return str(await web3.eth.block_number)


async def account_state(payload: dict[str, Any]) -> dict[str, Any]:
    account = require_string(payload.get("account"), "account")
    adapter = LidoAdapter(wallet_address=account)
    ok, result = await adapter.get_full_user_state(
        account=account,
        chain_id=HOODI_CHAIN_ID,
        include_withdrawals=True,
        include_claimable=True,
        include_usd=False,
    )
    if not ok or not isinstance(result, dict):
        cause = result.get("error") if isinstance(result, dict) else result
        raise RuntimeError(
            "Wayfinder could not read the Lido account state "
            f"({type(cause).__name__})"
        )

    steth = result.get("steth")
    if isinstance(steth, dict):
        steth["balance_raw"] = serialize_uint(steth.get("balance_raw"))
        steth["shares_raw"] = serialize_uint(steth.get("shares_raw"))
    wsteth = result.get("wsteth")
    if isinstance(wsteth, dict):
        wsteth["balance_raw"] = serialize_uint(wsteth.get("balance_raw"))
        wsteth["steth_equivalent_raw"] = serialize_uint(
            wsteth.get("steth_equivalent_raw")
        )
        wsteth["steth_per_token"] = serialize_uint(wsteth.get("steth_per_token"))

    withdrawals = result.get("withdrawals")
    if isinstance(withdrawals, dict):
        request_ids = withdrawals.get("request_ids")
        if isinstance(request_ids, list) and request_ids:
            withdrawals["request_ids"] = [serialize_uint(item) for item in request_ids]
            statuses = withdrawals.get("statuses")
            if isinstance(statuses, list):
                withdrawals["statuses"] = [serialize_status(item) for item in statuses]
            claimable = withdrawals.get("claimable_ether_by_id")
            if isinstance(claimable, dict):
                withdrawals["claimable_ether_by_id"] = {
                    str(key): serialize_uint(value) for key, value in claimable.items()
                }
    return {**result, "observed_block": await current_block_number()}


async def request_status(payload: dict[str, Any]) -> dict[str, Any]:
    request_ids = require_request_ids(payload.get("requestIds"))
    adapter = LidoAdapter()
    ok, statuses = await adapter.get_withdrawal_status(
        request_ids=request_ids,
        chain_id=HOODI_CHAIN_ID,
    )
    if not ok or not isinstance(statuses, list):
        raise RuntimeError("Wayfinder could not read the withdrawal status")
    hints: list[int] = []
    if any(item.get("is_finalized") and not item.get("is_claimed") for item in statuses):
        hints = await adapter._find_checkpoint_hints(
            chain_id=HOODI_CHAIN_ID,
            request_ids=request_ids,
        )
    return {
        "observed_block": await current_block_number(),
        "request_ids": [serialize_uint(item) for item in request_ids],
        "statuses": [serialize_status(item) for item in statuses],
        "checkpoint_hints": [serialize_uint(item) for item in hints],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "ExitKeeperWayfinder/1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"wayfinder-service {self.address_string()} {format % args}")

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        self.send_json(
            HTTPStatus.OK,
            {
                "status": "ok",
                "mode": "read-only",
                "wayfinderVersion": WAYFINDER_VERSION,
                "rpcConfigured": bool(os.environ.get("ETHEREUM_RPC_URL", "").strip()),
            },
        )

    def do_POST(self) -> None:
        token = os.environ.get("WAYFINDER_SERVICE_TOKEN", "")
        if not token or self.headers.get("Authorization") != f"Bearer {token}":
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("request body size is invalid")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("request body must be an object")

            if self.path == "/v1/lido/account-state":
                result = asyncio.run(account_state(payload))
            elif self.path == "/v1/lido/request-status":
                result = asyncio.run(request_status(payload))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            self.send_json(HTTPStatus.OK, {"ok": True, "result": result})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "invalid_request", "message": str(error)},
            )
        except Exception:
            self.send_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "wayfinder_read_failed"},
            )


if __name__ == "__main__":
    configure_wayfinder()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
