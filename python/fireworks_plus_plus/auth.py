from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Dict


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


class HS256Auth:
    @staticmethod
    def sign(claims: Dict[str, Any], secret: str) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        encoded_header = _b64url_encode(json.dumps(header).encode("utf-8"))
        encoded_payload = _b64url_encode(json.dumps(claims).encode("utf-8"))
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        return f"{encoded_header}.{encoded_payload}.{_b64url_encode(signature)}"
