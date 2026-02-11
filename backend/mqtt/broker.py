#!/usr/bin/env python3
"""
MQTT Broker helper – generates a Mosquitto configuration and
provides utilities to manage the broker.

Topics handled by the system:
  mouse/speed     – car speed from RPi mouse tracker
  mouse/steering  – steering angle from RPi mouse tracker
  mouse/obstacle  – obstacle event (wheel click)
  ai/objects      – detected objects from the depth pipeline
"""

import subprocess
import os
import tempfile
import signal
import sys

MOSQUITTO_CONF_TEMPLATE = """\
# ── Mosquitto configuration (auto‑generated) ─────────────────────
# TCP listener (for Python / device clients)
listener {mqtt_port}
protocol mqtt

# WebSocket listener (for the browser frontend)
listener {ws_port}
protocol websockets

# Allow anonymous connections (development only!)
allow_anonymous true
"""


def generate_config(mqtt_port: int = 1883, ws_port: int = 9001) -> str:
    """Write a temporary Mosquitto config and return its path."""
    content = MOSQUITTO_CONF_TEMPLATE.format(mqtt_port=mqtt_port, ws_port=ws_port)
    fd, path = tempfile.mkstemp(prefix="mosquitto_", suffix=".conf")
    with os.fdopen(fd, "w") as f:
        f.write(content)
    return path


def start_broker(mqtt_port: int = 1883, ws_port: int = 9001):
    """
    Start a Mosquitto broker as a subprocess.
    Blocks until interrupted with Ctrl‑C.
    """
    conf_path = generate_config(mqtt_port, ws_port)
    print(f"[mqtt] Starting Mosquitto (TCP :{mqtt_port}, WS :{ws_port})")
    print(f"[mqtt] Config: {conf_path}")

    proc = subprocess.Popen(
        ["mosquitto", "-c", conf_path, "-v"],
        stdout=sys.stdout,
        stderr=sys.stderr,
    )

    def _shutdown(signum, frame):
        print("\n[mqtt] Stopping Mosquitto…")
        proc.terminate()
        proc.wait()
        os.unlink(conf_path)
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    proc.wait()
    os.unlink(conf_path)


if __name__ == "__main__":
    start_broker()
