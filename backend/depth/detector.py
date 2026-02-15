#!/usr/bin/env python3
"""
Object Detector – runs YOLOv8n with Ultralytics tracking on video frames.

Tracks three classes: person (0), car (2), motorcycle (3).
Returns bounding boxes with persistent track IDs.
"""

from ultralytics import YOLO


# COCO class IDs we care about (road traffic objects)
TARGET_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    # 9: "traffic light",
    # 11: "stop sign",
}
TARGET_CLASS_IDS = list(TARGET_CLASSES.keys())


class ObjectDetector:
    """Thin wrapper around Ultralytics YOLO + BoT-SORT tracker."""

    def __init__(self, model_name: str = "yolo11n.pt", device: str = "cpu",
                 conf_threshold: float = 0.35):
        """
        Args:
            model_name: YOLO model file (downloaded automatically).
            device: 'cpu' or 'cuda:0'.
            conf_threshold: minimum detection confidence.
        """
        self.model = YOLO(model_name)
        self.device = device
        self.conf = conf_threshold

    def track(self, frame):
        """
        Run detection + tracking on a single BGR frame.

        Returns:
            list of dicts:
              {"id": int, "class": str, "bbox": [x, y, w, h]}
        """
        results = self.model.track(
            frame,
            persist=True,
            device=self.device,
            conf=self.conf,
            classes=TARGET_CLASS_IDS,
            verbose=False,
        )

        detections = []
        for r in results:
            boxes = r.boxes
            if boxes is None or boxes.id is None:
                continue
            for box, track_id, cls_id in zip(
                boxes.xywh.cpu().numpy(),
                boxes.id.cpu().numpy().astype(int),
                boxes.cls.cpu().numpy().astype(int),
            ):
                x, y, w, h = box.tolist()
                detections.append({
                    "id": int(track_id),
                    "class": TARGET_CLASSES.get(int(cls_id), "unknown"),
                    "bbox": [round(x, 1), round(y, 1),
                             round(w, 1), round(h, 1)],
                })

        return detections
