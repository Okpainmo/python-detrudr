from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from statistics import mean
from typing import Deque, Dict, Iterable, List


@dataclass
class BaselineStats:
    mean: float
    stddev: float
    sample_size: int
    hour_slot: str


class RollingBaseline:
    """Maintains per-hour rolling samples and recomputes a 30-minute baseline."""

    def __init__(
        self,
        history_seconds: int = 1800,
        recalc_interval_seconds: int = 60,
        min_samples_per_hour: int = 300,
        floor_mean: float = 1.0,
        floor_stddev: float = 0.5,
    ) -> None:
        self.history_seconds = history_seconds
        self.recalc_interval_seconds = recalc_interval_seconds
        self.min_samples_per_hour = min_samples_per_hour
        self.floor_mean = floor_mean
        self.floor_stddev = floor_stddev
        self.hourly_samples: Dict[str, Deque[float]] = defaultdict(deque)
        self.current = BaselineStats(
            mean=floor_mean,
            stddev=floor_stddev,
            sample_size=0,
            hour_slot="bootstrap",
        )
        self.last_recalculated_at: datetime | None = None
        self.history: List[dict] = []

    def add_sample(self, sample_time: datetime, value: float) -> None:
        hour_slot = sample_time.strftime("%Y-%m-%dT%H")
        bucket = self.hourly_samples[hour_slot]
        bucket.append(value)
        while len(bucket) > self.history_seconds:
            bucket.popleft()

        stale_hours = []
        for slot, samples in self.hourly_samples.items():
            if not samples:
                stale_hours.append(slot)
        for slot in stale_hours:
            del self.hourly_samples[slot]

    def recalculate(self, now: datetime) -> BaselineStats:
        current_hour = now.strftime("%Y-%m-%dT%H")
        # Prefer the current hour once it has enough data; otherwise fall back
        # to the most recent rolling samples across hour boundaries.
        preferred = list(self.hourly_samples.get(current_hour, ()))
        if len(preferred) >= self.min_samples_per_hour:
            selected = preferred[-self.history_seconds :]
            slot_used = current_hour
        else:
            selected = self._merge_recent_samples()
            slot_used = current_hour if preferred else "rolling"

        computed_mean = mean(selected) if selected else self.floor_mean
        variance = self._variance(selected, computed_mean) if selected else 0.0
        stats = BaselineStats(
            mean=max(computed_mean, self.floor_mean),
            stddev=max(sqrt(variance), self.floor_stddev),
            sample_size=len(selected),
            hour_slot=slot_used,
        )
        self.current = stats
        self.last_recalculated_at = now
        self.history.append(
            {
                "timestamp": now.isoformat(),
                "effective_mean": round(stats.mean, 4),
                "effective_stddev": round(stats.stddev, 4),
                "sample_size": stats.sample_size,
                "hour_slot": stats.hour_slot,
            }
        )
        self.history = self.history[-180:]
        return stats

    def should_recalculate(self, now: datetime) -> bool:
        if self.last_recalculated_at is None:
            return True
        elapsed = (now - self.last_recalculated_at).total_seconds()
        return elapsed >= self.recalc_interval_seconds

    def snapshot(self) -> dict:
        return {
            "mean": round(self.current.mean, 4),
            "stddev": round(self.current.stddev, 4),
            "sample_size": self.current.sample_size,
            "hour_slot": self.current.hour_slot,
            "history": self.history[-60:],
        }

    def _merge_recent_samples(self) -> List[float]:
        merged: List[float] = []
        for slot in sorted(self.hourly_samples.keys(), reverse=True):
            samples = self.hourly_samples[slot]
            if not samples:
                continue
            needed = self.history_seconds - len(merged)
            if needed <= 0:
                break
            merged = list(samples)[-needed:] + merged
        return merged[-self.history_seconds :]

    @staticmethod
    def _variance(samples: Iterable[float], avg: float) -> float:
        values = list(samples)
        if len(values) < 2:
            return 0.0
        return sum((sample - avg) ** 2 for sample in values) / len(values)
