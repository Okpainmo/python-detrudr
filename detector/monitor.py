from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, Generator, Optional


def parse_timestamp(raw_timestamp: str) -> datetime:
    if not raw_timestamp:
        return datetime.now(timezone.utc)
    try:
        normalized = raw_timestamp.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def parse_log_line(line: str) -> Optional[Dict[str, object]]:
    line = line.strip()
    if not line:
        return None
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None

    return {
        'source_ip': str(payload.get('source_ip', 'unknown')),
        'timestamp': parse_timestamp(str(payload.get('timestamp', ''))),
        'method': str(payload.get('method', 'GET')),
        'path': str(payload.get('path', '/')),
        'status': int(payload.get('status', 0) or 0),
        'response_size': int(payload.get('response_size', 0) or 0),
    }


def follow_log_file(path: str, sleep_seconds: float = 0.25) -> Generator[Dict[str, object], None, None]:
    while True:
        if not os.path.exists(path):
            time.sleep(sleep_seconds)
            continue

        with open(path, 'r', encoding='utf-8') as handle:
            handle.seek(0, os.SEEK_END)
            while True:
                line = handle.readline()
                if line:
                    entry = parse_log_line(line)
                    if entry:
                        yield entry
                    continue

                if not os.path.exists(path):
                    break

                time.sleep(sleep_seconds)
