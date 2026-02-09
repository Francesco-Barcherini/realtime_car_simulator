# Realtime Car Simulator

A real-time 2D car simulator that integrates computer vision, object detection, and interactive gameplay. The system uses a Raspberry Pi for video streaming and mouse control, a PC server for AI processing (YOLO object detection + ml-depth-pro distance estimation), and a web-based frontend for the game interface.

## Architecture

```
┌─────────────────┐
│  Raspberry Pi   │
│  - Camera       │──HTTP Stream──┐
│  - Mouse Input  │               │
└────────┬────────┘               │
         │                        ▼
         │                  ┌──────────┐
         │                  │ PC Server│
         │                  │ AI Pipeline:│
         │                  │ - YOLO    │
         └──MQTT Topics────▶│ - Depth   │
                            └─────┬────┘
                                  │
                                  │ MQTT Topics
                                  │
                            ┌─────▼────┐
                            │ Frontend │
                            │ (Browser)│
                            │ - Game   │
                            │ - Canvas │
                            └──────────┘
```

## Components

### 1. Frontend (Web-based Game) - **Tren**
- **Location**: `/frontend/`
- **Technology**: HTML5 Canvas, Vanilla JavaScript, MQTT (Paho)
- **Features**:
  - 2D scrolling road with lane dividers
  - Player car (stationary in viewport, objects move relative to it)
  - Keyboard controls (arrow keys) with vector-based movement
  - Real-time obstacle rendering (AI-detected, random, user-added)
  - MQTT integration for receiving data
  - Collision detection and scoring system

### 2. AI Pipeline (Object Detection + Distance) - **Tet**
- **Technology**: YOLOv8 (Ultralytics) + Apple ml-depth-pro
- **Process**:
  1. Receive video stream from Raspberry Pi
  2. Run object detection (COCO dataset road traffic classes)
  3. Track objects with persistence
  4. Estimate distance using ml-depth-pro
  5. Publish detected objects via MQTT

### 3. Raspberry Pi (Video + Mouse Control) - **Tet**
- **Components**:
  - Camera streaming (HTTP)
  - Mouse input handler
  - MQTT publisher for control inputs

## MQTT Topics

### From Raspberry Pi → Frontend
- `mouse/speed` - Speed control (0-1 normalized)
- `mouse/steering` - Steering angle in degrees
- `mouse/obstacle` - User-added obstacles (mouse wheel)

### From AI Pipeline → Frontend
- `ai/objects` - Detected objects with bounding boxes and distances
  ```json
  [
    {
      "id": 1,
      "class": "car",
      "bbox": [x, y, w, h],
      "distance": 5.2
    }
  ]
  ```

## Setup Instructions

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Serve the frontend** (using Python's built-in HTTP server):
   ```bash
   python3 -m http.server 8000
   ```

3. **Open in browser**:
   ```
   http://localhost:8000
   ```

4. **Configure MQTT broker**:
   - Edit `frontend/config.js`
   - Set `CONFIG.mqtt.broker` to your MQTT broker IP
   - Default is set to `10.30.7.42` (from `conf.conf`)

### MQTT Broker Setup

Install and run an MQTT broker (e.g., Mosquitto):

```bash
# macOS
brew install mosquitto
brew services start mosquitto

# Enable WebSocket support (edit /opt/homebrew/etc/mosquitto/mosquitto.conf)
listener 1883
listener 9001
protocol websockets
```

### Testing Without Hardware

Use the included test utilities to simulate MQTT messages:

```bash
# Install MQTT client
pip install paho-mqtt

# Run test publisher (see frontend/test_mqtt.py)
python frontend/test_mqtt.py
```

## Game Controls

- **↑ (Up Arrow)**: Gas / Accelerate
- **↓ (Down Arrow)**: Brake / Decelerate
- **← (Left Arrow)**: Steer Left
- **→ (Right Arrow)**: Steer Right

Controls use vector addition, so you can combine movements (e.g., gas + left turn).

## Development

### File Structure
```
.
├── frontend/
│   ├── index.html          # Main HTML structure
│   ├── style.css           # Styling and HUD
│   ├── config.js           # Configuration (MQTT, physics, etc.)
│   ├── game.js             # Main game engine
│   ├── renderer.js         # 2D Canvas rendering
│   ├── controls.js         # Keyboard input handling
│   ├── obstacles.js        # Obstacle management
│   └── mqtt-client.js      # MQTT integration
├── getting-started-test/   # Initial camera tests
├── conf.conf               # IP configuration
└── todo.md                 # Project TODO list
```

### Team Responsibilities
- **Tet**: AI Pipeline (YOLO + ml-depth-pro) + Raspberry Pi components
- **Tren**: Frontend (2D game interface)

## License

MIT License - See LICENSE file for details