from __future__ import annotations

import json
import urllib.request
from typing import Any, Dict, Optional

from .monitoring import DashboardSnapshot


class ManagementClient:
    def __init__(self, base_url: str, token: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _request(self, path: str) -> Dict[str, Any]:
        request = urllib.request.Request(f"{self.base_url}{path}")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        request.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))

    def dashboard(self) -> DashboardSnapshot:
        return DashboardSnapshot.from_dict(self._request("/api/dashboard"))

    def alerts(self) -> Dict[str, Any]:
        return self._request("/api/alerts")

    def audit(self) -> Dict[str, Any]:
        return self._request("/api/audit")

    def checkpoints(self) -> Dict[str, Any]:
        return self._request("/api/checkpoints")

    def workflows(self) -> Dict[str, Any]:
        return self._request("/api/workflows")
