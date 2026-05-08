from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BYBIT_BASE = "https://api.bybit.com/v5/market/tickers"
BYBIT_P2P = "https://api2.bybit.com/fiat/otc/item/online"
SYMBOLS = [
    {"id": "btc", "name": "Bitcoin", "symbol": "BTCUSDT", "category": "linear", "quote": "USDT perpetual"},
    {"id": "eth", "name": "Ethereum", "symbol": "ETHUSDT", "category": "linear", "quote": "USDT perpetual"},
    {"id": "trx", "name": "TRON", "symbol": "TRXUSDT", "category": "linear", "quote": "USDT perpetual"},
]


def fetch_json(url: str, timeout: float = 8.0, payload: dict | None = None) -> dict:
    body = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "simple-rates-dashboard/1.0",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url,
        data=body,
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def bybit_ticker(symbol: str, category: str) -> dict:
    query = urllib.parse.urlencode({"category": category, "symbol": symbol})
    data = fetch_json(f"{BYBIT_BASE}?{query}")
    if data.get("retCode") != 0:
        raise RuntimeError(data.get("retMsg") or f"Bybit rejected {symbol}")

    rows = data.get("result", {}).get("list", [])
    if not rows:
        raise RuntimeError(f"No ticker data for {symbol}")

    row = rows[0]
    return {
        "symbol": symbol,
        "price": float(row["lastPrice"]),
        "change24h": float(row.get("price24hPcnt", 0)) * 100,
        "high24h": float(row.get("highPrice24h", 0) or 0),
        "low24h": float(row.get("lowPrice24h", 0) or 0),
        "turnover24h": float(row.get("turnover24h", 0) or 0),
    }


def usd_rub_rate() -> dict:
    # Bybit futures do not publish a USD/RUB perpetual ticker. P2P USDT/RUB is
    # the closest Bybit-native source, so the card shows the top-offer average.
    p2p_note = ""
    try:
        data = fetch_json(
            BYBIT_P2P,
            payload={
                "userId": "",
                "tokenId": "USDT",
                "currencyId": "RUB",
                "payment": [],
                "side": "1",
                "size": "5",
                "page": "1",
                "amount": "1000",
            },
        )
        if data.get("ret_code") != 0:
            raise RuntimeError(data.get("ret_msg") or "Bybit P2P rejected request")

        offers = data.get("result", {}).get("items", [])
        prices = [float(offer["price"]) for offer in offers if offer.get("price")]
        if not prices:
            raise RuntimeError("No Bybit P2P offers for USDT/RUB")

        average = sum(prices) / len(prices)
        return {
            "id": "usd-rub",
            "name": "Dollar",
            "symbol": "USD/RUB",
            "quote": "Bybit P2P",
            "price": average,
            "change24h": None,
            "high24h": max(prices),
            "low24h": min(prices),
            "turnover24h": None,
            "source": "Bybit P2P top offers",
            "note": f"Среднее по {len(prices)} верхним предложениям USDT/RUB.",
        }
    except Exception as p2p_error:
        p2p_note = str(p2p_error)

    try:
        ticker = bybit_ticker("USDTRUB", "spot")
        return {
            "id": "usd-rub",
            "name": "Dollar",
            "symbol": "USD/RUB",
            "quote": "Bybit spot",
            "price": ticker["price"],
            "change24h": ticker["change24h"],
            "high24h": ticker["high24h"],
            "low24h": ticker["low24h"],
            "turnover24h": ticker["turnover24h"],
            "source": "Bybit",
        }
    except Exception as bybit_error:
        try:
            data = fetch_json("https://open.er-api.com/v6/latest/USD")
            rub = float(data["rates"]["RUB"])
            return {
                "id": "usd-rub",
                "name": "Dollar",
                "symbol": "USD/RUB",
                "quote": "FX fallback",
                "price": rub,
                "change24h": None,
                "high24h": None,
                "low24h": None,
                "turnover24h": None,
                "source": "ExchangeRate-API",
                "note": f"Bybit P2P unavailable: {p2p_note}. Bybit spot USDTRUB unavailable: {bybit_error}",
            }
        except Exception as fallback_error:
            return {
                "id": "usd-rub",
                "name": "Dollar",
                "symbol": "USD/RUB",
                "quote": "unavailable",
                "price": None,
                "change24h": None,
                "high24h": None,
                "low24h": None,
                "turnover24h": None,
                "source": "No live source",
                "error": str(fallback_error),
                "note": f"Bybit P2P unavailable: {p2p_note}. Bybit spot USDTRUB unavailable: {bybit_error}",
            }


def rates_payload() -> dict:
    rates = []
    for item in SYMBOLS:
        try:
            ticker = bybit_ticker(item["symbol"], item["category"])
            rates.append(
                {
                    **item,
                    **ticker,
                    "source": "Bybit perpetual futures",
                }
            )
        except Exception as error:
            rates.append(
                {
                    **item,
                    "price": None,
                    "change24h": None,
                    "high24h": None,
                    "low24h": None,
                    "turnover24h": None,
                    "source": "Bybit perpetual futures",
                    "error": str(error),
                }
            )

    rates.append(usd_rub_rate())
    return {"updatedAt": int(time.time()), "rates": rates}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/rates":
            self.send_json(rates_payload())
            return

        file_path = ROOT / ("index.html" if path in {"/", "/index.html"} else path.lstrip("/"))
        if not file_path.is_file() or ROOT not in file_path.resolve().parents and file_path.resolve() != ROOT:
            self.send_error(404)
            return

        content = file_path.read_bytes()
        content_type = "text/html; charset=utf-8" if file_path.suffix == ".html" else "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, payload: dict, status: int = 200) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Dashboard: http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
