import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fireworks_plus_plus import HS256Auth, ManagementClient


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class ManagementClientTests(unittest.TestCase):
    def test_hs256_sign_returns_token(self):
        token = HS256Auth.sign({"sub": "alice"}, "secret")
        self.assertEqual(token.count("."), 2)

    @patch("urllib.request.urlopen")
    def test_dashboard_request(self, mock_urlopen):
        mock_urlopen.return_value = FakeResponse(
            {
                "snapshot": {"generatedAt": "2026-04-02T00:00:00.000Z"},
                "alerts": [
                    {
                        "id": "1",
                        "severity": "warning",
                        "title": "Approval backlog",
                        "message": "1 run waiting",
                        "source": "checkpoint"
                    }
                ],
            }
        )

        client = ManagementClient("http://localhost:3000", token="token")
        dashboard = client.dashboard()

        self.assertEqual(dashboard.generated_at, "2026-04-02T00:00:00.000Z")
        self.assertEqual(len(dashboard.alerts), 1)


if __name__ == "__main__":
    unittest.main()
