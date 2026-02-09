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

    // Calculate velocity based on input (vector sum)
    calculateVelocity(currentVelocity, deltaTime, mouseInput = null) {
        const input = this.getInput();
        let velocity = { ...currentVelocity };

        // Forward/backward acceleration (Y axis)
        if (input.gas) {
            velocity.y += CONFIG.physics.acceleration * deltaTime;
        } else if (input.brake) {
            velocity.y -= CONFIG.physics.deceleration * deltaTime;
        } else {
            // Apply friction when no input
            if (velocity.y > 0) {
                velocity.y = Math.max(0, velocity.y - CONFIG.physics.friction * deltaTime);
            } else if (velocity.y < 0) {
                velocity.y = Math.min(0, velocity.y + CONFIG.physics.friction * deltaTime);
            }
        }

        // Clamp forward speed
        velocity.y = Math.max(-CONFIG.physics.maxSpeed / 2,
            Math.min(CONFIG.physics.maxSpeed, velocity.y));

        // Lateral movement (X axis) - steering
        let targetRotation = 0;
        if (input.left) {
            targetRotation = -CONFIG.physics.maxRotation;
        } else if (input.right) {
            targetRotation = CONFIG.physics.maxRotation;
        }

        // Apply mouse steering if available
        if (mouseInput && mouseInput.steering !== undefined) {
            targetRotation = mouseInput.steering;
        }

        // Convert rotation to lateral velocity
        // More speed = more lateral movement when turning
        const speedFactor = Math.abs(velocity.y) / CONFIG.physics.maxSpeed;
        velocity.x = (targetRotation / CONFIG.physics.maxRotation) * 100 * speedFactor;

        // Store current rotation for display
        velocity.rotation = targetRotation;

        // Apply mouse speed if available
        if (mouseInput && mouseInput.speed !== undefined) {
            // Mouse speed is normalized 0-1
            velocity.y = mouseInput.speed * CONFIG.physics.maxSpeed;
        }

        return velocity;
    }

    // Get current steering angle for display
    getSteeringAngle(velocity) {
        return velocity.rotation || 0;
    }

    // Get current speed in km/h for display
    getSpeed(velocity) {
        // Convert pixels/sec to km/h (arbitrary conversion for display)
        const pixelsPerSecond = Math.abs(velocity.y);
        return Math.round(pixelsPerSecond * 0.36); // rough conversion
    }
}
