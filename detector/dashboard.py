from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable


def build_dashboard_handler(snapshot_fn: Callable[[], dict]) -> type[BaseHTTPRequestHandler]:
    class DashboardHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/metrics":
                self._send_json(snapshot_fn())
                return
            self._send_html(self._page())

        def log_message(self, format: str, *args: object) -> None:
            return

        def _send_json(self, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_html(self, html: str) -> None:
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        @staticmethod
        def _page() -> str:
            return """<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>detrudr</title>
  <style>
    :root { color-scheme: light; --bg:#f4efe6; --ink:#1d1b19; --card:#fffaf2; --line:#d8c9b1; --accent:#9d3c16; }
    body { font-family: "IBM Plex Sans", sans-serif; background: linear-gradient(180deg, #f7f1e7, #efe4d3); color: var(--ink); margin: 0; padding: 24px; }
    h1 { margin: 0 0 16px; font-size: 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.05); }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6b6256; }
    .value { font-size: 26px; font-weight: 700; margin-top: 8px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 13px; margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 0; border-bottom: 1px solid var(--line); text-align: left; }
    .wide { margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Detrudr</h1>
  <div class="grid" id="cards"></div>
  <div class="grid wide">
    <div class="card"><div class="label">Top Source IPs</div><div id="top-ips"></div></div>
    <div class="card"><div class="label">Banned IPs</div><div id="bans"></div></div>
    <div class="card"><div class="label">Audit Tail</div><div id="audit"></div></div>
  </div>
  <script>
    async function render() {
      const res = await fetch('/metrics', { cache: 'no-store' });
      const data = await res.json();
      const cards = [
        ['Global req/s', data.global_req_per_sec],
        ['Current req/s', data.current_second_requests],
        ['CPU %', data.cpu_percent],
        ['Memory MB', data.memory_mb],
        ['Baseline mean', data.global_baseline.mean],
        ['Baseline stddev', data.global_baseline.stddev],
        ['Uptime', data.uptime],
      ];
      document.getElementById('cards').innerHTML = cards.map(([k, v]) =>
        `<div class="card"><div class="label">${k}</div><div class="value">${v}</div></div>`
      ).join('');
      document.getElementById('top-ips').innerHTML = table(['ip', 'requests'], data.top_ips);
      document.getElementById('bans').innerHTML = table(['ip', 'until', 'strikes'], data.banned_ips);
      document.getElementById('audit').innerHTML = `<pre>${(data.audit_tail || []).join('\\n')}</pre>`;
    }
    function table(headers, rows) {
      const head = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
      const body = (rows || []).map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('');
      return `<table>${head}${body}</table>`;
    }
    render();
    setInterval(render, 3000);
  </script>
</body>
</html>"""

    return DashboardHandler


class DashboardServer:
    def __init__(self, host: str, port: int, snapshot_fn: Callable[[], dict]) -> None:
        self.server = ThreadingHTTPServer((host, port), build_dashboard_handler(snapshot_fn))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
