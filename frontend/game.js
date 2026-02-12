// Main Game Engine

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.controls = new Controls();
        this.obstacleManager = new ObstacleManager();
        this.mqttClient = new MQTTClient((type, data) => this.handleMQTTMessage(type, data));

        // Game state
        this.state = {
            running: false,
            gameOver: false,
            score: 0,
            // Car (arrow-key driven, relative to reference point)
            carSpeed: 0,            // px/s, can be negative
            carAngle: 0,            // degrees, 0 = straight up
            carX: CONFIG.car.x,
            carY: CONFIG.car.y,
            // World (RPi mouse driven)
            worldSpeed: 0,          // km/h from mouse/speed
            worldSteering: 0,       // degrees from mouse/steering
            obstacles: []
        };

        // Timing
        this.lastTime = 0;
        this.lastSpawnTime = 0;

        // UI elements
        this.speedDisplay = document.getElementById('speed-display');
        this.steeringDisplay = document.getElementById('steering-display');
        this.scoreDisplay = document.getElementById('score-display');
        this.obstaclesDisplay = document.getElementById('obstacles-display');
        this.gameOverScreen = document.getElementById('game-over');
        this.finalScoreDisplay = document.getElementById('final-score');
        this.restartBtn = document.getElementById('restart-btn');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.restartBtn.addEventListener('click', () => this.restart());
    }

    // Initialize and start game
    start() {
        console.log('Starting game...');
        this.state.running = true;
        this.state.gameOver = false;
        this.lastTime = performance.now();

        // Connect to MQTT broker
        this.mqttClient.connect();

        // Start game loop
        this.gameLoop();
    }

    // Main game loop
    gameLoop() {
        if (!this.state.running) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        // Update game state
        this.update(deltaTime, currentTime);

        // Render
        this.render();

        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }

    // Update game state
    update(deltaTime, currentTime) {
        if (this.state.gameOver) return;

        // 1. Arrow keys → car speed & heading
        const motion = this.controls.calculateCarMotion(
            this.state.carSpeed, this.state.carAngle, deltaTime
        );
        this.state.carSpeed = motion.carSpeed;
        this.state.carAngle = motion.carAngle;

        // 2. Move car (direction from carAngle, magnitude from carSpeed)
        const angleRad = this.state.carAngle * Math.PI / 180;
        this.state.carX += this.state.carSpeed * Math.sin(angleRad) * deltaTime;
        this.state.carY -= this.state.carSpeed * Math.cos(angleRad) * deltaTime;

        // Clamp car to canvas
        const hw = CONFIG.car.width / 2;
        const hh = CONFIG.car.height / 2;
        this.state.carX = Math.max(hw, Math.min(CONFIG.canvas.width - hw, this.state.carX));
        this.state.carY = Math.max(hh, Math.min(CONFIG.canvas.height - hh, this.state.carY));

        // 3. World scroll speed (km/h → px/s)
        const worldSpeedPx = this.state.worldSpeed / 0.36;

        // 4. Update obstacles (random/user scroll with world)
        this.obstacleManager.update(deltaTime, worldSpeedPx, this.state.worldSteering);

        // Spawn random obstacles
        this.obstacleManager.spawnRandom(currentTime);

        // Get all obstacles for rendering
        this.state.obstacles = this.obstacleManager.getAll();

        // 5. Check collisions at car's actual position
        const collision = this.obstacleManager.checkCollision(
            this.state.carX - hw,
            this.state.carY - hh,
            CONFIG.car.width,
            CONFIG.car.height
        );

        if (collision) {
            this.handleCollision(collision);
        }

        // 6. Score (based on world distance)
        if (this.state.worldSpeed > 0) {
            this.state.score += Math.floor(this.state.worldSpeed * deltaTime * 0.1);
        }

        // Update UI
        this.updateUI();
    }

    // Render game
    render() {
        this.renderer.render(this.state);

        if (this.state.gameOver) {
            this.renderer.drawGameOver();
        }
    }

    // Update UI elements
    updateUI() {
        this.speedDisplay.textContent = Math.round(this.state.worldSpeed);
        this.steeringDisplay.textContent = Math.round(this.state.worldSteering);
        this.scoreDisplay.textContent = this.state.score;
        this.obstaclesDisplay.textContent = this.obstacleManager.count();
    }

    // Handle MQTT messages
    handleMQTTMessage(type, data) {
        switch (type) {
            case 'mouseSpeed':
                // World scroll speed (km/h from RPi mouse)
                this.state.worldSpeed = data.speed;
                break;

            case 'mouseSteering':
                // World lateral drift (degrees from RPi mouse)
                this.state.worldSteering = data.angle;
                break;

            case 'mouseObstacle':
                // Add user obstacle
                this.obstacleManager.addUserObstacle(data);
                break;

            case 'aiObjects':
                // Add/update AI-detected obstacles
                if (Array.isArray(data)) {
                    data.forEach(obj => {
                        this.obstacleManager.addDetectedObstacle(obj);
                    });
                }
                break;
        }
    }

    // Handle collision
    handleCollision(obstacle) {
        console.log('Collision with:', obstacle);
        this.gameOver();
    }

    // Game over
    gameOver() {
        this.state.gameOver = true;
        this.state.running = false;

        // Show game over screen
        this.finalScoreDisplay.textContent = this.state.score;
        this.gameOverScreen.classList.remove('hidden');
    }

    // Restart game
    restart() {
        console.log('Restarting game...');

        // Hide game over screen
        this.gameOverScreen.classList.add('hidden');

        // Reset state
        this.state = {
            running: true,
            gameOver: false,
            score: 0,
            carSpeed: 0,
            carAngle: 0,
            carX: CONFIG.car.x,
            carY: CONFIG.car.y,
            worldSpeed: 0,
            worldSteering: 0,
            obstacles: []
        };

        // Clear obstacles
        this.obstacleManager.clear();

        // Restart game loop
        this.lastTime = performance.now();
        this.gameLoop();
    }

    // Stop game
    stop() {
        this.state.running = false;
        this.mqttClient.disconnect();
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.start();

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        game.stop();
    });
});
