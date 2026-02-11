#!/usr/bin/env python3
"""
Mouse Tracker - Simulates car controls via mouse input.

Runs on Raspberry Pi 3 B+. Uses evdev to read mouse events directly
from the kernel input subsystem – no X server / display required.

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
import evdev
from evdev import InputDevice, categorize, ecodes

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


def find_mouse_device():
    """Auto-detect the first device that looks like a mouse."""
    devices = [InputDevice(path) for path in evdev.list_devices()]
    for dev in devices:
        caps = dev.capabilities(verbose=False)
        # A mouse has REL axes (EV_REL = 2) and keys/buttons (EV_KEY = 1)
        if ecodes.EV_REL in caps and ecodes.EV_KEY in caps:
            print(f"[mouse_tracker] Found mouse: {dev.name} ({dev.path})")
            return dev
    return None


class MouseTracker:
    """Reads mouse events via evdev and maintains car speed / steering state."""

    def __init__(self, mqtt_client: mqtt.Client, device_path: str = None):
        self.mqtt = mqtt_client
        self._device_path = device_path

        # ── state ─────────────────────────────────────────────────
        self.speed = 0.0          # current speed [0 .. MAX_SPEED]
        self.steering_angle = 0.0 # current steering [-MAX .. +MAX]
        self.x_displacement = 0.0 # accumulated X displacement from origin

        self.left_pressed = False
        self.right_pressed = False

        # last-published values (for threshold comparison)
        self._last_pub_speed = -1.0
        self._last_pub_steering = -999.0

        self._running = False

    # ── public API ────────────────────────────────────────────────
    def start(self):
        """Start evdev reader + physics thread."""
        self._running = True
        threading.Thread(target=self._read_mouse, daemon=True).start()
        threading.Thread(target=self._physics_loop, daemon=True).start()

    def stop(self):
        self._running = False

    # ── evdev event loop ─────────────────────────────────────────
    def _read_mouse(self):
        """Read events from the mouse input device (no X server needed)."""
        try:
            if self._device_path:
                dev = InputDevice(self._device_path)
                print(f"[mouse_tracker] Using device: {dev.name} ({dev.path})")
            else:
                dev = find_mouse_device()
                if dev is None:
                    print("[mouse_tracker] No mouse device found – "
                          "running without mouse (use test_mqtt.py to simulate).")
                    return

            # Grab the device so events don't leak to other consumers
            dev.grab()

            for event in dev.read_loop():
                if not self._running:
                    break

                # ── relative movement (EV_REL) ────────────────────
                if event.type == ecodes.EV_REL:
                    if event.code == ecodes.REL_X:
                        self.x_displacement += event.value
                    elif event.code == ecodes.REL_WHEEL:
                        # scroll wheel → obstacle
                        self._publish_obstacle()

                # ── button press / release (EV_KEY) ───────────────
                elif event.type == ecodes.EV_KEY:
                    # value: 1 = pressed, 0 = released
                    if event.code == ecodes.BTN_LEFT:
                        self.left_pressed = (event.value == 1)
                    elif event.code == ecodes.BTN_RIGHT:
                        self.right_pressed = (event.value == 1)
                    elif event.code == ecodes.BTN_MIDDLE and event.value == 1:
                        self._publish_obstacle()

            dev.ungrab()

        except PermissionError:
            print("[mouse_tracker] Permission denied – run with sudo "
                  "or add user to the 'input' group.")
        except FileNotFoundError as e:
            print(f"[mouse_tracker] Device not found: {e}")

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
