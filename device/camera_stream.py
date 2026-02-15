#!/usr/bin/env python3
"""
Camera Streamer – serves MJPEG video over HTTP.

Supports two sources that can be switched at runtime via HTTP:
  GET /video          → MJPEG stream (current source)
  GET /source         → JSON with the active source info
  POST /source/camera → switch to live camera
  POST /source/file?path=video/drive.mp4 → switch to a video file (loops)
"""

import os
import time
import json
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

import cv2

# ── defaults ─────────────────────────────────────────────────────

STREAM_FPS = 30
JPEG_QUALITY = 70
VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video")


class CameraCapture:
    """Grabs JPEG frames from a camera or a video file.
    The source can be changed at runtime with switch_*() methods."""

    def __init__(self, camera_index: int = 0, default_file: Optional[str] = None):
        self._lock = threading.Lock()
        self._frame: bytes = b""
        self._camera_index = camera_index
        self._target_fps = STREAM_FPS

        # source bookkeeping
        self._source_label = "camera"
        self._source_detail = str(camera_index)
        self._cap: Optional[cv2.VideoCapture] = None
        self._is_file = False

        # Start with a video file if provided and it exists
        if default_file and os.path.isfile(default_file):
            self._open_file(default_file)
            self._source_label = "file"
            self._source_detail = default_file
            print(f"[camera_stream] Starting with file: {default_file}")
        else:
            self._open_camera(camera_index)
            if default_file:
                print(f"[camera_stream] File not found ({default_file}), falling back to camera")

        self._running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()

    # ── source switching (thread-safe) ───────────────────────────
    def switch_to_camera(self, camera_index: int = 0):
        with self._lock:
            self._release_cap()
            self._open_camera(camera_index)
            self._source_label = "camera"
            self._source_detail = str(camera_index)
        print(f"[camera_stream] Switched to camera {camera_index}")

    def switch_to_file(self, filepath: str):
        with self._lock:
            self._release_cap()
            self._open_file(filepath)
            self._source_label = "file"
            self._source_detail = filepath
        print(f"[camera_stream] Switched to file: {filepath}")

    def get_source_info(self) -> dict:
        with self._lock:
            return {"source": self._source_label, "detail": self._source_detail}

    # ── internal helpers ─────────────────────────────────────────
    def _open_camera(self, index: int):
        self._cap = cv2.VideoCapture(index)
        self._is_file = False
        self._target_fps = STREAM_FPS

    def _open_file(self, filepath: str):
        self._cap = cv2.VideoCapture(filepath)
        self._is_file = True
        # Use the video's native FPS for correct playback speed
        native_fps = self._cap.get(cv2.CAP_PROP_FPS)
        if native_fps > 0:
            self._target_fps = native_fps
            print(f"[camera_stream] File native FPS: {native_fps:.2f}")
        else:
            self._target_fps = STREAM_FPS
            print(f"[camera_stream] Could not detect file FPS, using {STREAM_FPS}")

    def _release_cap(self):
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    # ── capture loop ─────────────────────────────────────────────
    def _capture_loop(self):
        while self._running:
            t0 = time.monotonic()

            with self._lock:
                cap = self._cap
                is_file = self._is_file
                target_fps = self._target_fps

            if cap is None or not cap.isOpened():
                time.sleep(0.1)
                continue

            ret, frame = cap.read()

            # loop video files
            if not ret and is_file:
                with self._lock:
                    if self._cap is cap:          # still same source
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            if not ret:
                time.sleep(0.01)
                continue

            _, jpeg = cv2.imencode(
                ".jpg", frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
            )
            with self._lock:
                self._frame = jpeg.tobytes()

            # Sleep only the REMAINING time to hit target FPS
            elapsed = time.monotonic() - t0
            target_interval = 1.0 / target_fps
            remaining = target_interval - elapsed
            if remaining > 0:
                time.sleep(remaining)

    def get_frame(self) -> bytes:
        with self._lock:
            return self._frame

    def stop(self):
        self._running = False
        self._release_cap()


# ── HTTP handler ─────────────────────────────────────────────────
_camera: Optional[CameraCapture] = None


class StreamHandler(BaseHTTPRequestHandler):
    """
    Routes:
      GET  /video          → MJPEG stream
      GET  /source         → current source as JSON
      POST /source/camera  → switch to live camera
      POST /source/file?path=<relative_path>  → switch to video file
    """

    def do_GET(self):
        if self.path == "/video":
            self._serve_mjpeg()
        elif self.path == "/source":
            self._send_json(_camera.get_source_info())
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/source/camera":
            _camera.switch_to_camera()
            self._send_json({"ok": True, **_camera.get_source_info()})

        elif self.path.startswith("/source/file"):
            qs = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(qs)
            rel_path = params.get("path", [None])[0]
            if rel_path is None:
                self._send_json({"error": "missing ?path= parameter"}, code=400)
                return
            full_path = os.path.join(VIDEO_DIR, rel_path)
            if not os.path.isfile(full_path):
                self._send_json({"error": f"file not found: {full_path}"}, code=404)
                return
            _camera.switch_to_file(full_path)
            self._send_json({"ok": True, **_camera.get_source_info()})
        else:
            self.send_error(404)

    # ── helpers ──────────────────────────────────────────────────
    def _serve_mjpeg(self):
        self.send_response(200)
        self.send_header("Content-Type",
                         "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while True:
                frame = _camera.get_frame()
                if not frame:
                    time.sleep(0.05)
                    continue
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(("Content-Length: %d\r\n" % len(frame)).encode())
                self.wfile.write(b"\r\n")
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
                time.sleep(1.0 / STREAM_FPS)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # suppress per-request logs


def start_camera_stream(host: str = "0.0.0.0", port: int = 5000):
    """Start the HTTP server (blocking)."""
    global _camera
    default_video = os.path.join(VIDEO_DIR, "drive.mp4")
    _camera = CameraCapture(default_file=default_video)
    server = HTTPServer((host, port), StreamHandler)
    print(f"[camera_stream] Streaming on http://{host}:{port}/video")
    print(f"[camera_stream] Switch source via POST /source/camera or /source/file?path=...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _camera.stop()
        server.server_close()


if __name__ == "__main__":
    start_camera_stream()
