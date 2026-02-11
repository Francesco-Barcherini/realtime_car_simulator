#!/usr/bin/env python3
"""
Device main – entry point for the Raspberry Pi 3 B+.

Starts both:
  1. Mouse tracker  → publishes speed / steering / obstacle via MQTT
  2. Camera streamer → serves MJPEG over HTTP
"""

import argparse
import threading
import time
import paho.mqtt.client as mqtt

from mouse_tracker import MouseTracker
from camera_stream import start_camera_stream


def on_connect(client, userdata, flags, rc):
    status = "OK" if rc == 0 else f"FAILED (code {rc})"
    print(f"[device] MQTT connection: {status}")


def main():
    parser = argparse.ArgumentParser(description="RPi device controller")
    parser.add_argument("--broker", default="10.30.7.42",
                        help="MQTT broker IP (default from conf.conf)")
    parser.add_argument("--mqtt-port", type=int, default=1883,
                        help="MQTT broker port")
    parser.add_argument("--stream-port", type=int, default=5000,
                        help="HTTP camera stream port")
    args = parser.parse_args()

    # ── MQTT client (retry until broker is reachable) ─────────────
    mqtt_client = mqtt.Client(client_id="rpi_device")
    mqtt_client.on_connect = on_connect

    while True:
        try:
            mqtt_client.connect(args.broker, args.mqtt_port, keepalive=60)
            break
        except (ConnectionRefusedError, OSError) as e:
            print(f"[device] MQTT broker not reachable ({e}) – retrying in 3 s…")
            time.sleep(3)

    mqtt_client.loop_start()

    # ── Mouse tracker ─────────────────────────────────────────────
    tracker = MouseTracker(mqtt_client)
    tracker.start()
    print("[device] Mouse tracker started")

    # ── Camera stream (blocking – runs in its own thread) ─────────
    cam_thread = threading.Thread(
        target=start_camera_stream,
        kwargs={"host": "0.0.0.0", "port": args.stream_port},
        daemon=True,
    )
    cam_thread.start()
    print(f"[device] Camera stream starting on port {args.stream_port}")

    # ── Keep alive ────────────────────────────────────────────────
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[device] Shutting down…")
        tracker.stop()
        mqtt_client.loop_stop()
        mqtt_client.disconnect()


if __name__ == "__main__":
    main()
