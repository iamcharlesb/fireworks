# Python SDK

The repo now includes a minimal Python SDK focused on the management and monitoring surface.

## Layout

```text
python/
  fireworks_plus_plus/
    __init__.py
    auth.py
    client.py
    monitoring.py
  tests/
```

## Install Locally

```bash
cd python
python3 -m pip install -e .
```

## Usage

```python
from fireworks_plus_plus import HS256Auth, ManagementClient

token = HS256Auth.sign(
    {
        "sub": "alice",
        "roles": ["admin"],
        "iss": "fireworks-plus-plus",
        "aud": "dashboard",
        "exp": 4102444800,
    },
    "top-secret",
)

client = ManagementClient("http://127.0.0.1:3000", token=token)
dashboard = client.dashboard()
alerts = client.alerts()
```

## Scope

- Python management/monitoring client
- shared auth token helper
- typed snapshot/alert dataclasses

It is not yet a full Python runtime SDK with feature parity to the TypeScript agent runtime.
