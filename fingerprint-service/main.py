"""Entry point. Start order: XAMPP MySQL -> this service -> `npm run dev`.

    cd fingerprint-service
    pip install -r requirements.txt
    python main.py
"""
import asyncio
import sys

import config
import database
from enrollment_handler import EnrollmentHandler
from identification_handler import IdentificationLoop
from websocket_server import KioskServer
from winbio_api import WinBioReader


def main():
    print("RCC-HIROS fingerprint service", flush=True)

    ok, msg = database.check_connection()
    if not ok:
        print("MySQL %s:%s/%s unreachable: %s" % (
            config.DB_HOST, config.DB_PORT, config.DB_NAME, msg), flush=True)
        print("Start MySQL in XAMPP first.", flush=True)
        sys.exit(1)
    print("MySQL connected (%s/%s)" % (config.DB_HOST, config.DB_NAME), flush=True)

    reader = WinBioReader()
    if reader.available:
        print("Fingerprint reader ready (unit %d)" % reader.unit_id, flush=True)
    else:
        print("WARNING: %s" % (reader.error or "reader unavailable"), flush=True)
        print("Service runs in no-reader mode; kiosk will show the message.", flush=True)

    enrollment = EnrollmentHandler(reader)
    server = KioskServer(reader, enrollment)

    loop = IdentificationLoop(reader, on_event=server.emit)
    loop.start()

    try:
        print("WebSocket listening on ws://%s:%d" % (
            config.WS_HOST, config.WS_PORT), flush=True)
        asyncio.run(server.serve())
    except KeyboardInterrupt:
        pass
    finally:
        loop.stop()
        reader.close()
        print("Stopped.", flush=True)


if __name__ == "__main__":
    main()
