// 2D Rendering System

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.canvas.width = CONFIG.canvas.width;
        this.canvas.height = CONFIG.canvas.height;

        this.roadOffset = 0; // For scrolling effect
    }

    // Main render function
    render(gameState) {
        this.clear();
        const worldSpeedPx = (gameState.worldSpeed || 0) / 0.36;
        this.drawRoad(worldSpeedPx);
        this.drawObstacles(gameState.obstacles);
        this.drawCar(gameState.carX, gameState.carY, gameState.carAngle);
    }

    // Clear canvas
    clear() {
        this.ctx.fillStyle = CONFIG.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw scrolling road
    drawRoad(scrollSpeed) {
        const roadLeft = (CONFIG.canvas.width - CONFIG.road.width) / 2;
        const roadRight = roadLeft + CONFIG.road.width;

        // Road background
        this.ctx.fillStyle = CONFIG.colors.road;
        this.ctx.fillRect(roadLeft, 0, CONFIG.road.width, CONFIG.canvas.height);

        // Road edges
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(roadLeft, 0);
        this.ctx.lineTo(roadLeft, CONFIG.canvas.height);
        this.ctx.moveTo(roadRight, 0);
        this.ctx.lineTo(roadRight, CONFIG.canvas.height);
        this.ctx.stroke();

        // Lane dividers (scrolling dashed lines)
        this.roadOffset -= scrollSpeed * 0.016; // negative so dashes move top→bottom
        this.roadOffset = ((this.roadOffset % 60) + 60) % 60; // wrap both directions

        this.ctx.strokeStyle = CONFIG.colors.roadLine;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([30, 30]);

        const laneWidth = CONFIG.road.width / CONFIG.road.laneCount;
        for (let i = 1; i < CONFIG.road.laneCount; i++) {
            const x = roadLeft + (laneWidth * i);
            this.ctx.beginPath();
            this.ctx.moveTo(x, -this.roadOffset);
            this.ctx.lineTo(x, CONFIG.canvas.height);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]); // Reset dash
    }

    // Draw all obstacles
    drawObstacles(obstacles) {
        obstacles.forEach(obstacle => {
            this.drawObstacle(obstacle);
        });
    }

    // Draw single obstacle
    drawObstacle(obstacle) {
        const x = obstacle.x;
        const y = obstacle.y;
        const w = obstacle.width;
        const h = obstacle.height;

        this.ctx.save();
        this.ctx.translate(x, y);

        // Draw obstacle based on type
        if (obstacle.type === 'detected') {
            // AI-detected objects - draw as rectangles with class label
            this.ctx.fillStyle = obstacle.color;
            this.ctx.fillRect(-w / 2, -h / 2, w, h);

            // Border
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-w / 2, -h / 2, w, h);

            // Label
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(obstacle.class, 0, -h / 2 - 5);

            // Distance (relative depth)
            if (obstacle.distance != null) {
                this.ctx.fillText(`d:${Math.round(obstacle.distance)}`, 0, h / 2 + 15);
            }
        } else if (obstacle.type === 'random') {
            // Random obstacles - draw as cones
            this.ctx.fillStyle = obstacle.color;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -h / 2);
            this.ctx.lineTo(-w / 2, h / 2);
            this.ctx.lineTo(w / 2, h / 2);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        } else if (obstacle.type === 'user') {
            // User obstacles - draw as barrels
            this.ctx.fillStyle = obstacle.color;
            this.ctx.fillRect(-w / 2, -h / 2, w, h);

            // Stripes
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(-w / 2, -h / 6, w, h / 3);

            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-w / 2, -h / 2, w, h);
        }

        this.ctx.restore();
    }

    // Draw the player's car at its current position
    drawCar(carX, carY, rotation) {
        const w = CONFIG.car.width;
        const h = CONFIG.car.height;

        this.ctx.save();
        this.ctx.translate(carX, carY);
        this.ctx.rotate((rotation || 0) * Math.PI / 180);

        // Car body
        this.ctx.fillStyle = CONFIG.colors.car;
        this.ctx.fillRect(-w / 2, -h / 2, w, h);

        // Car details
        // Windshield
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, h / 3);

        // Headlights
        this.ctx.fillStyle = '#FFFF00';
        this.ctx.fillRect(-w / 2 + 5, -h / 2, 8, 5);
        this.ctx.fillRect(w / 2 - 13, -h / 2, 8, 5);

        // Border
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(-w / 2, -h / 2, w, h);

        this.ctx.restore();
    }

    // Draw game over effect
    drawGameOver() {
        this.ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
