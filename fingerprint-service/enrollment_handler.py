"""Single-slot enrollment flow driven by WebSocket messages from the browser."""
import asyncio
import threading

import database


class EnrollmentHandler:
    def __init__(self, reader):
        self.reader = reader
        self._lock = threading.Lock()
        self._active = False
        self._cancel = False

    @property
    def busy(self):
        with self._lock:
            return self._active

    def cancel(self):
        with self._lock:
            self._cancel = True

    def _cancelled(self):
        with self._lock:
            return self._cancel

    async def run(self, employee_pk, finger_index, send):
        """Capture samples; send() is an async callback for progress messages."""
        with self._lock:
            if self._active:
                await send({"type": "enroll_error",
                            "message": "Another enrollment is already in progress"})
                return
            self._active = True
            self._cancel = False

        try:
            if not self.reader.available:
                await send({"type": "enroll_error",
                            "message": self.reader.error or "Reader not available"})
                return
            if database.count_templates(employee_pk) >= 2:
                await send({"type": "enroll_error",
                            "message": "Maximum of 2 fingerprints per employee"})
                return

            await send({"type": "enroll_progress",
                        "message": "Place the finger on the reader"})

            loop = asyncio.get_running_loop()

            def _progress(msg):
                asyncio.run_coroutine_threadsafe(send({
                    "type": "enroll_progress", "message": msg,
                }), loop)

            guid, quality = await loop.run_in_executor(
                None, lambda: self.reader.enroll(
                    progress_cb=_progress, cancel_flag=self._cancelled)
            )
            await send({"type": "enroll_complete", "templateData": guid,
                        "fingerIndex": finger_index, "quality": quality,
                        "hint": "Save this template via POST /api/biometric/enroll"})
        except RuntimeError as exc:
            await send({"type": "enroll_error", "message": str(exc)})
        finally:
            with self._lock:
                self._active = False
                self._cancel = False
