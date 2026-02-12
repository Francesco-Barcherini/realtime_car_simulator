// Keyboard Controls System

class Controls {
    constructor() {
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    handleKeyDown(e) {
        switch (e.key) {
            case 'ArrowUp':
                this.keys.up = true;
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.keys.down = true;
                e.preventDefault();
                break;
            case 'ArrowLeft':
                this.keys.left = true;
                e.preventDefault();
                break;
            case 'ArrowRight':
                this.keys.right = true;
                e.preventDefault();
                break;
        }
    }

    handleKeyUp(e) {
        switch (e.key) {
            case 'ArrowUp':
                this.keys.up = false;
                break;
            case 'ArrowDown':
                this.keys.down = false;
                break;
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'ArrowRight':
                this.keys.right = false;
                break;
        }
    }

    // Get current input state
    getInput() {
        return {
            gas: this.keys.up,
            brake: this.keys.down,
            left: this.keys.left,
            right: this.keys.right
        };
    }

    // Calculate car motion from arrow keys (relative to reference point)
    // Returns updated { carSpeed, carAngle }
    calculateCarMotion(carSpeed, carAngle, deltaTime) {
        const input = this.getInput();

        // Up/down change car speed (can go negative for reverse)
        if (input.gas) {
            carSpeed += CONFIG.physics.acceleration * deltaTime;
        } else if (input.brake) {
            carSpeed -= CONFIG.physics.deceleration * deltaTime;
        } else {
            // Friction towards 0
            if (carSpeed > 0) {
                carSpeed = Math.max(0, carSpeed - CONFIG.physics.friction * deltaTime);
            } else if (carSpeed < 0) {
                carSpeed = Math.min(0, carSpeed + CONFIG.physics.friction * deltaTime);
            }
        }

        // Clamp speed (negative allowed for reverse)
        carSpeed = Math.max(-CONFIG.physics.maxSpeed / 2,
            Math.min(CONFIG.physics.maxSpeed, carSpeed));

        // Left/right change heading direction
        if (input.left) {
            carAngle -= CONFIG.physics.rotationSpeed * deltaTime;
        }
        if (input.right) {
            carAngle += CONFIG.physics.rotationSpeed * deltaTime;
        }

        return { carSpeed, carAngle };
    }
}
