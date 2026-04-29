from __future__ import annotations

import logging
import threading
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Deque, Dict, Optional

from baseline import RollingBaseline
from blocker import IptablesBlocker
from notifier import SlackNotifier

try:
    import psutil  # type: ignore
except ImportError:  # pragma: no cover
    psutil = None


@dataclass
class BanRecord:
    ip: str
    strike_count: int
    condition: str
    started_at: datetime
    expires_at: Optional[datetime]
    duration_label: str


class DetectionEngine:
    def __init__(self, config: dict) -> None:
        self.config = config
        self.logger = logging.getLogger("detrudr.engine")
        self.lock = threading.RLock()
        self.started_at = datetime.now(timezone.utc)
        self.window_seconds = int(config["window"]["seconds"])
        self.zscore_threshold = float(config["thresholds"]["zscore"])
        self.multiplier_threshold = float(config["thresholds"]["rate_multiplier"])
        self.tightening_factor = float(config["thresholds"]["tightening_factor"])
        self.error_multiplier = float(config["thresholds"]["error_multiplier"])
        self.audit_path = Path(config["audit"]["path"])
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)

        baseline_cfg = config["baseline"]
        self.global_baseline = RollingBaseline(
            history_seconds=int(baseline_cfg["history_seconds"]),
            recalc_interval_seconds=int(baseline_cfg["recalc_interval_seconds"]),
            min_samples_per_hour=int(baseline_cfg["min_samples_per_hour"]),
            floor_mean=float(baseline_cfg["floor_mean"]),
            floor_stddev=float(baseline_cfg["floor_stddev"]),
        )
        self.ip_baselines: Dict[str, RollingBaseline] = {}
        self.error_baseline = RollingBaseline(
            history_seconds=int(baseline_cfg["history_seconds"]),
            recalc_interval_seconds=int(baseline_cfg["recalc_interval_seconds"]),
            min_samples_per_hour=int(baseline_cfg["min_samples_per_hour"]),
            floor_mean=float(config["thresholds"]["error_floor_mean"]),
            floor_stddev=float(config["thresholds"]["error_floor_stddev"]),
        )

        self.global_requests: Deque[datetime] = deque()
        self.global_errors: Deque[datetime] = deque()
        self.ip_requests: Dict[str, Deque[datetime]] = defaultdict(deque)
        self.ip_errors: Dict[str, Deque[datetime]] = defaultdict(deque)
        self.top_ip_counter: Counter[str] = Counter()
        self.current_second_requests = 0
        self.current_second_errors = 0
        self.last_flushed_second: Optional[datetime] = None

        self.blocker = IptablesBlocker(
            chain=str(config["blocking"]["iptables_chain"]),
            dry_run=bool(config["blocking"]["dry_run"]),
        )
        notifier_cfg = config["slack"]
        self.notifier = SlackNotifier(
            enabled=bool(notifier_cfg["enabled"]),
            webhook_url=str(notifier_cfg["webhook_url"]),
            channel=str(notifier_cfg["channel"]),
        )

        self.ban_durations = [
            timedelta(minutes=int(config["blocking"]["ban_minutes"][0])),
            timedelta(minutes=int(config["blocking"]["ban_minutes"][1])),
            timedelta(hours=int(config["blocking"]["ban_hours_final"])),
        ]
        self.banned_ips: Dict[str, BanRecord] = {}
        self.strike_counts: Dict[str, int] = defaultdict(int)
        self.last_global_alert_at: Optional[datetime] = None
        self.global_alert_cooldown_seconds = int(config["thresholds"]["global_alert_cooldown_seconds"])

    def process_entry(self, entry: dict) -> None:
        event_time = entry["timestamp"]
        ip_address = str(entry["source_ip"])
        status = int(entry["status"])

        with self.lock:
            self._flush_until(event_time)
            self.global_requests.append(event_time)
            self.ip_requests[ip_address].append(event_time)
            self.top_ip_counter[ip_address] += 1
            self.current_second_requests += 1

            is_error = 400 <= status <= 599
            if is_error:
                self.global_errors.append(event_time)
                self.ip_errors[ip_address].append(event_time)
                self.current_second_errors += 1

            self._evict_old(event_time)
            self._detect_global(event_time)
            self._detect_ip(ip_address, event_time)
            self._maybe_recalculate(event_time)

    def tick(self) -> None:
        with self.lock:
            now = datetime.now(timezone.utc)
            self._flush_until(now)
            self._evict_old(now)
            self._maybe_recalculate(now)

    def run_unban_checks(self) -> None:
        with self.lock:
            now = datetime.now(timezone.utc)
            expired = [
                record for record in self.banned_ips.values()
                if record.expires_at is not None and record.expires_at <= now
            ]
            for record in expired:
                if self.blocker.unblock(record.ip):
                    del self.banned_ips[record.ip]
                    self._audit(
                        "UNBAN",
                        record.ip,
                        record.condition,
                        0.0,
                        self.global_baseline.current.mean,
                        record.duration_label,
                    )
                    self.notifier.notify(
                        title=f"IP unbanned: {record.ip}",
                        condition=record.condition,
                        timestamp=now,
                        current_rate=0.0,
                        baseline=self.global_baseline.current.mean,
                        duration=record.duration_label,
                        ip_address=record.ip,
                    )

    def snapshot(self) -> dict:
        with self.lock:
            now = datetime.now(timezone.utc)
            self._evict_old(now)
            global_rate = round(len(self.global_requests) / self.window_seconds, 2)
            banned = []
            for record in self.banned_ips.values():
                banned.append(
                    {
                        "ip": record.ip,
                        "until": record.expires_at.isoformat() if record.expires_at else "permanent",
                        "strikes": record.strike_count,
                    }
                )
            top_ips = [
                {"ip": ip, "requests": len(self.ip_requests[ip])}
                for ip, _ in self.top_ip_counter.most_common(10)
                if self.ip_requests.get(ip)
            ]
            cpu_percent = round(psutil.cpu_percent(interval=None), 2) if psutil else 0.0
            memory_mb = round(psutil.Process().memory_info().rss / (1024 * 1024), 2) if psutil else 0.0
            return {
                "uptime": str(now - self.started_at).split(".")[0],
                "global_requests_last_60s": len(self.global_requests),
                "global_req_per_sec": global_rate,
                "current_second_requests": self.current_second_requests,
                "global_baseline": self.global_baseline.snapshot(),
                "error_baseline": self.error_baseline.snapshot(),
                "top_ips": top_ips,
                "banned_ips": banned,
                "cpu_percent": cpu_percent,
                "memory_mb": memory_mb,
                "audit_tail": self._tail_audit(),
            }

    def _detect_global(self, now: datetime) -> None:
        current_rate = len(self.global_requests) / self.window_seconds
        baseline = self.global_baseline.current
        if self._is_anomalous(current_rate, baseline.mean, baseline.stddev) and self._can_emit_global_alert(now):
            self._audit("GLOBAL_ALERT", "global", "global_rate", current_rate, baseline.mean, "-")
            self.notifier.notify(
                title="Global traffic anomaly detected",
                condition="global_rate",
                timestamp=now,
                current_rate=current_rate,
                baseline=baseline.mean,
            )
            self.last_global_alert_at = now

    def _detect_ip(self, ip_address: str, now: datetime) -> None:
        if ip_address in self.banned_ips:
            return
        ip_baseline = self.ip_baselines.setdefault(
            ip_address,
            RollingBaseline(
                history_seconds=int(self.config["baseline"]["history_seconds"]),
                recalc_interval_seconds=int(self.config["baseline"]["recalc_interval_seconds"]),
                min_samples_per_hour=int(self.config["baseline"]["min_samples_per_hour"]),
                floor_mean=float(self.config["baseline"]["floor_mean"]),
                floor_stddev=float(self.config["baseline"]["floor_stddev"]),
            ),
        )
        rate = len(self.ip_requests[ip_address]) / self.window_seconds
        error_rate = (
            len(self.ip_errors[ip_address]) / max(len(self.ip_requests[ip_address]), 1)
            if self.ip_requests[ip_address]
            else 0.0
        )
        # An elevated 4xx/5xx ratio lowers the detection thresholds for that IP,
        # which makes aggressive scanners easier to catch before a larger spike.
        tightened = error_rate >= max(
            self.error_baseline.current.mean * self.error_multiplier,
            float(self.config["thresholds"]["error_floor_mean"]) * self.error_multiplier,
        )
        zscore = self._zscore(rate, ip_baseline.current.mean, ip_baseline.current.stddev)
        multiplier = self.multiplier_threshold / (self.tightening_factor if tightened else 1.0)
        z_limit = self.zscore_threshold / (self.tightening_factor if tightened else 1.0)
        if zscore > z_limit or rate > ip_baseline.current.mean * multiplier:
            self._ban_ip(ip_address, now, rate, ip_baseline.current.mean, "ip_rate_tight" if tightened else "ip_rate")

    def _ban_ip(self, ip_address: str, now: datetime, rate: float, baseline: float, condition: str) -> None:
        self.strike_counts[ip_address] += 1
        strike = self.strike_counts[ip_address]
        if strike <= len(self.ban_durations):
            duration = self.ban_durations[strike - 1]
            expires_at = now + duration
            duration_label = self._format_duration(duration)
        else:
            expires_at = None
            duration_label = "permanent"
        if not self.blocker.block(ip_address):
            return
        record = BanRecord(
            ip=ip_address,
            strike_count=strike,
            condition=condition,
            started_at=now,
            expires_at=expires_at,
            duration_label=duration_label,
        )
        self.banned_ips[ip_address] = record
        self._audit("BAN", ip_address, condition, rate, baseline, duration_label)
        self.notifier.notify(
            title=f"IP banned: {ip_address}",
            condition=condition,
            timestamp=now,
            current_rate=rate,
            baseline=baseline,
            duration=duration_label,
            ip_address=ip_address,
        )

    def _maybe_recalculate(self, now: datetime) -> None:
        if self.global_baseline.should_recalculate(now):
            stats = self.global_baseline.recalculate(now)
            self.error_baseline.recalculate(now)
            for ip_address, ip_baseline in list(self.ip_baselines.items()):
                ip_baseline.recalculate(now)
                if not self.ip_requests.get(ip_address):
                    del self.ip_baselines[ip_address]
            self._audit("BASELINE", "global", "recalculated", stats.mean, stats.mean, stats.hour_slot)

    def _flush_until(self, now: datetime) -> None:
        current_second = now.replace(microsecond=0)
        if self.last_flushed_second is None:
            self.last_flushed_second = current_second
            return

        while self.last_flushed_second < current_second:
            sample_time = self.last_flushed_second
            # Each second becomes one baseline sample so the daemon can learn
            # the recent 30-minute traffic shape instead of relying on fixed thresholds.
            self.global_baseline.add_sample(sample_time, float(self.current_second_requests))
            total = max(self.current_second_requests, 1)
            error_ratio = self.current_second_errors / total if self.current_second_requests else 0.0
            self.error_baseline.add_sample(sample_time, error_ratio)
            for ip_address, requests in list(self.ip_requests.items()):
                ip_count = self._count_second(requests, sample_time)
                if ip_address not in self.ip_baselines:
                    self.ip_baselines[ip_address] = RollingBaseline(
                        history_seconds=int(self.config["baseline"]["history_seconds"]),
                        recalc_interval_seconds=int(self.config["baseline"]["recalc_interval_seconds"]),
                        min_samples_per_hour=int(self.config["baseline"]["min_samples_per_hour"]),
                        floor_mean=float(self.config["baseline"]["floor_mean"]),
                        floor_stddev=float(self.config["baseline"]["floor_stddev"]),
                    )
                self.ip_baselines[ip_address].add_sample(sample_time, float(ip_count))
            self.current_second_requests = 0
            self.current_second_errors = 0
            self.last_flushed_second += timedelta(seconds=1)

    def _evict_old(self, now: datetime) -> None:
        cutoff = now - timedelta(seconds=self.window_seconds)
        while self.global_requests and self.global_requests[0] < cutoff:
            self.global_requests.popleft()
        while self.global_errors and self.global_errors[0] < cutoff:
            self.global_errors.popleft()
        stale_ips = []
        for ip_address, requests in self.ip_requests.items():
            while requests and requests[0] < cutoff:
                requests.popleft()
            errors = self.ip_errors[ip_address]
            while errors and errors[0] < cutoff:
                errors.popleft()
            if not requests and ip_address not in self.banned_ips:
                stale_ips.append(ip_address)
        for ip_address in stale_ips:
            del self.ip_requests[ip_address]
            if ip_address in self.ip_errors:
                del self.ip_errors[ip_address]
            self.top_ip_counter.pop(ip_address, None)

    def _audit(
        self,
        action: str,
        ip_address: str,
        condition: str,
        rate: float,
        baseline: float,
        duration: str,
    ) -> None:
        stamp = datetime.now(timezone.utc).isoformat()
        line = f"[{stamp}] {action} {ip_address} | {condition} | {rate:.2f} | {baseline:.2f} | {duration}\n"
        with self.audit_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
        self.logger.info(line.strip())

    def _tail_audit(self) -> list[str]:
        if not self.audit_path.exists():
            return []
        lines = self.audit_path.read_text(encoding="utf-8").splitlines()
        return lines[-12:]

    @staticmethod
    def _format_duration(duration: timedelta) -> str:
        seconds = int(duration.total_seconds())
        minutes = seconds // 60
        if minutes < 60:
            return f"{minutes}m"
        return f"{minutes // 60}h"

    @staticmethod
    def _count_second(requests: Deque[datetime], second_mark: datetime) -> int:
        next_mark = second_mark + timedelta(seconds=1)
        return sum(1 for item in requests if second_mark <= item < next_mark)

    def _is_anomalous(self, rate: float, baseline_mean: float, baseline_stddev: float) -> bool:
        return self._zscore(rate, baseline_mean, baseline_stddev) > self.zscore_threshold or rate > baseline_mean * self.multiplier_threshold

    def _can_emit_global_alert(self, now: datetime) -> bool:
        if self.last_global_alert_at is None:
            return True
        return (now - self.last_global_alert_at).total_seconds() >= self.global_alert_cooldown_seconds

    @staticmethod
    def _zscore(rate: float, baseline_mean: float, baseline_stddev: float) -> float:
        if baseline_stddev <= 0:
            return 0.0
        return (rate - baseline_mean) / baseline_stddev
