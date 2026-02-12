// Obstacle Management System

class ObstacleManager {
    constructor() {
        this.obstacles = [];
        this.nextId = 1;
        this.lastSpawnTime = 0;
    }

    // Add obstacle from AI detection
    addDetectedObstacle(aiObject) {
        // depth is relative 0–255 (higher = closer)
        const depthValue = aiObject.distance || 0;
        const y = this.distanceToY(depthValue);

        // Use bbox to determine x position (center of detection)
        const [bboxX, bboxY, bboxW, bboxH] = aiObject.bbox;
        const x = this.bboxToX(bboxX, bboxW);

        // Get class info from config (lookup by name since backend sends strings)
        let classInfo = null;
        for (const key in CONFIG.cocoClasses) {
            if (CONFIG.cocoClasses[key].name === aiObject.class) {
                classInfo = CONFIG.cocoClasses[key];
                break;
            }
        }
        if (!classInfo) {
            classInfo = { name: aiObject.class || 'unknown', color: '#FFFFFF', size: 40 };
        }

        // Size proportional to bbox width (from 640px camera frame → canvas road)
        const scaleFactor = CONFIG.road.width / 640;
        const obsWidth  = Math.max(10, bboxW * scaleFactor);
        const obsHeight = Math.max(10, bboxH * scaleFactor);

        const obstacle = {
            id: `ai_${aiObject.id}`,
            type: 'detected',
            class: classInfo.name,
            x: x,
            y: y,
            width: obsWidth,
            height: obsHeight,
            color: classInfo.color,
            distance: depthValue,
            aiId: aiObject.id
        };

        // Update if already exists, otherwise add
        const existingIndex = this.obstacles.findIndex(o => o.aiId === aiObject.id);
        if (existingIndex >= 0) {
            this.obstacles[existingIndex] = obstacle;
        } else {
            this.obstacles.push(obstacle);
        }
    }

    // Add random virtual obstacle
    addRandomObstacle() {
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        const roadRight = roadLeft + CONFIG.road.width;

        const obstacle = {
            id: `random_${this.nextId++}`,
            type: 'random',
            class: 'cone',
            x: roadLeft + Math.random() * CONFIG.road.width,
            y: -50, // spawn above screen
            width: 30,
            height: 30,
            color: '#FF6B6B',
            speed: 0
        };

        this.obstacles.push(obstacle);
    }

    // Add user-created obstacle (from mouse wheel)
    addUserObstacle(data) {
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        const roadRight = roadLeft + CONFIG.road.width;

        const obstacle = {
            id: `user_${this.nextId++}`,
            type: 'user',
            class: 'barrel',
            x: data.x || (roadLeft + Math.random() * CONFIG.road.width),
            y: data.y || -50,
            width: 35,
            height: 35,
            color: '#FFA07A',
            speed: 0
        };

        this.obstacles.push(obstacle);
    }

    // Update obstacle positions based on world (RPi mouse) movement
    update(deltaTime, worldSpeedPx, worldSteeringDeg) {
        this.obstacles.forEach(obstacle => {
            // Detected (AI) obstacles: positioned from MQTT data, don't move
            if (obstacle.type !== 'detected') {
                // Random/user obstacles scroll with the world
                obstacle.y += worldSpeedPx * deltaTime;
                // Lateral drift from world steering
                const lateralPx = (worldSteeringDeg / CONFIG.physics.maxRotation) * 100;
                obstacle.x -= lateralPx * deltaTime;
            }
        });

        // Remove off-screen obstacles
        this.obstacles = this.obstacles.filter(obstacle => {
            return obstacle.y < CONFIG.canvas.height + 100 &&
                obstacle.y > -100 &&
                obstacle.x > -100 &&
                obstacle.x < CONFIG.canvas.width + 100;
        });

        // Limit total obstacles
        if (this.obstacles.length > CONFIG.obstacles.maxVisible) {
            this.obstacles = this.obstacles.slice(-CONFIG.obstacles.maxVisible);
        }
    }

    // Spawn random obstacles periodically
    spawnRandom(currentTime) {
        if (currentTime - this.lastSpawnTime > CONFIG.obstacles.spawnRate) {
            this.addRandomObstacle();
            this.lastSpawnTime = currentTime;
        }
    }

    // Check collision with car
    checkCollision(carX, carY, carWidth, carHeight) {
        for (let obstacle of this.obstacles) {
            if (this.rectanglesCollide(
                carX, carY, carWidth, carHeight,
                obstacle.x - obstacle.width / 2,
                obstacle.y - obstacle.height / 2,
                obstacle.width,
                obstacle.height
            )) {
                return obstacle;
            }
        }
        return null;
    }

    // Simple AABB collision detection
    rectanglesCollide(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 &&
            x1 + w1 > x2 &&
            y1 < y2 + h2 &&
            y1 + h1 > y2;
    }

    // Convert relative depth (0–255) to Y position on screen
    // Higher depth value = closer = lower on screen (higher y)
    distanceToY(depthValue) {
        const minY = 50;
        // Cap so depth=255 stays well above the car's default start position
        const maxY = CONFIG.car.y - CONFIG.car.height - 10;

        const normalized = Math.min(Math.max(depthValue / 255, 0), 1);
        // 0 (far) → minY (top), 255 (close) → maxY (just above car)
        return minY + normalized * (maxY - minY);
    }

    // Convert bbox x position to screen x
    bboxToX(bboxX, bboxW) {
        // Assuming bbox is normalized 0-1 or in pixels
        // This needs to be adjusted based on actual bbox format from YOLO
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        const roadRight = roadLeft + CONFIG.road.width;

        // Simple mapping - adjust based on actual data
        return roadLeft + (bboxX / 640) * CONFIG.road.width; // assuming 640px camera width
    }

    // Get all obstacles
    getAll() {
        return this.obstacles;
    }

    // Clear all obstacles
    clear() {
        this.obstacles = [];
    }

    // Get obstacle count
    count() {
        return this.obstacles.length;
    }
}
