#!/usr/bin/env python3
"""
Depth Estimator – computes per-object depth using
Depth-Anything-V2-Small (ViTS) from Hugging Face Transformers.

For each bounding box:
  1. Crop the central 40 % of the bbox (remove 30 % on each side for
     both width and height).
  2. Sample a 10×10 grid of points inside that crop.
  3. Return the median depth of those sampled points.

NOTE: Values are *relative* depth (0–255 range), NOT metric metres.
      Higher values ≈ closer to the camera.
"""

import numpy as np
from PIL import Image
from transformers import pipeline


class DepthEstimator:
    """Wraps the HF depth-estimation pipeline (ViTS model)."""

    def __init__(self, model_name: str = "depth-anything/Depth-Anything-V2-Small-hf",
                 device: str = "cpu"):
        """
        Args:
            model_name: Hugging Face model ID.
            device: 'cpu' or 'cuda:0'.
        """
        # Use -1 for CPU, 0 for first GPU
        device_id = -1 if device == "cpu" else int(device.split(":")[-1])
        self.pipe = pipeline(
            task="depth-estimation",
            model=model_name,
            device=device_id,
        )
        self._depth_map: np.ndarray | None = None

    def compute_depth_map(self, frame_bgr: np.ndarray):
        """
        Run depth estimation on a full frame (BGR numpy array).
        Stores the depth map internally for later per-bbox queries.
        """
        # Convert BGR→RGB and to PIL
        frame_rgb = frame_bgr[:, :, ::-1]
        pil_image = Image.fromarray(frame_rgb)

        result = self.pipe(pil_image)
        # result["depth"] is a PIL image; convert to float array
        raw = np.array(result["depth"], dtype=np.float32)
        # Normalize to 0–255 per-frame so values span the full range
        dmin, dmax = raw.min(), raw.max()
        if dmax > dmin:
            self._depth_map = (raw - dmin) / (dmax - dmin) * 255.0
        else:
            self._depth_map = np.zeros_like(raw)

    def get_depth_for_bbox(self, bbox: list[float]) -> float | None:
        """
        Compute median depth for a bounding box [cx, cy, w, h] (xywh format).

        Strategy:
          - Remove 30 % of width on each side → keep central 40 %.
          - Remove 30 % of height on each side → keep central 40 %.
          - Sample a 10×10 grid inside that region.
          - Return the median depth value (relative, 0–255).

        Returns:
            Median depth (float) or None if depth map is not available.
        """
        if self._depth_map is None:
            return None

        h_img, w_img = self._depth_map.shape[:2]
        cx, cy, w, h = bbox

        # Convert xywh (center) → xyxy (top-left, bottom-right)
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0

        # Remove 30 % on each side of width AND height → keep central 40 %
        margin_w = w * 0.3
        margin_h = h * 0.3
        x1_crop = x1 + margin_w
        x2_crop = x2 - margin_w
        y1_crop = y1 + margin_h
        y2_crop = y2 - margin_h

        # Clamp to image bounds
        x1_crop = max(0, int(round(x1_crop)))
        x2_crop = min(w_img - 1, int(round(x2_crop)))
        y1_crop = max(0, int(round(y1_crop)))
        y2_crop = min(h_img - 1, int(round(y2_crop)))

        if x2_crop <= x1_crop or y2_crop <= y1_crop:
            return None

        # Sample a 10×10 grid
        xs = np.linspace(x1_crop, x2_crop, 10, dtype=int)
        ys = np.linspace(y1_crop, y2_crop, 10, dtype=int)
        grid_x, grid_y = np.meshgrid(xs, ys)

        sampled = self._depth_map[grid_y.ravel(), grid_x.ravel()]
        return float(np.median(sampled))
