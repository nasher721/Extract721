# Copyright 2025 Google LLC.
# Pytest configuration: ensure api/ and project root are on path for API tests.

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "api"

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
