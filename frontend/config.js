// Configuration for the Realtime Car Simulator Frontend

const CONFIG = {
    // MQTT Configuration
    // broker runs on the backend PC (same machine as Mosquitto)
    mqtt: {
        broker: '10.30.7.22' || window.location.hostname || 'localhost',
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
        host: '10.1.56.79',  // RPi IP from conf.conf
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

    // Rendering
    canvas: {
        width: 800,
        height: 600,
        fps: 30
    },

    // Road
    road: {
        width: 400, // road width in pixels
        laneCount: 3,
        scrollSpeed: 100 // base scroll speed
    },

    // Car
    car: {
        width: 40,
        height: 70,
        x: 400, // center of canvas (will be calculated)
        y: 450 // near bottom of canvas
    },

    // Obstacles
    obstacles: {
        spawnRate: 2000, // milliseconds between random spawns
        minDistance: 100, // minimum distance from car
        maxVisible: 20 // maximum obstacles on screen
    },

    // COCO Dataset Classes for Road Traffic
    // https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/coco.yaml
    cocoClasses: {
        0: { name: 'person', color: '#FF6B6B', size: 30 },
        1: { name: 'bicycle', color: '#4ECDC4', size: 40 },
        2: { name: 'car', color: '#45B7D1', size: 50 },
        3: { name: 'motorcycle', color: '#FFA07A', size: 35 },
        5: { name: 'bus', color: '#98D8C8', size: 80 },
        7: { name: 'truck', color: '#6C5CE7', size: 70 },
        9: { name: 'traffic light', color: '#FDCB6E', size: 25 },
        11: { name: 'stop sign', color: '#E17055', size: 30 }
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
