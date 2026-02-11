#!/usr/bin/env python3
"""
Shared configuration – reads conf.conf and exposes project‑wide defaults.

Usage:
    from config import cfg
    print(cfg.SERVER_IP)
"""

import os
import pathlib


_ROOT = pathlib.Path(__file__).resolve().parent


def _load_conf(path: pathlib.Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE config file."""
    data: dict[str, str] = {}
    if not path.exists():
        return data
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                data[key.strip()] = value.strip()
    return data


class Config:
    """Immutable project configuration."""

    def __init__(self):
        raw = _load_conf(_ROOT / "conf.conf")

        # Network
        self.SERVER_IP: str = raw.get("SERVER_IP", "localhost")
        self.RPI_IP: str = raw.get("RPi_IP", "localhost")

        # Ports
        self.MQTT_PORT: int = 1883
        self.MQTT_WS_PORT: int = 9001
        self.CAMERA_STREAM_PORT: int = 5000

        # MQTT topics
        self.TOPIC_SPEED: str = "mouse/speed"
        self.TOPIC_STEERING: str = "mouse/steering"
        self.TOPIC_OBSTACLE: str = "mouse/obstacle"
        self.TOPIC_OBJECTS: str = "ai/objects"

        # AI models
        self.YOLO_MODEL: str = "yolo11n.pt"
        self.DEPTH_MODEL: str = "depth-anything/Depth-Anything-V2-Small-hf"

    @property
    def stream_url(self) -> str:
        return f"http://{self.RPI_IP}:{self.CAMERA_STREAM_PORT}/video"

    def __repr__(self):
        return (f"Config(SERVER={self.SERVER_IP}, RPI={self.RPI_IP}, "
                f"MQTT={self.MQTT_PORT}, CAM={self.CAMERA_STREAM_PORT})")


cfg = Config()
