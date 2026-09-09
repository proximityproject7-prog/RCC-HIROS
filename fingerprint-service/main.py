"""Fingerprint attendance service — WebSocket server.

Connects to Windows Biometric Framework via ctypes (winbio.dll).
Exposes two operations over WebSocket:
  - identify: scan finger → return employee info
  - enroll: enroll finger for an employee → store template

The Next.js login page connects via WebSocket to this service.
"""
import asyncio
import json
import logging
import signal
import sys

import websockets
from websockets.server import serve

import winbio_api as wb
import database as db
import enrollment_handler
import identification_handler
from config import WS_HOST, WS_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fingerprint-service")

# Track connected Next.js clients
connected_clients: set = set()
service_ready = False


async def handle_identify(websocket) -> dict:
    """Handle identify request from login page."""
    result = identification_handler.handle_identify()
    return result


async def handle_enroll(websocket, data: dict) -> dict:
    """Handle enrollment request from admin profile page."""
    employee_id = data.get("employeeId")
    finger_index = data.get("fingerIndex", 0)
    if not employee_id:
        return {"success": False, "message": "Missing employeeId"}
    result = enrollment_handler.handle_enroll(employee_id, finger_index)
    return result


async def handle_delete(websocket, data: dict) -> dict:
    """Handle template deletion request."""
    template_id = data.get("templateId")
    employee_id = data.get("employeeId")
    if template_id:
        ok = db.delete_template(template_id)
        return {"success": ok, "message": "Deleted" if ok else "Not found"}
    elif employee_id:
        count = db.delete_all_templates(employee_id)
        return {"success": True, "message": f"Deleted {count} template(s)"}
    return {"success": False, "message": "Missing templateId or employeeId"}


async def handle_get_templates(websocket, data: dict) -> dict:
    """Handle get templates request."""
    employee_id = data.get("employeeId")
    if not employee_id:
        return {"success": False, "message": "Missing employeeId"}
    templates = db.get_templates(employee_id)
    return {
        "success": True,
        "templates": [
            {
                "id": t["id"],
                "fingerIndex": t["fingerIndex"],
                "quality": t["quality"],
                "createdAt": str(t["createdAt"]),
            }
            for t in templates
        ],
    }


async def handler(websocket):
    """Handle a single WebSocket connection."""
    connected_clients.add(websocket)
    log.info(f"Client connected ({len(connected_clients)} total)")
    try:
        # Send initial status
        await websocket.send(json.dumps({
            "type": "status",
            "connected": wb.has_winbio() and wb.open_session(),
            "readerReady": wb.locate_sensor(timeout_ms=5000) if wb.has_winbio() else False,
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                op = data.get("op")
                req_id = data.get("id")

                if op == "identify":
                    result = await handle_identify(websocket)
                elif op == "enroll":
                    result = await handle_enroll(websocket, data)
                elif op == "delete":
                    result = await handle_delete(websocket, data)
                elif op == "getTemplates":
                    result = await handle_get_templates(websocket, data)
                elif op == "ping":
                    result = {"success": True, "message": "pong"}
                else:
                    result = {"success": False, "message": f"Unknown op: {op}"}

                await websocket.send(json.dumps({
                    "type": "result",
                    "op": op,
                    "id": req_id,
                    **result,
                }))
            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
            except Exception as e:
                log.exception("Error handling message")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": str(e),
                }))
    finally:
        connected_clients.discard(websocket)
        log.info(f"Client disconnected ({len(connected_clients)} total)")


async def main():
    global service_ready

    # Open WinBio session
    if wb.has_winbio():
        if wb.open_session():
            log.info("WinBio session opened")
            sensor_ok = wb.locate_sensor(timeout_ms=5000)
            if sensor_ok:
                log.info("Fingerprint sensor detected")
                service_ready = True
            else:
                log.warning("No fingerprint sensor found — running in no-reader mode")
                service_ready = True  # still serve, just no reader
        else:
            log.error("Failed to open WinBio session")
            service_ready = True  # serve anyway
    else:
        log.warning("winbio.dll not available — running in no-reader mode")
        service_ready = True

    # Start WebSocket server
    stop = asyncio.get_event_loop().create_future()

    def handle_signal():
        if not stop.done():
            stop.set_result(None)

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass  # Windows

    log.info(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
    async with serve(handler, WS_HOST, WS_PORT):
        await stop

    wb.close_session()
    log.info("Service stopped")


if __name__ == "__main__":
    asyncio.run(main())
