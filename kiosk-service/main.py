"""Entry point: python kiosk-service\\main.py"""
import uvicorn

from server import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
