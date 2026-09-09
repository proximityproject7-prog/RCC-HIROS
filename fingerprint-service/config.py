"""Fingerprint service configuration. Same MySQL as the Next.js app (XAMPP)."""
import os

DB_HOST = os.environ.get("FP_DB_HOST", "localhost")
DB_PORT = int(os.environ.get("FP_DB_PORT", "3306"))
DB_USER = os.environ.get("FP_DB_USER", "root")
DB_PASSWORD = os.environ.get("FP_DB_PASSWORD", "")
DB_NAME = os.environ.get("FP_DB_NAME", "rcc_hiros")

WS_HOST = os.environ.get("FP_WS_HOST", "localhost")
WS_PORT = int(os.environ.get("FP_WS_PORT", "8765"))

MAX_TEMPLATES_PER_EMPLOYEE = 2
WINBIO_TIMEOUT_MS = 10000  # 10 seconds for sensor locate/identify
