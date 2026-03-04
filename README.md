# Realtime Car Simulator

A real-time 2D car simulator that integrates computer vision with interactive gameplay. A Raspberry Pi captures video and user input, a PC server runs an AI pipeline for object detection and monocular depth estimation, and a browser-based frontend renders the game. All components communicate over MQTT.

## Architecture

```
┌─────────────────┐
│  Raspberry Pi   │
│  - Camera       │── HTTP/MJPEG ──┐
│  - Mouse Input  │                │
└────────┬────────┘                │
         │                         ▼
         │                  ┌────────────┐
         │   MQTT topics    │  PC Server │
         └─────────────────▶│  YOLO 11n  │
                            │  Depth-    │
                            │  Anything  │
                            └──────┬─────┘
                                   │ MQTT topics
                            ┌──────▼─────┐
                            │  Frontend  │
                            │  (Browser) │
                            └────────────┘
```

## Components

### Frontend

An HTML5 Canvas application written in vanilla JavaScript. It renders a scrolling three-lane road, a player car controlled by arrow keys, and obstacles originating from three sources: AI-detected objects, randomly spawned traffic, and user-placed items. The game maintains a time-survived score and implements collision detection. The Paho MQTT library provides real-time communication with the backend.

### AI Pipeline

The backend consumes an MJPEG stream from the Raspberry Pi and processes each frame through two models:

1. **YOLO 11n** (Ultralytics) — detects and tracks road-traffic objects (persons, cars, motorcycles, bicycles, buses, trucks) using BoT-SORT persistence.
2. **Depth-Anything-V2-Small** (ViTS, Hugging Face Transformers) — produces a per-frame relative depth map. For each detected bounding box the median depth of the central 40 % crop is computed.

Detections are published as JSON over MQTT; an optional debug topic streams annotated frames and depth heatmaps.

### Device Layer (Raspberry Pi)

The Raspberry Pi 3 B+ runs two services concurrently:

- **Camera streamer** — serves MJPEG over HTTP with runtime source switching between a live camera and a looping video file.
- **Mouse tracker** — reads raw mouse events via `evdev` (no display server required). Left-click accelerates, right-click brakes, horizontal movement steers, and the scroll wheel spawns obstacles. Speed and steering state are published to MQTT at 60 Hz.

## MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `mouse/speed` | Device → Frontend | Normalised speed (0–1) |
| `mouse/steering` | Device → Frontend | Steering angle in degrees |
| `mouse/obstacle` | Device → Frontend | Obstacle spawn event |
| `ai/objects` | Backend → Frontend | JSON array of detections (`id`, `class`, `bbox [cx,cy,w,h]`, `distance`) |
| `ai/debug` | Backend → Debug UI | Base64-encoded annotated frame and depth heatmap |

## Controls

| Key | Action |
|---|---|
| ↑ | Accelerate |
| ↓ | Brake |
| ← | Steer left |
| → | Steer right |

Inputs are vector-additive, allowing simultaneous acceleration and steering.

## License

MIT