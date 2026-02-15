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
            // Car (arrow-key driven, relative to reference point)
            carSpeed: 0,
            carAngle: 0,
            carX: CONFIG.car.x,
            carY: CONFIG.car.y,
            // World (RPi mouse driven)
            worldSpeed: 0,
            worldSteering: 0,
            obstacles: []
        };

        // Scoring
        this.gameStartTime = 0;   // ms timestamp when game started
        this.gameElapsed = 0;     // seconds survived

        // Timing
        this.lastTime = 0;
        this.lastSpawnTime = 0;

        // UI elements
        this.speedDisplay = document.getElementById('speed-display');
        this.steeringDisplay = document.getElementById('steering-display');
        this.scoreDisplay = document.getElementById('score-display');
        this.obstaclesDisplay = document.getElementById('obstacles-display');
        this.gameOverScreen = document.getElementById('game-over');
        this.finalTimeDisplay = document.getElementById('final-time');
        this.finalPassedDisplay = document.getElementById('final-passed');
        this.restartBtn = document.getElementById('restart-btn');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.restartBtn.addEventListener('click', () => this.restart());
    }

    start() {
        console.log('Starting game...');
        this.state.running = true;
        this.state.gameOver = false;
        this.gameStartTime = performance.now();
        this.lastTime = performance.now();
        this.mqttClient.connect();
        this.gameLoop();
    }

    gameLoop() {
        if (!this.state.running) return;
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        this.update(deltaTime, currentTime);
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    update(deltaTime, currentTime) {
        if (this.state.gameOver) return;

        // Elapsed game time
        this.gameElapsed = (currentTime - this.gameStartTime) / 1000;

        // 1. Arrow keys → car speed & heading
        const motion = this.controls.calculateCarMotion(
            this.state.carSpeed, this.state.carAngle, deltaTime
        );
        this.state.carSpeed = motion.carSpeed;
        this.state.carAngle = motion.carAngle;

        // 2. Move car
        const angleRad = this.state.carAngle * Math.PI / 180;
        this.state.carX += this.state.carSpeed * Math.sin(angleRad) * deltaTime;
        this.state.carY -= this.state.carSpeed * Math.cos(angleRad) * deltaTime;

        // Clamp car to canvas
        const hw = CONFIG.car.width / 2;
        const hh = CONFIG.car.height / 2;
        this.state.carX = Math.max(hw, Math.min(CONFIG.canvas.width - hw, this.state.carX));
        this.state.carY = Math.max(hh, Math.min(CONFIG.canvas.height - hh, this.state.carY));

        // 3. World speed (km/h → px/s)
        const worldSpeedPx = this.state.worldSpeed / 0.36;

        // 4. Update obstacles with proper steering vector
        this.obstacleManager.update(deltaTime, worldSpeedPx, this.state.worldSteering);
        this.obstacleManager.spawnRandom(currentTime);

        // Get all obstacles for rendering
        this.state.obstacles = this.obstacleManager.getAll();

        // 5. Collision
        const collision = this.obstacleManager.checkCollision(
            this.state.carX - hw, this.state.carY - hh,
            CONFIG.car.width, CONFIG.car.height
        );
        if (collision) this.handleCollision(collision);

        this.updateUI();
    }

    render() {
        this.renderer.render(this.state);
        if (this.state.gameOver) this.renderer.drawGameOver();
    }

    updateUI() {
        this.speedDisplay.textContent = Math.round(this.state.worldSpeed);
        this.steeringDisplay.textContent = Math.round(this.state.worldSteering);
        // Show elapsed time as score
        this.scoreDisplay.textContent = this.formatTime(this.gameElapsed);
        this.obstaclesDisplay.textContent = this.obstacleManager.obstaclesPassed;
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    handleMQTTMessage(type, data) {
        switch (type) {
            case 'mouseSpeed':
                this.state.worldSpeed = data.speed;
                break;
            case 'mouseSteering':
                this.state.worldSteering = data.angle;
                break;
            case 'mouseObstacle':
                this.obstacleManager.addUserObstacle(data);
                break;
            case 'aiObjects':
                // Replace detected obstacles with full frame
                if (Array.isArray(data)) {
                    this.obstacleManager.setDetectedFrame(data);
                }
                break;
        }
    }

    handleCollision(obstacle) {
        console.log('Collision with:', obstacle);
        this.gameOver();
    }

    gameOver() {
        this.state.gameOver = true;
        this.state.running = false;

        // Show game over with time + obstacles passed
        this.finalTimeDisplay.textContent = this.formatTime(this.gameElapsed);
        this.finalPassedDisplay.textContent = this.obstacleManager.obstaclesPassed;
        this.gameOverScreen.classList.remove('hidden');
    }

    restart() {
        console.log('Restarting game...');
        this.gameOverScreen.classList.add('hidden');

        this.state = {
            running: true,
            gameOver: false,
            carSpeed: 0,
            carAngle: 0,
            carX: CONFIG.car.x,
            carY: CONFIG.car.y,
            worldSpeed: 0,
            worldSteering: 0,
            obstacles: []
        };

        this.obstacleManager.clear();
        this.gameStartTime = performance.now();
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stop() {
        this.state.running = false;
        this.mqttClient.disconnect();
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.start();
    window.addEventListener('beforeunload', () => game.stop());
});
