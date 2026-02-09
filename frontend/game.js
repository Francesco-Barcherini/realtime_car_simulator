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
            velocity: { x: 0, y: 0, rotation: 0 },
            carRotation: 0,
            obstacles: [],
            mouseInput: {
                speed: null,
                steering: null
            }
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

        // Update velocity based on controls and mouse input
        this.state.velocity = this.controls.calculateVelocity(
            this.state.velocity,
            deltaTime,
            this.state.mouseInput
        );

        // Update car rotation for display
        this.state.carRotation = this.state.velocity.rotation || 0;

        // Update obstacles
        this.obstacleManager.update(deltaTime, this.state.velocity);

        // Spawn random obstacles
        this.obstacleManager.spawnRandom(currentTime);

        // Get all obstacles for rendering
        this.state.obstacles = this.obstacleManager.getAll();

        // Check collisions
        const collision = this.obstacleManager.checkCollision(
            CONFIG.car.x - CONFIG.car.width / 2,
            CONFIG.car.y - CONFIG.car.height / 2,
            CONFIG.car.width,
            CONFIG.car.height
        );

        if (collision) {
            this.handleCollision(collision);
        }

        // Update score (based on distance traveled)
        if (this.state.velocity.y > 0) {
            this.state.score += Math.floor(this.state.velocity.y * deltaTime * 0.1);
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
        this.speedDisplay.textContent = this.controls.getSpeed(this.state.velocity);
        this.steeringDisplay.textContent = Math.round(this.controls.getSteeringAngle(this.state.velocity));
        this.scoreDisplay.textContent = this.state.score;
        this.obstaclesDisplay.textContent = this.obstacleManager.count();
    }

    // Handle MQTT messages
    handleMQTTMessage(type, data) {
        switch (type) {
            case 'mouseSpeed':
                // Update mouse speed input
                this.state.mouseInput.speed = data.speed;
                break;

            case 'mouseSteering':
                // Update mouse steering input
                this.state.mouseInput.steering = data.angle;
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
            velocity: { x: 0, y: 0, rotation: 0 },
            carRotation: 0,
            obstacles: [],
            mouseInput: {
                speed: null,
                steering: null
            }
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
