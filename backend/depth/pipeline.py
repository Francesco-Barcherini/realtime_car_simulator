#!/usr/bin/env python3
"""
Vision Pipeline – orchestrates video capture → YOLO detection → depth
estimation and publishes results via MQTT.

Also publishes debug frames (annotated + depth heatmap) for the
frontend debug page.
"""

import time
import json
import base64
import cv2
import numpy as np
import paho.mqtt.client as mqtt

from .detector import ObjectDetector
from .depth_estimator import DepthEstimator

# Colors for bounding boxes per class
_CLASS_COLORS = {
    "person": (71, 107, 255),     # red-ish (BGR)
    "car": (209, 183, 69),        # blue-ish
    "motorcycle": (122, 160, 255),# orange-ish
}


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

        dist_str = f'{det["distance"]:.1f}m' if det.get("distance") is not None else "?"
        label = f'{det["class"]} #{det["id"]} {dist_str}'
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
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


class VisionPipeline:
    """
    End-to-end pipeline:
      1. Pull MJPEG frames from the RPi camera stream.
      2. Run YOLO object tracking (person, car, motorcycle).
      3. Compute depth for each tracked object.
      4. Publish results on MQTT topic 'ai/objects'.
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

    def start(self):
        """Open the video stream and process frames until stopped."""
        self._running = True

        # Wait for the camera stream to become available
        print(f"[pipeline] Waiting for stream: {self.stream_url}")
        cap = cv2.VideoCapture(self.stream_url)
        while not cap.isOpened() and self._running:
            print("[pipeline] Stream not available – retrying in 3 s…")
            cap.release()
            time.sleep(3)
            cap = cv2.VideoCapture(self.stream_url)

        if not self._running:
            cap.release()
            return

        print(f"[pipeline] Connected to stream: {self.stream_url}")
        frame_count = 0

        # ── rolling FPS accumulators ─────────────────────────────
        LOG_INTERVAL = 30  # log every N frames
        acc_yolo = 0.0     # accumulated YOLO time
        acc_depth = 0.0    # accumulated ViTS depth time
        acc_total = 0.0    # accumulated total pipeline time

        try:
            while self._running:
                ret, frame = cap.read()
                if not ret:
                    print("[pipeline] Stream read failed – retrying …")
                    time.sleep(0.5)
                    cap.release()
                    cap = cv2.VideoCapture(self.stream_url)
                    continue

                t_start = time.time()

                # ── 1. YOLO detection + tracking ─────────────────
                t_yolo = time.time()
                detections = self.detector.track(frame)
                dt_yolo = time.time() - t_yolo

                # ── 2. Depth estimation (one map per frame) ──────
                dt_depth = 0.0
                t_depth = time.time()
                self.estimator.compute_depth_map(frame)

                if detections:
                    for det in detections:
                        depth = self.estimator.get_depth_for_bbox(det["bbox"])
                        det["distance"] = round(depth, 2) if depth is not None else None
                dt_depth = time.time() - t_depth

                # ── 3. Publish detections via MQTT ───────────────
                payload = json.dumps(detections)
                self.mqtt.publish("ai/objects", payload)

                # ── 4. Publish debug frames ──────────────────────
                annotated = _annotate_frame(frame, detections)
                heatmap = _depth_to_heatmap(self.estimator._depth_map)

                debug_payload = json.dumps({
                    "annotated": _encode_jpeg_b64(annotated),
                    "depth": _encode_jpeg_b64(heatmap),
                })
                self.mqtt.publish("ai/debug", debug_payload)

                dt_total = time.time() - t_start
                frame_count += 1

                # ── accumulate for rolling average ───────────────
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
                        f"[pipeline] frame {frame_count}  objects={n}  |  "
                        f"YOLO {fps_yolo:5.1f} fps ({avg_yolo*1000:.0f} ms)  |  "
                        f"ViTS {fps_depth:5.1f} fps ({avg_depth*1000:.0f} ms)  |  "
                        f"Total {fps_total:5.1f} fps ({avg_total*1000:.0f} ms)"
                    )

                    # reset accumulators
                    acc_yolo = 0.0
                    acc_depth = 0.0
                    acc_total = 0.0

        except KeyboardInterrupt:
            pass
        finally:
            cap.release()
            print("[pipeline] Stopped.")

    def stop(self):
        self._running = False
