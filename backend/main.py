#!/usr/bin/env python3
"""
Backend main – entry point for the desktop PC.

Starts:
  1. Mosquitto MQTT broker (TCP :1883 + WebSocket :9001)
  2. Vision pipeline (YOLO + ViTS depth) consuming the RPi camera stream
"""

import argparse
import threading
import time
import signal
import sys
import subprocess
import os
import tempfile

import paho.mqtt.client as mqtt

from depth.pipeline import VisionPipeline


# ── Mosquitto helper ──────────────────────────────────────────────
MOSQUITTO_CONF = """\
listener {mqtt_port}
protocol mqtt
listener {ws_port}
protocol websockets
allow_anonymous true
"""


def start_mosquitto(mqtt_port: int, ws_port: int) -> subprocess.Popen:
    """Launch Mosquitto as a background subprocess."""
    content = MOSQUITTO_CONF.format(mqtt_port=mqtt_port, ws_port=ws_port)
    fd, conf_path = tempfile.mkstemp(prefix="mosquitto_", suffix=".conf")
    with os.fdopen(fd, "w") as f:
        f.write(content)

    proc = subprocess.Popen(
        ["mosquitto", "-c", conf_path, "-v"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"[backend] Mosquitto started (TCP :{mqtt_port}, WS :{ws_port})")
    # Give it a moment to bind
    time.sleep(1)
    return proc


# ── MQTT callbacks ────────────────────────────────────────────────
def on_connect(client, userdata, flags, rc):
    status = "OK" if rc == 0 else f"FAILED ({rc})"
    print(f"[backend] MQTT connection: {status}")
    # Subscribe to all topics for logging
    client.subscribe("mouse/#")
    client.subscribe("ai/#")


def on_message(client, userdata, msg):
    # Light logging – truncate long payloads
    payload = msg.payload.decode("utf-8", errors="replace")
    if len(payload) > 120:
        payload = payload[:120] + "…"
    print(f"[mqtt] {msg.topic}: {payload}")


# ── Main ──────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Backend server")
    parser.add_argument("--rpi-ip", default="10.1.56.79",
                        help="Raspberry Pi IP address")
    parser.add_argument("--stream-port", type=int, default=5000,
                        help="Camera stream port on the RPi")
    parser.add_argument("--mqtt-port", type=int, default=1883,
                        help="MQTT TCP port")
    parser.add_argument("--ws-port", type=int, default=9001,
                        help="MQTT WebSocket port")
    parser.add_argument("--device", default="cpu",
                        help="Torch device for AI models (cpu / cuda:0)")
    parser.add_argument("--yolo-model", default="yolo11n.pt",
                        help="YOLO model file")
    parser.add_argument("--depth-model",
                        default="depth-anything/Depth-Anything-V2-Small-hf",
                        help="HuggingFace depth model ID")
    parser.add_argument("--no-broker", action="store_true",
                        help="Skip starting Mosquitto (use external broker)")
    args = parser.parse_args()

    mosquitto_proc = None

    # ── 1. Start MQTT broker ─────────────────────────────────────
    if not args.no_broker:
        mosquitto_proc = start_mosquitto(args.mqtt_port, args.ws_port)

    # ── 2. Connect MQTT client (retry until broker is reachable) ──
    mqtt_client = mqtt.Client(client_id="backend_server")
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    while True:
        try:
            mqtt_client.connect("127.0.0.1", args.mqtt_port, keepalive=60)
            break
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] MQTT broker not reachable ({e}) – retrying in 3 s…")
            time.sleep(3)

    mqtt_client.loop_start()

    # ── 3. Start vision pipeline ─────────────────────────────────
    stream_url = f"http://{args.rpi_ip}:{args.stream_port}/video"
    pipeline = VisionPipeline(
        stream_url=stream_url,
        mqtt_client=mqtt_client,
        yolo_model=args.yolo_model,
        depth_model=args.depth_model,
        device=args.device,
    )

    pipeline_thread = threading.Thread(target=pipeline.start, daemon=True)
    pipeline_thread.start()

    # ── Graceful shutdown ─────────────────────────────────────────
    def shutdown(signum=None, frame=None):
        print("\n[backend] Shutting down…")
        pipeline.stop()
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        if mosquitto_proc:
            mosquitto_proc.terminate()
            mosquitto_proc.wait()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
