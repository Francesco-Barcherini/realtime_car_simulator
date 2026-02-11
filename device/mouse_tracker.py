#!/usr/bin/env python3
"""
Mouse Tracker - Simulates car controls via mouse input.

Runs on Raspberry Pi 3 B+. Uses pynput to capture mouse events
and publishes speed, steering, and obstacle events via MQTT.

Controls:
  - Left click held:  accelerating
  - Right click held: braking
  - No click:         engine brake (slow deceleration)
  - Scroll wheel:     create obstacle
  - Mouse X movement: steering (proportional to displacement from origin)
"""

import time
import json
import threading
import paho.mqtt.client as mqtt
from pynput import mouse

# ── Physics constants ────────────────────────────────────────────────
MAX_SPEED = 200.0        # km/h (arbitrary game units)
ACCEL_RATE = 40.0        # units/s when accelerating
BRAKE_RATE = 80.0        # units/s when braking
ENGINE_BRAKE_RATE = 15.0 # units/s when coasting (no button pressed)

MAX_STEERING_ANGLE = 45.0   # degrees
STEERING_SENSITIVITY = 0.3  # degrees per pixel of X displacement

SPEED_PUBLISH_THRESHOLD = 0.01  # publish when speed changes > 1 %
STEERING_PUBLISH_THRESHOLD = 0.5  # degrees dead-zone for publish

PHYSICS_HZ = 60  # physics update rate


class MouseTracker:
    """Captures mouse events via pynput and maintains car speed / steering state."""

    def __init__(self, mqtt_client: mqtt.Client):
        self.mqtt = mqtt_client

        # ── state ─────────────────────────────────────────────────
        self.speed = 0.0          # current speed [0 .. MAX_SPEED]
        self.steering_angle = 0.0 # current steering [-MAX .. +MAX]
        self.x_displacement = 0.0 # accumulated X displacement from origin
        self._origin_x: float | None = None  # set on first move event

        self.left_pressed = False
        self.right_pressed = False

        # last‑published values (for threshold comparison)
        self._last_pub_speed = -1.0
        self._last_pub_steering = -999.0

        self._running = False
        self._listener: mouse.Listener | None = None

    # ── public API ────────────────────────────────────────────────
    def start(self):
        """Start pynput listener + physics thread."""
        self._running = True

        # pynput listener runs in its own daemon thread
        self._listener = mouse.Listener(
            on_move=self._on_move,
            on_click=self._on_click,
            on_scroll=self._on_scroll,
        )
        self._listener.start()

        threading.Thread(target=self._physics_loop, daemon=True).start()

    def stop(self):
        self._running = False
        if self._listener is not None:
            self._listener.stop()

    # ── pynput callbacks ─────────────────────────────────────────
    def _on_move(self, x: int, y: int):
        """Track mouse X position; displacement from the initial position
        drives the steering angle."""
        if self._origin_x is None:
            self._origin_x = x
        self.x_displacement = x - self._origin_x

    def _on_click(self, x: int, y: int, button: mouse.Button, pressed: bool):
        """Left = accelerate, Right = brake, Middle = obstacle."""
        if button == mouse.Button.left:
            self.left_pressed = pressed
        elif button == mouse.Button.right:
            self.right_pressed = pressed
        elif button == mouse.Button.middle and pressed:
            self._publish_obstacle()

    def _on_scroll(self, x: int, y: int, dx: int, dy: int):
        """Any scroll event creates an obstacle."""
        self._publish_obstacle()

    # ── physics loop ─────────────────────────────────────────────
    def _physics_loop(self):
        dt = 1.0 / PHYSICS_HZ
        while self._running:
            # ── speed update ──────────────────────────────────────
            if self.left_pressed:
                # accelerating
                self.speed += ACCEL_RATE * dt
            elif self.right_pressed:
                # braking
                self.speed -= BRAKE_RATE * dt
            else:
                # engine brake
                self.speed -= ENGINE_BRAKE_RATE * dt

            self.speed = max(0.0, min(MAX_SPEED, self.speed))

            # ── steering update ───────────────────────────────────
            self.steering_angle = max(
                -MAX_STEERING_ANGLE,
                min(MAX_STEERING_ANGLE,
                    self.x_displacement * STEERING_SENSITIVITY)
            )

            # ── publish if changed significantly ──────────────────
            self._maybe_publish_speed()
            self._maybe_publish_steering()

            time.sleep(dt)

    # ── MQTT publishers ──────────────────────────────────────────
    def _maybe_publish_speed(self):
        if self._last_pub_speed <= 0:
            threshold = 0.5  # absolute threshold when near zero
        else:
            threshold = self._last_pub_speed * SPEED_PUBLISH_THRESHOLD

        if abs(self.speed - self._last_pub_speed) >= threshold:
            payload = json.dumps({"speed": round(self.speed, 2)})
            self.mqtt.publish("mouse/speed", payload)
            self._last_pub_speed = self.speed

    def _maybe_publish_steering(self):
        if abs(self.steering_angle - self._last_pub_steering) >= STEERING_PUBLISH_THRESHOLD:
            payload = json.dumps({"angle": round(self.steering_angle, 2)})
            self.mqtt.publish("mouse/steering", payload)
            self._last_pub_steering = self.steering_angle

    def _publish_obstacle(self):
        payload = json.dumps({"event": "wheel_click", "timestamp": time.time()})
        self.mqtt.publish("mouse/obstacle", payload)
        print("[mouse_tracker] obstacle published")
