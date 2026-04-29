from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from urllib import request


class SlackNotifier:
    def __init__(self, enabled: bool, webhook_url: str, channel: str) -> None:
        self.enabled = enabled
        self.webhook_url = webhook_url
        self.channel = channel
        self.logger = logging.getLogger('detrudr.notifier')

    def notify(
        self,
        title: str,
        condition: str,
        timestamp: datetime,
        current_rate: float,
        baseline: float,
        duration: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            'channel': self.channel,
            'text': title,
            'metadata': {
                'condition': condition,
                'timestamp': timestamp.isoformat(),
                'current_rate': round(current_rate, 2),
                'baseline': round(baseline, 2),
                'duration': duration,
                'ip_address': ip_address,
            },
        }

        if not self.enabled:
            self.logger.info('Slack disabled. Payload=%s', payload)
            return {'sent': False, 'payload': payload}

        body = json.dumps(payload).encode('utf-8')
        req = request.Request(
            self.webhook_url,
            data=body,
            headers={'Content-Type': 'application/json'},
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                return {'sent': True, 'status': response.status, 'payload': payload}
        except Exception as exc:  # pragma: no cover
            self.logger.error('Slack notification failed: %s', exc)
            return {'sent': False, 'error': str(exc), 'payload': payload}
