#!/usr/bin/env python3
"""
Camera Streamer – streams MJPEG video from the camera
over HTTP so the backend can consume it.

Uses OpenCV VideoCapture to grab frames from the default camera device.
"""

import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

import cv2

# ── Resolution / FPS ─────────────────────────────────────────────
STREAM_WIDTH = 640
STREAM_HEIGHT = 480
STREAM_FPS = 15
JPEG_QUALITY = 70


class CameraCapture:
    """Grabs JPEG frames from the camera via OpenCV."""

    def __init__(self, camera_index: int = 0):
        self._lock = threading.Lock()
        self._frame: bytes = b""

        self._cap = cv2.VideoCapture(camera_index)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, STREAM_WIDTH)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, STREAM_HEIGHT)

        self._running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()

    # ── capture loop ──────────────────────────────────────────────
    def _capture_loop(self):
        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                time.sleep(0.01)
                continue
            _, jpeg = cv2.imencode(
                ".jpg", frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
            )
            with self._lock:
                self._frame = jpeg.tobytes()

            time.sleep(1.0 / STREAM_FPS)

    def get_frame(self) -> bytes:
        with self._lock:
            return self._frame

    def stop(self):
        self._running = False
        self._cap.release()


# ── MJPEG HTTP handler ───────────────────────────────────────────
_camera: Optional[CameraCapture] = None


class MJPEGHandler(BaseHTTPRequestHandler):
    """Serves an MJPEG stream on GET /video."""

    def do_GET(self):
        if self.path != "/video":
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type",
                         "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        try:
            while True:
                frame = _camera.get_frame()
                if not frame:
                    time.sleep(0.05)
                    continue
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(frame)}\r\n".encode())
                self.wfile.write(b"\r\n")
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
                time.sleep(1.0 / STREAM_FPS)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        """Suppress per‑request logs to keep console clean."""
        pass


def start_camera_stream(host: str = "0.0.0.0", port: int = 5000):
    """Start the MJPEG HTTP server (blocking)."""
    global _camera
    _camera = CameraCapture()
    server = HTTPServer((host, port), MJPEGHandler)
    print(f"[camera_stream] MJPEG stream on http://{host}:{port}/video")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _camera.stop()
        server.server_close()


if __name__ == "__main__":
    start_camera_stream()
