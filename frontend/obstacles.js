// Obstacle Management System

class ObstacleManager {
    constructor() {
        this.obstacles = [];     // non-detected obstacles (random + user)
        this.nextId = 1;
        this.lastSpawnTime = 0;

        // Ring buffer of the last N AI detection frames
        this._detectionFrames = [];  // each entry: array of obstacle objects
        this._N = CONFIG.obstacles.detectionHistory || 1;

        // Score tracking: count user/random obstacles that exit the screen
        this.obstaclesPassed = 0;
    }

    // ── AI-detected obstacles ───────────────────────────────────
    // Called once per MQTT ai/objects message with the full array
    setDetectedFrame(aiObjects) {
        const frame = [];
        for (const aiObj of aiObjects) {
            const depthValue = aiObj.distance || 0;
            const [bboxX, bboxY, bboxW, bboxH] = aiObj.bbox;

            // Class info lookup
            let classInfo = null;
            for (const key in CONFIG.cocoClasses) {
                if (CONFIG.cocoClasses[key].name === aiObj.class) {
                    classInfo = CONFIG.cocoClasses[key];
                    break;
                }
            }
            if (!classInfo) {
                classInfo = { name: aiObj.class || 'unknown', color: '#FFFFFF', size: 40, heightRatio: 1.5 };
            }

            // w_real = K * w_detected / depth  (depth is inverse of distance)
            const K = CONFIG.obstacles.sizeConstant;
            const safeDepth = Math.max(depthValue, 1); // avoid division by zero
            const obsWidth  = Math.max(10, K * bboxW / safeDepth);
            // Height from fixed per-class aspect ratio (top-down 2D view)
            const hRatio = classInfo.heightRatio || 1.5;
            const obsHeight = obsWidth * hRatio;

            // Map bbox centre to screen X (camera frame is 640px wide)
            const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
            const centreXnorm = (bboxX + bboxW / 2) / 640;   // 0..1
            const x = roadLeft + centreXnorm * CONFIG.road.width;

            // Map depth → Y  (0=far/top, 255=close/bottom)
            const y = this.distanceToY(depthValue);

            frame.push({
                id: `ai_${aiObj.id}`,
                type: 'detected',
                class: classInfo.name,
                x, y,
                width: obsWidth,
                height: obsHeight,
                color: classInfo.color,
                distance: depthValue,
                aiId: aiObj.id
            });
        }

        // Push into ring buffer, keep last N
        this._detectionFrames.push(frame);
        if (this._detectionFrames.length > this._N) {
            this._detectionFrames.shift();
        }
    }

    // Merge the last N frames into a single list (latest position wins per id)
    _mergedDetections() {
        const map = new Map();
        for (const frame of this._detectionFrames) {
            for (const obj of frame) {
                map.set(obj.aiId, obj);
            }
        }
        return Array.from(map.values());
    }

    // ── random / user obstacles ─────────────────────────────────
    addRandomObstacle() {
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        this.obstacles.push({
            id: `random_${this.nextId++}`,
            type: 'random',
            class: 'cone',
            x: roadLeft + Math.random() * CONFIG.road.width,
            y: -50,
            width: 30, height: 30,
            color: '#FF6B6B'
        });
    }

    addUserObstacle(data) {
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        this.obstacles.push({
            id: `user_${this.nextId++}`,
            type: 'user',
            class: 'barrel',
            x: data.x || (roadLeft + Math.random() * CONFIG.road.width),
            y: data.y || -50,
            width: 35, height: 35,
            color: '#FFA07A'
        });
    }

    // ── update (called every frame) ─────────────────────────────
    // worldSpeedPx: linear speed in px/s,  worldSteeringDeg: angle in degrees
    update(deltaTime, worldSpeedPx, worldSteeringDeg) {
        // Convert steering to velocity vector for non-detected obstacles.
        // steering angle is relative to vertical axis (positive = right).
        // From the car's point of view objects move in the opposite direction.
        const steerRad = (-worldSteeringDeg) * Math.PI / 180;
        const vx = worldSpeedPx * Math.sin(steerRad);
        const vy = worldSpeedPx * Math.cos(steerRad);  // positive = objects move downward

        const prevCount = this.obstacles.length;

        this.obstacles.forEach(o => {
            o.x += vx * deltaTime;
            o.y += vy * deltaTime;
        });

        // Remove off-screen & count passed
        const kept = [];
        for (const o of this.obstacles) {
            const onScreen = o.y < CONFIG.canvas.height + 100 &&
                o.y > -100 &&
                o.x > -100 &&
                o.x < CONFIG.canvas.width + 100;
            if (onScreen) {
                kept.push(o);
            } else {
                // Object left the screen → count as passed
                this.obstaclesPassed++;
            }
        }
        this.obstacles = kept;

        // Limit total
        if (this.obstacles.length > CONFIG.obstacles.maxVisible) {
            this.obstacles = this.obstacles.slice(-CONFIG.obstacles.maxVisible);
        }
    }

    spawnRandom(currentTime) {
        if (currentTime - this.lastSpawnTime > CONFIG.obstacles.spawnRate) {
            this.addRandomObstacle();
            this.lastSpawnTime = currentTime;
        }
    }

    // ── positioning: push detected obstacles so they never overlap ref point ──
    _positionDetected() {
        const refX = CONFIG.referencePoint.x;
        const refY = CONFIG.referencePoint.y;
        const detections = this._mergedDetections();

        for (const obs of detections) {
            const hw = obs.width / 2;
            const hh = obs.height / 2;

            // Rectangle of the obstacle
            let ox = obs.x;
            let oy = obs.y;

            // Check if refPoint is inside the obstacle rect
            if (refX >= ox - hw && refX <= ox + hw &&
                refY >= oy - hh && refY <= oy + hh) {
                // Push obstacle away along the line centre→ref until no overlap
                let dx = ox - refX;
                let dy = oy - refY;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.001) {
                    // Degenerate: push straight up
                    dx = 0; dy = -1;
                } else {
                    dx /= len; dy /= len;
                }
                // Nearest edge distance from centre along (dx,dy)
                // We need to push so that the ref is just outside the rect
                const edgeDistX = hw / (Math.abs(dx) || 1e-9);
                const edgeDistY = hh / (Math.abs(dy) || 1e-9);
                const pushDist = Math.min(edgeDistX, edgeDistY) + 2; // +2 margin
                obs.x = refX + dx * pushDist;
                obs.y = refY + dy * pushDist;
            }
        }
        return detections;
    }

    // ── collision ───────────────────────────────────────────────
    checkCollision(carX, carY, carWidth, carHeight) {
        const all = this.getAll();
        for (const obs of all) {
            if (this.rectanglesCollide(
                carX, carY, carWidth, carHeight,
                obs.x - obs.width / 2,
                obs.y - obs.height / 2,
                obs.width, obs.height
            )) {
                return obs;
            }
        }
        return null;
    }

    rectanglesCollide(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 &&
            y1 < y2 + h2 && y1 + h1 > y2;
    }

    // ── helpers ─────────────────────────────────────────────────
    // depth is the INVERSE of real distance:
    //   depth  0   → object is infinitely far  → top of screen  (minY)
    //   depth 255  → object is almost touching  → near ref point (maxY)
    distanceToY(depthValue) {
        const minY = 50;
        const maxY = CONFIG.referencePoint.y - CONFIG.car.height / 2 - 10;
        // depth 0→far(top), 255→close(bottom near ref point)
        const norm = Math.min(Math.max(depthValue / 255, 0), 1);
        return minY + norm * (maxY - minY);
    }

    // Return ALL obstacles (non-detected + positioned detections)
    getAll() {
        return this.obstacles.concat(this._positionDetected());
    }

    clear() {
        this.obstacles = [];
        this._detectionFrames = [];
        this.obstaclesPassed = 0;
    }

    count() {
        return this.getAll().length;
    }
}
