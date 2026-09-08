"""Background identification loop: scan -> match -> toggle clock in/out."""
import threading
import time

import database


class IdentificationLoop(threading.Thread):
    daemon = True

    def __init__(self, reader, on_event):
        super().__init__(name="identify-loop")
        # on_event(payload: dict) — called from this thread; must be thread-safe
        self.reader = reader
        self.on_event = on_event
        self._stop = threading.Event()
        self._last_guid = ""
        self._last_time = 0.0

    def stop(self):
        self._stop.set()

    def run(self):
        while not self._stop.is_set():
            if not self.reader.available:
                time.sleep(3)
                continue
            try:
                guid, _sub = self.reader.identify()
            except RuntimeError:
                time.sleep(0.5)
                continue
            # Debounce: same finger re-scanned within 5s is ignored
            now = time.time()
            if guid == self._last_guid and (now - self._last_time) < 5:
                continue
            self._last_guid = guid
            self._last_time = now
            try:
                owner = database.find_owner_by_guid(guid)
            except Exception as exc:  # noqa: BLE001
                self.on_event({"type": "error",
                               "message": "Database error: %s" % exc})
                continue
            if owner is None:
                self.on_event({"type": "unknown",
                               "message": "Fingerprint not recognized"})
                continue
            try:
                action, at = database.toggle_attendance(owner["id"])
            except Exception as exc:  # noqa: BLE001
                self.on_event({"type": "error",
                               "message": "Database error: %s" % exc})
                continue
            self.on_event({
                "type": "attendance",
                "employeeId": owner["id"],
                "employeeCode": owner["code"],
                "name": "%s %s" % (owner["firstName"], owner["lastName"]),
                "action": action,
                "time": at,
            })
