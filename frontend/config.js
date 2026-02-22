// Configuration for the Realtime Car Simulator Frontend

const CONFIG = {
    // MQTT Configuration
    // broker runs on the backend PC (same machine as Mosquitto)
    mqtt: {
        broker: '10.97.150.3' || window.location.hostname || 'localhost',
        port: 9001, // WebSocket port (default for MQTT over WebSocket)
        clientId: 'car_simulator_' + Math.random().toString(16).substr(2, 8),
        topics: {
            mouseSpeed: 'mouse/speed',
            mouseSteering: 'mouse/steering',
            mouseObstacle: 'mouse/obstacle',
            aiObjects: 'ai/objects',
            aiDebug: 'ai/debug'
        }
    },

    // Device (Raspberry Pi) – camera stream lives here
    device: {
        host: '10.97.150.2',  // RPi IP from conf.conf
        streamPort: 5000
    },

    // Game Physics
    physics: {
        maxSpeed: 200, // pixels per second
        acceleration: 100, // pixels per second squared
        deceleration: 150, // pixels per second squared
        friction: 50, // natural slowdown
        rotationSpeed: 180, // degrees per second
        maxRotation: 45 // max steering angle in degrees
    },

    // Rendering – fill most of the browser window
    canvas: {
        width: 1280,
        height: 900,
        fps: 30
    },

    // Road
    road: {
        width: 650, // road width in pixels
        laneCount: 3,
        scrollSpeed: 100 // base scroll speed
    },

    // Car
    car: {
        width: 44,
        height: 78,
        x: 640, // center of canvas
        y: 650  // near bottom of canvas
    },

    // Reference point (where depth=255 maps, just above the car)
    referencePoint: {
        x: 640,
        y: 750
    },

    // Obstacles
    obstacles: {
        spawnRate: 2000, // milliseconds between random spawns
        minDistance: 100, // minimum distance from car
        maxVisible: 20,  // maximum obstacles on screen
        // How many recent AI frames to keep (N=1 → only latest frame)
        detectionHistory: 1,
        // Constant for w_real = sizeConstant * w_detected / depth
        sizeConstant: 30,
        // Lateral-exit correction: if bbox width shrinks by >= this ratio
        // vs. baseline, treat it as a lateral object keeping original size
        lateralShrinkThreshold: 0.10,  // shrink triggers correction
        // Number of first detections to average for baseline width
        lateralBaselineWindow: 3
    },

    // COCO Dataset Classes for Road Traffic
    // heightRatio = rendered height / rendered width (top-down 2D view)
    cocoClasses: {
        0: { name: 'person', color: '#FF6B6B', size: 30, heightRatio: 1.2 },
        1: { name: 'bicycle', color: '#4ECDC4', size: 40, heightRatio: 2.0 },
        2: { name: 'car', color: '#45B7D1', size: 50, heightRatio: 1.8 },
        3: { name: 'motorcycle', color: '#FFA07A', size: 35, heightRatio: 2.2 },
        5: { name: 'bus', color: '#98D8C8', size: 80, heightRatio: 2.5 },
        7: { name: 'truck', color: '#6C5CE7', size: 70, heightRatio: 2.3 },
        9: { name: 'traffic light', color: '#FDCB6E', size: 25, heightRatio: 2.5 },
        11: { name: 'stop sign', color: '#E17055', size: 30, heightRatio: 1.0 }
    },

    // Colors
    colors: {
        background: '#1a1a2e',
        road: '#2d2d44',
        roadLine: '#f1c40f',
        car: '#3498db',
        hudText: '#ecf0f1',
        hudBackground: 'rgba(0, 0, 0, 0.5)'
    }
};

// Sync reference point with car defaults
CONFIG.referencePoint.x = CONFIG.car.x;
CONFIG.referencePoint.y = CONFIG.car.y;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
