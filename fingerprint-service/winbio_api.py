"""ctypes wrapper around Windows Biometric Framework (winbio.dll).

Enrollment stores the WinBio template GUID; identification returns it, and
database.py maps the GUID back to an employee (templateData column).

If winbio.dll is missing or no sensor is present, the reader reports
connected=False and the service keeps running (kiosk shows a message).
"""
import ctypes
from ctypes import wintypes

WINBIO_TYPE_FINGERPRINT = 0x00000008
WINBIO_POOL_SYSTEM = 0x00000001
WINBIO_FLAG_DEFAULT = 0x00000000
WINBIO_ID_TYPE_GUID = 2
WINBIO_SUBTYPE_ANY = 0xFF
WINBIO_I_MORE_DATA = 0x00260012
S_OK = 0x00000000


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
        ("Account", GUID),  # placeholder; only GUID path is read
    ]


class WINBIO_IDENTITY(ctypes.Structure):
    _fields_ = [("Type", wintypes.ULONG), ("Value", _IdentityValue)]


def _guid_to_str(g):
    b = bytes(g.Data4)
    return "%08X-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X" % (
        g.Data1, g.Data2, g.Data3,
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    )


class WinBioReader:
    def __init__(self):
        self.dll = None
        self.session = wintypes.HANDLE(0)
        self.unit_id = 0
        self.available = False
        self.error = ""
        self._open()

    # -- setup ------------------------------------------------------
    def _open(self):
        try:
            self.dll = ctypes.WinDLL("winbio.dll")
        except OSError as exc:
            self.error = "winbio.dll not found: %s" % exc
            return
        # NOTE: WinBioLocateSensor can block forever when no sensor is
        # attached, so session setup runs in a thread with a timeout.
        import threading
        outcome = {}

        def _setup():
            try:
                self._open_session(outcome)
            except Exception as exc:  # noqa: BLE001
                outcome["error"] = str(exc)

        worker = threading.Thread(target=_setup, daemon=True)
        worker.start()
        worker.join(timeout=10)
        if worker.is_alive():
            self.error = ("Sensor detection timed out — no fingerprint reader "
                          "attached?")
            return
        if "error" in outcome:
            self.error = outcome["error"]

    def _open_session(self, outcome):
        try:
            self._bind()
            session = wintypes.HANDLE(0)
            hr = self.dll.WinBioOpenSession(
                wintypes.DWORD(WINBIO_TYPE_FINGERPRINT),
                wintypes.DWORD(WINBIO_POOL_SYSTEM),
                wintypes.DWORD(WINBIO_FLAG_DEFAULT),
                None, 0, None,
                ctypes.byref(session),
            )
            if hr != S_OK:
                self.error = "WinBioOpenSession failed: 0x%08X" % (hr & 0xFFFFFFFF)
                return
            self.session = session
            unit = wintypes.DWORD(0)
            hr = self.dll.WinBioLocateSensor(session, ctypes.byref(unit))
            if hr != S_OK:
                self.error = "No fingerprint sensor found: 0x%08X" % (hr & 0xFFFFFFFF)
                self.dll.WinBioCloseSession(session)
                self.session = wintypes.HANDLE(0)
                return
            self.unit_id = unit.value
            self.available = True
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)

    def _bind(self):
        d = self.dll
        d.WinBioOpenSession.argtypes = [
            wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
            ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p,
            ctypes.POINTER(wintypes.HANDLE),
        ]
        d.WinBioOpenSession.restype = wintypes.DWORD
        d.WinBioCloseSession.argtypes = [wintypes.HANDLE]
        d.WinBioCloseSession.restype = wintypes.DWORD
        d.WinBioLocateSensor.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        d.WinBioLocateSensor.restype = wintypes.DWORD
        d.WinBioEnrollBegin.argtypes = [wintypes.HANDLE, ctypes.c_ubyte, wintypes.DWORD]
        d.WinBioEnrollBegin.restype = wintypes.DWORD
        d.WinBioEnrollCapture.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.ULONG)]
        d.WinBioEnrollCapture.restype = wintypes.DWORD
        d.WinBioEnrollCommit.argtypes = [
            wintypes.HANDLE, ctypes.POINTER(WINBIO_IDENTITY),
            ctypes.POINTER(wintypes.BOOL),
        ]
        d.WinBioEnrollCommit.restype = wintypes.DWORD
        d.WinBioEnrollDiscard.argtypes = [wintypes.HANDLE]
        d.WinBioEnrollDiscard.restype = wintypes.DWORD
        d.WinBioIdentify.argtypes = [
            wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD),
            ctypes.POINTER(WINBIO_IDENTITY), ctypes.POINTER(ctypes.c_ubyte),
            ctypes.POINTER(wintypes.ULONG),
        ]
        d.WinBioIdentify.restype = wintypes.DWORD
        d.WinBioCancel.argtypes = [wintypes.HANDLE]
        d.WinBioCancel.restype = wintypes.DWORD

    def close(self):
        if self.dll and self.session:
            try:
                self.dll.WinBioCloseSession(self.session)
            except Exception:  # noqa: BLE001
                pass
            self.session = wintypes.HANDLE(0)
            self.available = False

    # -- enrollment ---------------------------------------------------
    def enroll(self, progress_cb=None, cancel_flag=None):
        """Blocking. Returns (guid_str, quality) or raises RuntimeError."""
        if not self.available:
            raise RuntimeError(self.error or "Reader not available")
        d = self.dll
        hr = d.WinBioEnrollBegin(self.session, ctypes.c_ubyte(WINBIO_SUBTYPE_ANY), 0)
        if hr != S_OK:
            raise RuntimeError("Enroll begin failed: 0x%08X" % (hr & 0xFFFFFFFF))
        rejects = 0
        try:
            while True:
                if cancel_flag and cancel_flag():
                    d.WinBioCancel(self.session)
                    d.WinBioEnrollDiscard(self.session)
                    raise RuntimeError("Enrollment cancelled")
                reject = wintypes.ULONG(0)
                hr = d.WinBioEnrollCapture(self.session, ctypes.byref(reject))
                if hr == WINBIO_I_MORE_DATA:
                    if progress_cb:
                        progress_cb("Sample accepted — lift and place the finger again")
                elif hr == S_OK:
                    break
                else:
                    if reject.value != 0:
                        rejects += 1
                        if progress_cb:
                            progress_cb("Poor scan — try again (reject %d)" % reject.value)
                        continue
                    raise RuntimeError("Capture failed: 0x%08X" % (hr & 0xFFFFFFFF))
            identity = WINBIO_IDENTITY()
            is_new = wintypes.BOOL(False)
            hr = d.WinBioEnrollCommit(self.session, ctypes.byref(identity), ctypes.byref(is_new))
            if hr != S_OK:
                raise RuntimeError("Enroll commit failed: 0x%08X" % (hr & 0xFFFFFFFF))
            if identity.Type != WINBIO_ID_TYPE_GUID:
                raise RuntimeError("Unexpected identity type %d" % identity.Type)
            quality = max(0, 100 - rejects * 15)
            return _guid_to_str(identity.Value.TemplateGuid), quality
        except Exception:
            try:
                d.WinBioEnrollDiscard(self.session)
            except Exception:  # noqa: BLE001
                pass
            raise

    # -- identification -------------------------------------------------
    def identify(self):
        """Blocking until a finger is presented. Returns (guid_str, sub_factor)."""
        if not self.available:
            raise RuntimeError(self.error or "Reader not available")
        unit = wintypes.DWORD(0)
        identity = WINBIO_IDENTITY()
        sub = ctypes.c_ubyte(0)
        reject = wintypes.ULONG(0)
        hr = self.dll.WinBioIdentify(
            self.session, ctypes.byref(unit),
            ctypes.byref(identity), ctypes.byref(sub), ctypes.byref(reject),
        )
        if hr != S_OK:
            raise RuntimeError("Identify failed: 0x%08X" % (hr & 0xFFFFFFFF))
        if identity.Type != WINBIO_ID_TYPE_GUID:
            raise RuntimeError("Unknown finger (no enrolled template matched)")
        return _guid_to_str(identity.Value.TemplateGuid), sub.value
