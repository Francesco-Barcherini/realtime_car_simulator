#!/usr/bin/env python3
"""
Vision Pipeline – orchestrates video capture → YOLO detection → depth
estimation and publishes results via MQTT.

Architecture (decoupled):
  • _FrameGrabber    – background thread, reads MJPEG at stream FPS,
                       always holds the latest frame.
  • AI thread        – grabs latest frame, runs YOLO + ViTS (~15 FPS),
                       stores detections + depth heatmap in shared state.
  • Debug publisher  – runs at ~30 FPS, grabs latest frame, overlays
                       the *last known* bboxes persistently, publishes
                       annotated + heatmap on ai/debug.
"""

import time
import json
import base64
import threading
import cv2
import numpy as np
import paho.mqtt.client as mqtt

from .detector import ObjectDetector
from .depth_estimator import DepthEstimator

# Colors for bounding boxes per class (BGR)
_CLASS_COLORS = {
    "person":        (107, 107, 255),   # red-ish
    "bicycle":       (196, 205, 78),    # teal
    "car":           (209, 183, 69),    # blue-ish
    "motorcycle":    (122, 160, 255),   # orange-ish
    "bus":           (200, 216, 152),   # green-ish
    "truck":         (231, 92, 108),    # purple-ish
    "traffic light": (110, 203, 253),   # yellow-ish
    "stop sign":     (85, 112, 225),    # salmon
}

# ── Target debug FPS (how often we publish annotated frames) ─────
_DEBUG_FPS = 30


def _annotate_frame(frame: np.ndarray, detections: list) -> np.ndarray:
    """Draw bboxes with class, id, and distance on a copy of the frame."""
    vis = frame.copy()
    for det in detections:
        cx, cy, w, h = det["bbox"]
        x1 = int(cx - w / 2)
        y1 = int(cy - h / 2)
        x2 = int(cx + w / 2)
        y2 = int(cy + h / 2)

        color = _CLASS_COLORS.get(det["class"], (0, 255, 0))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)

        dist_str = f'{det["distance"]:.1f}' if det.get("distance") is not None else "?"
        label = f'{det["class"]} #{det["id"]} d:{dist_str}'
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)

        # Place label inside the bbox when it would go above the image
        if y1 - th - 6 < 0:
            cv2.rectangle(vis, (x1, y1), (x1 + tw + 4, y1 + th + 6), color, -1)
            cv2.putText(vis, label, (x1 + 2, y1 + th + 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        else:
            cv2.rectangle(vis, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
            cv2.putText(vis, label, (x1 + 2, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return vis


def _depth_to_heatmap(depth_map: np.ndarray) -> np.ndarray:
    """Convert a float32 depth map to a BGR colormap image."""
    if depth_map is None:
        return np.zeros((480, 640, 3), dtype=np.uint8)
    norm = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX)
    gray = norm.astype(np.uint8)
    return cv2.applyColorMap(gray, cv2.COLORMAP_MAGMA)


def _encode_jpeg_b64(image: np.ndarray, quality: int = 60) -> str:
    """Encode a BGR image to a base64 JPEG string."""
    _, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return base64.b64encode(buf.tobytes()).decode("ascii")


class _FrameGrabber:
    """Continuously reads frames in a background thread, always providing
    the most recent one.  This avoids OpenCV buffer lag on MJPEG streams."""

    def __init__(self, url: str):
        self.url = url
        self._cap = cv2.VideoCapture(url)
        self._lock = threading.Lock()
        self._frame = None
        self._ret = False
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                time.sleep(0.1)
                continue
            with self._lock:
                self._ret = ret
                self._frame = frame

    def is_opened(self) -> bool:
        return self._cap.isOpened()

    def get_latest(self):
        """Return (True, frame) for the most recent frame, or (False, None)."""
        with self._lock:
            if self._frame is not None:
                return self._ret, self._frame.copy()
            return False, None

    def stop(self):
        self._running = False
        if self._cap is not None:
            self._cap.release()


class VisionPipeline:
    """
    Decoupled pipeline:
      • AI thread    – YOLO + ViTS at model speed (~15 FPS).
      • Debug thread – overlays persistent bboxes at stream FPS (~30 FPS).
    """

    def __init__(
        self,
        stream_url: str,
        mqtt_client: mqtt.Client,
        yolo_model: str = "yolo11n.pt",
        depth_model: str = "depth-anything/Depth-Anything-V2-Small-hf",
        device: str = "cpu",
    ):
        self.stream_url = stream_url
        self.mqtt = mqtt_client

        print("[pipeline] Loading YOLO model …")
        self.detector = ObjectDetector(model_name=yolo_model, device=device)

        print("[pipeline] Loading depth model (ViTS) …")
        self.estimator = DepthEstimator(model_name=depth_model, device=device)

        self._running = False
        self._grabber = None

        # ── shared state between AI thread and debug thread ──────
        self._state_lock = threading.Lock()
        self._last_detections: list = []       # latest detections with distance
        self._last_depth_map = None            # latest depth map (np.ndarray)

    # ────────────────────────────────────────────────────────────
    #  Public API
    # ────────────────────────────────────────────────────────────
    def start(self):
        """Open the video stream and launch AI + debug threads."""
        self._running = True

        # Wait for the camera stream to become available
        print(f"[pipeline] Waiting for stream: {self.stream_url}")
        self._grabber = _FrameGrabber(self.stream_url)
        while not self._grabber.is_opened() and self._running:
            print("[pipeline] Stream not available – retrying in 3 s…")
            self._grabber.stop()
            time.sleep(3)
            self._grabber = _FrameGrabber(self.stream_url)

        if not self._running:
            self._grabber.stop()
            return

        print(f"[pipeline] Connected to stream: {self.stream_url}")

        # Launch both threads
        ai_thread = threading.Thread(target=self._ai_loop, daemon=True,
                                     name="pipeline-ai")
        debug_thread = threading.Thread(target=self._debug_loop, daemon=True,
                                        name="pipeline-debug")
        ai_thread.start()
        debug_thread.start()

        # Block until stopped
        try:
            while self._running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
        finally:
            self._running = False
            ai_thread.join(timeout=5)
            debug_thread.join(timeout=5)
            self._grabber.stop()
            print("[pipeline] Stopped.")

    def stop(self):
        self._running = False

    # ────────────────────────────────────────────────────────────
    #  AI loop  (runs at model speed, ~15 FPS)
    # ────────────────────────────────────────────────────────────
    def _ai_loop(self):
        frame_count = 0
        LOG_INTERVAL = 30
        acc_yolo = 0.0
        acc_depth = 0.0
        acc_total = 0.0

        while self._running:
            ret, frame = self._grabber.get_latest()
            if not ret or frame is None:
                time.sleep(0.05)
                continue

            t_start = time.time()

            # ── 1. YOLO detection + tracking ─────────────────
            t_yolo = time.time()
            detections = self.detector.track(frame)
            dt_yolo = time.time() - t_yolo

            # ── 2. Depth estimation (skip when no detections) ─
            dt_depth = 0.0
            if detections:
                t_depth = time.time()
                self.estimator.compute_depth_map(frame)
                for det in detections:
                    depth = self.estimator.get_depth_for_bbox(det["bbox"])
                    det["distance"] = round(depth, 2) if depth is not None else None
                dt_depth = time.time() - t_depth

            # ── 3. Store shared state ────────────────────────
            with self._state_lock:
                self._last_detections = detections
                self._last_depth_map = (
                    self.estimator._depth_map.copy()
                    if self.estimator._depth_map is not None else None
                )

            # ── 4. Publish detections via MQTT ───────────────
            payload = json.dumps(detections)
            self.mqtt.publish("ai/objects", payload)

            dt_total = time.time() - t_start
            frame_count += 1

            # ── rolling average logging ──────────────────────
            acc_yolo += dt_yolo
            acc_depth += dt_depth
            acc_total += dt_total

            if frame_count % LOG_INTERVAL == 0:
                avg_yolo = acc_yolo / LOG_INTERVAL
                avg_depth = acc_depth / LOG_INTERVAL
                avg_total = acc_total / LOG_INTERVAL

                fps_yolo = 1.0 / avg_yolo if avg_yolo > 0 else float("inf")
                fps_depth = 1.0 / avg_depth if avg_depth > 0 else float("inf")
                fps_total = 1.0 / avg_total if avg_total > 0 else float("inf")

                n = len(detections)
                print(
                    f"[ai] frame {frame_count}  objects={n}  |  "
                    f"YOLO {fps_yolo:5.1f} fps ({avg_yolo*1000:.0f} ms)  |  "
                    f"ViTS {fps_depth:5.1f} fps ({avg_depth*1000:.0f} ms)  |  "
                    f"Total {fps_total:5.1f} fps ({avg_total*1000:.0f} ms)"
                )
                acc_yolo = acc_depth = acc_total = 0.0

    # ────────────────────────────────────────────────────────────
    #  Debug loop  (runs at _DEBUG_FPS, overlays persistent bboxes)
    # ────────────────────────────────────────────────────────────
    def _debug_loop(self):
        interval = 1.0 / _DEBUG_FPS
        frame_count = 0

        while self._running:
            t0 = time.time()

            ret, frame = self._grabber.get_latest()
            if not ret or frame is None:
                time.sleep(0.05)
                continue

            # Read the latest AI results (lock-free snapshot)
            with self._state_lock:
                detections = self._last_detections
                depth_map = self._last_depth_map

            # Annotate every frame with the *persistent* last-known bboxes
            annotated = _annotate_frame(frame, detections)
            heatmap = _depth_to_heatmap(depth_map)

            debug_payload = json.dumps({
                "annotated": _encode_jpeg_b64(annotated),
                "depth": _encode_jpeg_b64(heatmap),
            })
            self.mqtt.publish("ai/debug", debug_payload)

            frame_count += 1

            # Pace to target FPS
            elapsed = time.time() - t0
            remaining = interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
