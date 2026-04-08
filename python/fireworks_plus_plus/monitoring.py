from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class Alert:
    id: str
    severity: str
    title: str
    message: str
    source: str
    details: Dict[str, Any] | None = None


@dataclass
class DashboardSnapshot:
    generated_at: str
    snapshot: Dict[str, Any]
    alerts: List[Alert]

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "DashboardSnapshot":
        alerts = [Alert(**alert) for alert in payload.get("alerts", [])]
        return cls(
            generated_at=payload.get("snapshot", {}).get("generatedAt", ""),
            snapshot=payload.get("snapshot", {}),
            alerts=alerts,
        )
