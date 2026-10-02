"""ZK Kiosk Fingerprint Service — loopback HTTP API for RCC-HIROS.

Bridges the ZK9500 USB scanner (via libzkfp.dll) and the web app:
  GET  /health     scanner state
  POST /capture    one swipe → raw image (PNG b64) + feature template (b64)
  POST /enroll     N swipes → merged registration template + images
  POST /identify   1:N match of a live template against provided templates

Binds to 127.0.0.1 only — no network exposure, no auth required.
"""
from __future__ import annotations

import base64
import io
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

import zkfpcap
from zkfpcap import ZKError, RC_VERIFY_FP

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("zk-kiosk")

SERVICE_VERSION = "1.0.0"
DEVICE_INDEX = 0

zk = zkfpcap.ZKFinger()
_device_lock = threading.Lock()

app = FastAPI(title="zk-kiosk-service", version=SERVICE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class CaptureIn(BaseModel):
    timeoutS: int = Field(default=30, ge=5, le=120)


class EnrollIn(BaseModel):
    swipes: int = Field(default=3, ge=2, le=6)
    timeoutS: int = Field(default=30, ge=5, le=120)


class TemplateRef(BaseModel):
    fid: int
    templateB64: str


class IdentifyIn(BaseModel):
    liveB64: str
    templates: list[TemplateRef]


def _to_png_b64(raw: bytes, width: int, height: int) -> str:
    img = Image.frombytes("L", (width, height), raw[: width * height])
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health() -> dict:
    try:
        with _device_lock:
            zk.init()
            count = zk.device_count()
    except ZKError as e:
        return {
            "service": "zk-kiosk-service",
            "version": SERVICE_VERSION,
            "scanner": "error",
            "error": str(e),
        }
    return {
        "service": "zk-kiosk-service",
        "version": SERVICE_VERSION,
        "scanner": "connected" if count > 0 else "not_found",
        "deviceCount": count,
    }


@app.post("/capture")
def capture(body: CaptureIn) -> dict:
    """Wait for one finger swipe; returns image + template."""
    with _device_lock:
        try:
            zk.init()
            zk.open(DEVICE_INDEX)
            params = zk.capture_params()
            log.info("capture: waiting %ss for swipe...", body.timeoutS)
            swipe = zk.acquire(body.timeoutS)
            log.info("capture: ok %dx%d @%d dpi, template %dB",
                     params.width, params.height, params.dpi, len(swipe.template))
            return {
                "imageB64": _to_png_b64(swipe.image, params.width, params.height),
                "templateB64": base64.b64encode(swipe.template).decode("ascii"),
                "templateBytes": len(swipe.template),
                "width": params.width,
                "height": params.height,
                "dpi": params.dpi,
                "capturedAt": _now(),
            }
        except ZKError as e:
            log.warning("capture failed: %s", e)
            raise HTTPException(status_code=504 if e.rc == zkfpcap.RC_TIMEOUT else 500,
                                detail=f"Scanner error: {e}") from e


@app.post("/enroll")
def enroll(body: EnrollIn) -> dict:
    """Capture N swipes, merge into one registration template."""
    with _device_lock:
        try:
            zk.init()
            zk.open(DEVICE_INDEX)
            params = zk.capture_params()
            images: list[str] = []
            templates: list[bytes] = []
            for i in range(body.swipes):
                log.info("enroll: swipe %d/%d...", i + 1, body.swipes)
                swipe = zk.acquire(body.timeoutS)
                images.append(_to_png_b64(swipe.image, params.width, params.height))
                templates.append(swipe.template)
            zk.db_init()
            try:
                reg = zk.db_merge(*templates)
            finally:
                zk.db_free()
            log.info("enroll: merged %d swipes → %dB registration template",
                     body.swipes, len(reg))
            return {
                "imagesB64": images,
                "regTemplateB64": base64.b64encode(reg).decode("ascii"),
                "templateBytes": len(reg),
                "swipesCaptured": len(templates),
                "width": params.width,
                "height": params.height,
                "dpi": params.dpi,
                "enrolledAt": _now(),
            }
        except ZKError as e:
            log.warning("enroll failed: %s", e)
            raise HTTPException(status_code=504 if e.rc == zkfpcap.RC_TIMEOUT else 500,
                                detail=f"Scanner error: {e}") from e


@app.post("/identify")
def identify(body: IdentifyIn) -> dict:
    """1:N match a live template against the provided template list."""
    try:
        live = base64.b64decode(body.liveB64)
        decoded = [
            (t.fid, base64.b64decode(t.templateB64)) for t in body.templates
        ]
    except Exception as e:
        raise HTTPException(status_code=400, detail="Bad base64 payload") from e

    if not decoded:
        return {"fid": None, "score": 0}

    matched_fid: Optional[int] = None
    score = 0
    with _device_lock:
        try:
            zk.init()
            zk.db_init()
            try:
                # Add valid templates only; skip ones the engine rejects
                added_count = 0
                for fid, tmpl in decoded:
                    try:
                        zk.db_add(fid, tmpl)
                        added_count += 1
                    except ZKError as e:
                        if e.rc == zkfpcap.RC_ADD_FP:
                            log.warning("Skipping invalid template for fid %s: %s", fid, e)
                            continue
                        raise
                if added_count == 0:
                    return {"fid": None, "score": 0}
                try:
                    matched_fid, score = zk.db_identify(live)
                except ZKError as e:
                    if e.rc == RC_VERIFY_FP:
                        return {"fid": None, "score": 0}
                    raise
            finally:
                zk.db_free()
        except ZKError as e:
            log.warning("identify failed: %s", e)
            raise HTTPException(status_code=500, detail=f"Match engine error: {e}") from e

    log.info("identify: fid=%s score=%d (vs %d templates)", matched_fid, score, len(decoded))
    return {"fid": matched_fid, "score": score}
