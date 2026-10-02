"""ctypes bindings for the ZKTeco ZKFinger SDK 5.x (libzkfp.dll).

The SDK is installed system-wide (C:\\Windows\\System32\\libzkfp.dll) by the
ZKFinger SDK 5.3 setup.exe. The USB driver (ZKTeco Inc. libusb-win32,
oem97.inf) must be present for the ZK9500 to be visible.

All functions return 0 on success; negatives are error codes defined in
libzkfperrdef.h. Raises ZKError with the mapped message on failure.

NOT thread-safe: serialize all calls on one device handle with a lock.
"""
from __future__ import annotations

import ctypes
import logging
import threading
import time
from typing import NamedTuple

DLL_NAME = "libzkfp.dll"

MAX_TEMPLATE_SIZE = 2048
FP_THRESHOLD_CODE = 1   # 1:1 verify threshold (ZKFPM_DBSetParameter)
FP_MTHRESHOLD_CODE = 2  # 1:N identify threshold (ZKFPM_DBSetParameter)

# Retryable error codes during capture
_RETRYABLE_CAPTURE_RC = frozenset({
    -8,  # RC_CAPTURE
    -9,  # RC_EXTRACT
    -12, # RC_BUSY
})

# Default 1:N match threshold (0-100, higher = stricter). 70 is a good starting point.
DEFAULT_MTHRESHOLD = 70

log = logging.getLogger("zkfpcap")

# ── Result codes (libzkfperrdef.h) ──────────────────────────────────────────
RC_OK = 0
RC_ALREADY_INIT = 1
RC_INITLIB = -1
RC_INIT = -2
RC_NO_DEVICE = -3
RC_NOT_SUPPORT = -4
RC_INVALID_PARAM = -5
RC_OPEN = -6
RC_INVALID_HANDLE = -7
RC_CAPTURE = -8
RC_EXTRACT = -9
RC_ABORT = -10
RC_MEMORY = -11
RC_BUSY = -12
RC_ADD_FP = -13
RC_DEL_FP = -14
RC_FAIL = -17
RC_CANCEL = -18
RC_VERIFY_FP = -20
RC_MERGE = -22
RC_NOT_OPENED = -23
RC_NOT_INIT = -24
RC_ALREADY_OPENED = -25
RC_LOADIMAGE = -26
RC_ANALYSE_IMG = -27
RC_TIMEOUT = -28

_RC_MESSAGES = {
    RC_OK: "ok",
    RC_ALREADY_INIT: "already initialized",
    RC_INITLIB: "algorithm library init failed",
    RC_INIT: "capture engine init failed",
    RC_NO_DEVICE: "no device found",
    RC_NOT_SUPPORT: "interface not supported",
    RC_INVALID_PARAM: "invalid parameter",
    RC_OPEN: "open device failed",
    RC_INVALID_HANDLE: "invalid handle",
    RC_CAPTURE: "capture failed",
    RC_EXTRACT: "fingerprint template extraction failed",
    RC_ABORT: "aborted",
    RC_MEMORY: "not enough memory",
    RC_BUSY: "device busy",
    RC_ADD_FP: "add fingerprint template failed",
    RC_DEL_FP: "delete fingerprint failed",
    RC_FAIL: "operation failed",
    RC_CANCEL: "capture cancelled",
    RC_VERIFY_FP: "no match (verify/identify found nothing)",
    RC_MERGE: "merge registration templates failed",
    RC_NOT_OPENED: "device not opened",
    RC_NOT_INIT: "not initialized",
    RC_ALREADY_OPENED: "device already opened",
    RC_LOADIMAGE: "load image file failed",
    RC_ANALYSE_IMG: "analyse image failed",
    RC_TIMEOUT: "timeout",
}


class ZKError(RuntimeError):
    """Error raised by the ZKFinger SDK with a mapped message."""

    def __init__(self, rc: int, extra: str = ""):
        self.rc = rc
        msg = _RC_MESSAGES.get(rc, f"ZK error {rc}")
        if extra:
            msg = f"{msg} ({extra})"
        super().__init__(msg)


class Swipe(NamedTuple):
    image: bytes  # raw 8-bit grayscale
    template: bytes


class CaptureParams(NamedTuple):
    width: int
    height: int
    dpi: int


class ZKFinger:
    """Process-wide wrapper around libzkfp.dll.

    Call init() once, open()/close() the device around a capture session,
    and use db_*() for the matching cache. Serialize external callers.
    """

    def __init__(self) -> None:
        self._dll = ctypes.WinDLL(DLL_NAME)
        self._bind_signatures()
        self._initialized = False
        self._device = None

    def _bind_signatures(self) -> None:
        d = self._dll
        d.ZKFPM_Init.argtypes = []
        d.ZKFPM_Init.restype = ctypes.c_int
        d.ZKFPM_Terminate.argtypes = []
        d.ZKFPM_Terminate.restype = ctypes.c_int
        d.ZKFPM_GetDeviceCount.argtypes = []
        d.ZKFPM_GetDeviceCount.restype = ctypes.c_int
        d.ZKFPM_OpenDevice.argtypes = [ctypes.c_int]
        d.ZKFPM_OpenDevice.restype = ctypes.c_void_p
        d.ZKFPM_CloseDevice.argtypes = [ctypes.c_void_p]
        d.ZKFPM_CloseDevice.restype = ctypes.c_int
        d.ZKFPM_GetCaptureParamsEx.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
        ]
        d.ZKFPM_GetCaptureParamsEx.restype = ctypes.c_int
        d.ZKFPM_AcquireFingerprint.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(ctypes.c_uint),
        ]
        d.ZKFPM_AcquireFingerprint.restype = ctypes.c_int
        d.ZKFPM_DBInit.argtypes = []
        d.ZKFPM_DBInit.restype = ctypes.c_void_p
        d.ZKFPM_DBFree.argtypes = [ctypes.c_void_p]
        d.ZKFPM_DBFree.restype = ctypes.c_int
        d.ZKFPM_DBSetParameter.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
        d.ZKFPM_DBSetParameter.restype = ctypes.c_int
        d.ZKFPM_DBAdd.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.c_uint,
        ]
        d.ZKFPM_DBAdd.restype = ctypes.c_int
        d.ZKFPM_DBIdentify.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
            ctypes.POINTER(ctypes.c_uint),
        ]
        d.ZKFPM_DBIdentify.restype = ctypes.c_int
        d.ZKFPM_DBMerge.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(ctypes.c_uint),
        ]
        d.ZKFPM_DBMerge.restype = ctypes.c_int

    # ── lifecycle ───────────────────────────────────────────────────────────

    def init(self) -> None:
        if self._initialized:
            return
        rc = self._dll.ZKFPM_Init()
        if rc not in (RC_OK, RC_ALREADY_INIT):
            raise ZKError(rc)
        self._initialized = True

    def terminate(self) -> None:
        if not self._initialized:
            return
        rc = self._dll.ZKFPM_Terminate()
        self._initialized = False
        if rc != RC_OK:
            raise ZKError(rc)

    @property
    def initialized(self) -> bool:
        return self._initialized

    # ── device ──────────────────────────────────────────────────────────────

    def device_count(self) -> int:
        self.init()
        rc = self._dll.ZKFPM_GetDeviceCount()
        if rc not in (RC_OK, RC_ALREADY_INIT):
            raise ZKError(rc)
        return max(rc, 0)

    def open(self, index: int = 0) -> None:
        self.init()
        if self._device is not None:
            return
        handle = self._dll.ZKFPM_OpenDevice(index)
        if not handle:
            raise ZKError(RC_OPEN, f"device index {index}")
        self._device = handle

    def close(self) -> None:
        if self._device is None:
            return
        rc = self._dll.ZKFPM_CloseDevice(self._device)
        self._device = None
        if rc != RC_OK:
            raise ZKError(rc)

    @property
    def is_open(self) -> bool:
        return self._device is not None

    def capture_params(self) -> CaptureParams:
        if not self.is_open:
            raise ZKError(RC_NOT_OPENED)
        w = ctypes.c_int(0)
        h = ctypes.c_int(0)
        dpi = ctypes.c_int(0)
        rc = self._dll.ZKFPM_GetCaptureParamsEx(
            self._device, ctypes.byref(w), ctypes.byref(h), ctypes.byref(dpi)
        )
        if rc != RC_OK:
            raise ZKError(rc)
        return CaptureParams(w.value, h.value, dpi.value)

    def acquire(self, timeout_s: float = 30.0) -> Swipe:
        """Wait for a finger on the pad, return image + extracted template.

        The ZK9500 returns RC_CAPTURE ("capture failed") within milliseconds
        whenever there is no usable finger on the pad (finger not yet placed,
        between swipes, dry/partial press), so a fixed retry count would give
        up long before the requested timeout. Instead, keep retrying retryable
        errors (capture failed, extract failed, busy) until timeout_s elapses.
        Raises ZKError(RC_TIMEOUT) if no usable swipe arrives in time.
        """
        if not self.is_open:
            raise ZKError(RC_NOT_OPENED)
        params = self.capture_params()
        # Safety margin: width * height * 2 bytes (SDK may write slightly more)
        img_size = params.width * params.height * 2
        deadline = time.monotonic() + timeout_s
        log.debug("acquire: params=%s img_size=%d timeout=%.1fs",
                  params, img_size, timeout_s)

        attempt = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                log.error("acquire: no usable swipe within %.0fs", timeout_s)
                raise ZKError(RC_TIMEOUT, f"no swipe within {timeout_s:.0f}s")

            attempt += 1
            img_buf = (ctypes.c_ubyte * img_size)()
            tmpl_buf = (ctypes.c_ubyte * MAX_TEMPLATE_SIZE)()
            tmpl_len = ctypes.c_uint(MAX_TEMPLATE_SIZE)

            result: dict = {"rc": RC_TIMEOUT}

            def _run() -> None:
                result["rc"] = self._dll.ZKFPM_AcquireFingerprint(
                    self._device,
                    img_buf,
                    img_size,
                    tmpl_buf,
                    ctypes.byref(tmpl_len),
                )

            thread = threading.Thread(target=_run, daemon=True)
            thread.start()
            thread.join(remaining)
            if thread.is_alive():
                # SDK still blocking (waiting for a finger) when deadline hit
                log.error("acquire: SDK call still blocking after %.0fs", timeout_s)
                raise ZKError(RC_TIMEOUT, f"no swipe within {timeout_s:.0f}s")
            rc = result["rc"]
            if rc == RC_OK:
                img_len = params.width * params.height
                image = bytes(img_buf[: img_len if img_len <= img_size else img_size])
                template = bytes(tmpl_buf[: tmpl_len.value])
                if not template:
                    raise ZKError(RC_EXTRACT, "empty template returned")
                log.info("acquire: ok attempt=%d img=%dx%d tmpl=%dB",
                         attempt, params.width, params.height, len(template))
                return Swipe(image, template)

            # Retryable error? Keep trying until the deadline.
            if rc in _RETRYABLE_CAPTURE_RC:
                left = deadline - time.monotonic()
                sleep_s = min(0.3, max(left, 0.0))
                log.warning("acquire: retryable rc=%d (%s) attempt=%d — retrying in %.1fs (%.0fs left)",
                            rc, _RC_MESSAGES.get(rc, "unknown"), attempt, sleep_s, left)
                time.sleep(sleep_s)
                continue

            # Non-retryable error
            log.error("acquire: failed rc=%d (%s) attempt=%d",
                      rc, _RC_MESSAGES.get(rc, "unknown"), attempt)
            raise ZKError(rc)

    # ── matching cache (algorithm DB) ───────────────────────────────────────

    def db_init(self) -> None:
        self.init()
        handle = self._dll.ZKFPM_DBInit()
        if not handle:
            raise ZKError(RC_INITLIB, "DBInit failed")
        self._db = handle
        # Set default 1:N match threshold for better accuracy
        self.db_set_threshold(FP_MTHRESHOLD_CODE, DEFAULT_MTHRESHOLD)

    def db_free(self) -> None:
        if getattr(self, "_db", None) is None:
            return
        rc = self._dll.ZKFPM_DBFree(self._db)
        self._db = None
        if rc != RC_OK:
            raise ZKError(rc)

    def db_set_threshold(self, code: int, value: int) -> None:
        if getattr(self, "_db", None) is None:
            raise ZKError(RC_NOT_INIT, "db not initialized")
        rc = self._dll.ZKFPM_DBSetParameter(self._db, code, value)
        if rc != RC_OK:
            raise ZKError(rc)

    @staticmethod
    def _bytes_view(data: bytes) -> ctypes.Array:
        buf = (ctypes.c_ubyte * len(data))()
        buf[:] = data
        return buf

    def db_add(self, fid: int, template: bytes) -> None:
        if getattr(self, "_db", None) is None:
            raise ZKError(RC_NOT_INIT, "db not initialized")
        view = self._bytes_view(template)
        rc = self._dll.ZKFPM_DBAdd(
            self._db, fid, view, len(template)
        )
        if rc != RC_OK:
            raise ZKError(rc)

    def db_identify(self, template: bytes) -> tuple[int, int]:
        """1:N identify. Returns (fid, score); raises ZKError(RC_VERIFY_FP)
        when nothing matches."""
        if getattr(self, "_db", None) is None:
            raise ZKError(RC_NOT_INIT, "db not initialized")
        view = self._bytes_view(template)
        fid = ctypes.c_uint(0)
        score = ctypes.c_uint(0)
        rc = self._dll.ZKFPM_DBIdentify(
            self._db, view, len(template), ctypes.byref(fid), ctypes.byref(score)
        )
        if rc != RC_OK:
            raise ZKError(rc)
        return fid.value, score.value

    def db_merge(self, *templates: bytes) -> bytes:
        """Merge N (3 or more) swipe templates into one registration template."""
        if getattr(self, "_db", None) is None:
            raise ZKError(RC_NOT_INIT, "db not initialized")
        if len(templates) < 2:
            raise ZKError(RC_INVALID_PARAM, "need at least 2 swipe templates")
        # ZKFPM_DBMerge takes exactly three pointers; pad with the first
        # template when fewer/more are supplied.
        padded = list(templates[:3])
        while len(padded) < 3:
            padded.append(padded[0])
        views = [self._bytes_view(t) for t in padded]
        out = (ctypes.c_ubyte * MAX_TEMPLATE_SIZE)()
        out_len = ctypes.c_uint(MAX_TEMPLATE_SIZE)
        rc = self._dll.ZKFPM_DBMerge(
            self._db, views[0], views[1], views[2], out, ctypes.byref(out_len)
        )
        if rc != RC_OK:
            raise ZKError(rc)
        return bytes(out[: out_len.value])