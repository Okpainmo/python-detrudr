from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path

import yaml

from dashboard import DashboardServer
from detector import DetectionEngine
from monitor import follow_log_file


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key.strip(), value)


def apply_env_overrides(config: dict) -> dict:
    slack_cfg = config.setdefault("slack", {})
    webhook = os.environ.get("WEB_HOOK_URL", "").strip()
    channel = os.environ.get("CHANNEL", "").strip()
    if webhook:
        slack_cfg["webhook_url"] = webhook
    if channel:
        slack_cfg["channel"] = channel
    return config


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def start_tick_loop(engine: DetectionEngine, interval_seconds: float = 1.0) -> threading.Thread:
    def runner() -> None:
        while True:
            engine.tick()
            engine.run_unban_checks()
            time.sleep(interval_seconds)

    thread = threading.Thread(target=runner, daemon=True, name="tick-loop")
    thread.start()
    return thread


def main() -> None:
    env_path = Path(__file__).with_name(".env")
    load_dotenv(env_path)
    config_path = Path(__file__).with_name("config.yaml")
    config = apply_env_overrides(load_config(str(config_path)))
    configure_logging(config["app"]["log_level"])

    engine = DetectionEngine(config)
    dashboard = DashboardServer(
        host=str(config["dashboard"]["host"]),
        port=int(config["dashboard"]["port"]),
        snapshot_fn=engine.snapshot,
    )
    dashboard.start()
    start_tick_loop(engine)

    logging.getLogger("detrudr.main").info("Detector started. Watching %s", config["log"]["path"])
    for entry in follow_log_file(str(config["log"]["path"])):
        engine.process_entry(entry)


if __name__ == "__main__":
    main()
