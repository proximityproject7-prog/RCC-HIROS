"""WebSocket server (ws://localhost:8765) for the Next.js kiosk UI.

Client -> server:
  {"type":"status"}
  {"type":"enroll_begin","employeeId","fingerIndex"}
  {"type":"enroll_cancel"}
Server -> client(s):
  {"type":"reader_status","connected","message"}
  {"type":"enroll_progress","message"} / {"type":"enroll_complete",...}
  {"type":"enroll_error","message"}
  {"type":"attendance",...} / {"type":"unknown",...} / {"type":"error",...}
"""
import asyncio
import json

import websockets

import config


class KioskServer:
    def __init__(self, reader, enrollment):
        self.reader = reader
        self.enrollment = enrollment
        self.clients = set()
        self.loop = None

    # -- broadcast (thread-safe; callable from the identify thread) ----
    def emit(self, payload):
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self.loop)

    async def _broadcast(self, payload):
        if not self.clients:
            return
        msg = json.dumps(payload)
        dead = set()
        for ws in self.clients:
            try:
                await ws.send(msg)
            except Exception:  # noqa: BLE001
                dead.add(ws)
        self.clients -= dead

    def reader_status(self):
        return {
            "type": "reader_status",
            "connected": self.reader.available,
            "message": "Reader ready" if self.reader.available
                       else (self.reader.error or "Reader not available"),
        }

    # -- per-client handler ---------------------------------------------
    async def handler(self, ws, *_args):
        self.clients.add(ws)
        try:
            await ws.send(json.dumps(self.reader_status()))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                await self._on_message(ws, msg if isinstance(msg, dict) else {})
        finally:
            self.clients.discard(ws)

    async def _on_message(self, ws, msg):
        kind = msg.get("type")
        if kind == "ping":
            await ws.send(json.dumps({"type": "pong"}))
        elif kind == "status":
            await ws.send(json.dumps(self.reader_status()))
        elif kind == "enroll_begin":
            employee_pk = str(msg.get("employeeId") or "")
            try:
                finger_index = int(msg.get("fingerIndex", 0))
            except (TypeError, ValueError):
                finger_index = 0
            if not employee_pk:
                await ws.send(json.dumps({"type": "enroll_error",
                                          "message": "employeeId is required"}))
                return

            async def _send(payload):
                try:
                    await ws.send(json.dumps(payload))
                except Exception:  # noqa: BLE001
                    pass

            await self.enrollment.run(employee_pk, finger_index, _send)
        elif kind == "enroll_cancel":
            self.enrollment.cancel()
            await ws.send(json.dumps({"type": "enroll_error",
                                      "message": "Enrollment cancelled"}))

    async def serve(self):
        self.loop = asyncio.get_running_loop()
        async with websockets.serve(self.handler, config.WS_HOST, config.WS_PORT):
            await asyncio.Future()  # run forever
