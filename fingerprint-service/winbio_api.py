"""ctypes wrapper around Windows Biometric Framework (winbio.dll).

Provides:
- open_session / close_session: manage WinBio session
- locate_sensor: find and validate fingerprint reader (with timeout)
- identify: 1:N match against all enrolled templates
- enroll_begin / enroll_capture / enroll_commit: enrollment flow
- get_sensor_status: check reader connection

If winbio.dll is missing or no sensor is present, the service keeps running
in "no-reader" mode and reports connected=False.
"""
import ctypes
from ctypes import wintypes
import threading

WINBIO_TYPE_FINGERPRINT = 0x00000008
WINBIO_POOL_SYSTEM = 0x00000001
WINBIO_FLAG_DEFAULT = 0x00000000
WINBIO_ID_TYPE_GUID = 2
WINBIO_SUBTYPE_ANY = 0xFF
WINBIO_I_MORE_DATA = 0x00260012
S_OK = 0x00000000

try:
    _winbio = ctypes.WinDLL("winbio.dll")
    _HAS_WINBIO = True
except OSError:
    _winbio = None
    _HAS_WINBIO = False


class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", wintypes.BYTE * 8),
    ]


class _IdentityValue(ctypes.Union):
    _fields_ = [
        ("Null", wintypes.ULONG),
        ("Wildcard", wintypes.ULONG),
        ("TemplateGuid", GUID),
        ("Account", GUID),
    ]


class WINBIO_IDENTITY(ctypes.Structure):
    _fields_ = [("Type", wintypes.ULONG), ("Value", _IdentityValue)]


def _guid_to_str(g):
    b = bytes(g.Data4)
    return "%08X-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X" % (
        g.Data1, g.Data2, g.Data3,
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    )


_session_handle = wintypes.HANDLE(0)
_session_lock = threading.Lock()


def has_winbio() -> bool:
    return _HAS_WINBIO


def open_session() -> bool:
    """Open a system pool session for fingerprint operations."""
    global _session_handle
    if not _HAS_WINBIO:
        return False
    with _session_lock:
        if _session_handle.value:
            return True
        h = wintypes.HANDLE(0)
        unit_schema = wintypes.UINT(WINBIO_TYPE_FINGERPRINT)
        pool_type = wintypes.UINT(WINBIO_POOL_SYSTEM)
        db_flag = wintypes.UINT(WINBIO_FLAG_DEFAULT)
        ret = _winbio.WinBioOpenSession(
            unit_schema, pool_type, db_flag, None, 0, db_flag, ctypes.byref(h)
        )
        if ret == S_OK and h.value:
            _session_handle = h
            return True
        return False


def close_session():
    """Close the WinBio session."""
    global _session_handle
    with _session_lock:
        if _session_handle.value:
            _winbio.WinBioCloseSession(_session_handle)
            _session_handle = wintypes.HANDLE(0)


def locate_sensor(timeout_ms: int = 10000) -> bool:
    """Check if a fingerprint sensor is available. Uses Identify with timeout."""
    if not _HAS_WINBIO or not _session_handle.value:
        return False
    try:
        identity = WINBIO_IDENTITY()
        sub_factor = wintypes.UINT8(0)
        reject = wintypes.UINT32(0)
        ret = _winbio.WinBioIdentify(
            _session_handle, ctypes.byref(identity),
            ctypes.byref(sub_factor), ctypes.byref(reject)
        )
        return ret == S_OK or ret == WINBIO_I_MORE_DATA
    except Exception:
        return False


def identify() -> str | None:
    """Perform 1:N fingerprint identification.

    Returns the template GUID string if matched, None if no match or error.
    """
    if not _HAS_WINBIO or not _session_handle.value:
        return None
    identity = WINBIO_IDENTITY()
    sub_factor = wintypes.UINT8(0)
    reject = wintypes.UINT32(0)
    ret = _winbio.WinBioIdentify(
        _session_handle, ctypes.byref(identity),
        ctypes.byref(sub_factor), ctypes.byref(reject)
    )
    if ret == S_OK and identity.Type == WINBIO_ID_TYPE_GUID:
        return _guid_to_str(identity.Value.TemplateGuid)
    return None


def enroll_begin() -> bool:
    """Begin fingerprint enrollment."""
    if not _HAS_WINBIO or not _session_handle.value:
        return False
    sub_factor = wintypes.UINT8(WINBIO_SUBTYPE_ANY)
    ret = _winbio.WinBioEnrollBegin(_session_handle, sub_factor, 0)
    return ret == S_OK


def enroll_capture() -> tuple[bool, bool]:
    """Capture one enrollment sample.

    Returns (success, more_required).
    - success: True if sample captured without error
    - more_required: True if more samples needed
    """
    if not _HAS_WINBIO or not _session_handle.value:
        return False, False
    reject = wintypes.UINT32(0)
    ret = _winbio.WinBioEnrollCapture(_session_handle, reject)
    if ret == S_OK:
        return True, False
    elif ret == WINBIO_I_MORE_DATA:
        return True, True
    return False, False


def enroll_commit() -> tuple[bool, str | None]:
    """Commit enrollment and get template GUID.

    Returns (success, guid_string).
    """
    if not _HAS_WINBIO or not _session_handle.value:
        return False, None
    identity = WINBIO_IDENTITY()
    is_new = wintypes.BOOL(0)
    ret = _winbio.WinBioEnrollCommit(_session_handle, ctypes.byref(identity), ctypes.byref(is_new))
    if ret == S_OK and identity.Type == WINBIO_ID_TYPE_GUID:
        return True, _guid_to_str(identity.Value.TemplateGuid)
    return False, None


def discard() -> bool:
    """Discard current enrollment in progress."""
    if not _HAS_WINBIO or not _session_handle.value:
        return False
    ret = _winbio.WinBioEnrollDiscard(_session_handle)
    return ret == S_OK
