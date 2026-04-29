from __future__ import annotations

import time

from detector import DetectionEngine


def run_unbanner(engine: DetectionEngine, interval_seconds: float = 1.0) -> None:
    while True:
        engine.run_unban_checks()
        time.sleep(interval_seconds)
