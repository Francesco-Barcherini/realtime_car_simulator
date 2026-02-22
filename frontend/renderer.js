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
        const steeringDeg = gameState.worldSteering || 0;
        this.drawRoad(worldSpeedPx, steeringDeg);
        this.drawObstacles(gameState.obstacles);
        this.drawCar(gameState.carX, gameState.carY, gameState.carAngle);
    }

    // Clear canvas
    clear() {
        this.ctx.fillStyle = CONFIG.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw road with curved lines above refY, straight below refY
    drawRoad(scrollSpeed, steeringDeg) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const halfRoad = CONFIG.road.width / 2;
        const centreX = W / 2;
        const roadLeft = centreX - halfRoad;
        const roadRight = centreX + halfRoad;
        const refY = CONFIG.referencePoint.y;

        // Scrolling offset (positive speed → dashes move downward)
        this.roadOffset -= scrollSpeed * 0.016;
        this.roadOffset = ((this.roadOffset % 60) + 60) % 60;

        const absTheta = Math.abs(steeringDeg);

        if (absTheta < 0.5) {
            // ── straight road ────────────────────────────────────
            // Road background
            this.ctx.fillStyle = CONFIG.colors.road;
            this.ctx.fillRect(roadLeft, 0, CONFIG.road.width, H);

            // Edges
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(roadLeft, 0);
            this.ctx.lineTo(roadLeft, H);
            this.ctx.moveTo(roadRight, 0);
            this.ctx.lineTo(roadRight, H);
            this.ctx.stroke();

            // Dashed centre
            this.ctx.strokeStyle = CONFIG.colors.roadLine;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([30, 30]);
            this.ctx.lineDashOffset = this.roadOffset;
            this.ctx.beginPath();
            this.ctx.moveTo(centreX, 0);
            this.ctx.lineTo(centreX, H);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;
        } else {
            // ── curved road (above refY) + straight (below refY) ─
            const thetaRad = absTheta * Math.PI / 180;
            const d = H / Math.sin(thetaRad); // centre-line radius

            // Circle centre sits at refY, offset left or right
            // steering > 0 (car turns right) → circle centre to the RIGHT
            // steering < 0 (car turns left)  → circle centre to the LEFT
            const cx = steeringDeg > 0 ? centreX + d : centreX - d;
            const cy = refY;

            const k = halfRoad; // half road width

            // Inner edge radius (closer to circle centre) and outer
            const rInner = d - k;
            const rOuter = d + k;

            // Angle where the centre arc meets (centreX, refY)
            const refAngle = Math.atan2(refY - cy, centreX - cx);
            // We need enough sweep to cover the full canvas width at y=0
            const sweep = Math.PI * 0.6;

            // Determine arc direction so it sweeps UPWARD on screen:
            //  steering > 0 → cx to the right → refAngle = π
            //     upward = increasing angle (π → 3π/2) → anticlockwise = false
            //  steering < 0 → cx to the left  → refAngle = 0
            //     upward = decreasing angle (0 → −π/2) → anticlockwise = true
            let arcStart, arcEnd, ccw;
            if (steeringDeg > 0) {
                arcStart = refAngle;
                arcEnd = refAngle + sweep;
                ccw = false;
            } else {
                arcStart = refAngle;
                arcEnd = refAngle - sweep;
                ccw = true;
            }

            // ── BELOW refY: straight background + lines ──────────
            this.ctx.fillStyle = CONFIG.colors.road;
            this.ctx.fillRect(roadLeft, refY, CONFIG.road.width, H - refY);

            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(roadLeft, refY);
            this.ctx.lineTo(roadLeft, H);
            this.ctx.moveTo(roadRight, refY);
            this.ctx.lineTo(roadRight, H);
            this.ctx.stroke();

            this.ctx.strokeStyle = CONFIG.colors.roadLine;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([30, 30]);
            this.ctx.lineDashOffset = this.roadOffset;
            this.ctx.beginPath();
            this.ctx.moveTo(centreX, refY);
            this.ctx.lineTo(centreX, H);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;

            // ── ABOVE refY: curved background + lines ────────────
            // Clip to above-refY
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(0, 0, W, refY);
            this.ctx.clip();

            // Fill the curved road band (annular sector between rInner and rOuter)
            this.ctx.fillStyle = CONFIG.colors.road;
            this.ctx.beginPath();
            // Outer arc in one direction
            this.ctx.arc(cx, cy, rOuter, arcStart, arcEnd, ccw);
            // Inner arc back in the opposite direction to close the shape
            this.ctx.arc(cx, cy, rInner, arcEnd, arcStart, !ccw);
            this.ctx.closePath();
            this.ctx.fill();

            // Draw edge arcs
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, rInner, arcStart, arcEnd, ccw);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, rOuter, arcStart, arcEnd, ccw);
            this.ctx.stroke();

            // Dashed centre arc
            this.ctx.strokeStyle = CONFIG.colors.roadLine;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([30, 30]);
            this.ctx.lineDashOffset = -this.roadOffset;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, d, arcStart, arcEnd, ccw);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;

            this.ctx.restore(); // remove clip
        }
    }

    // Draw all obstacles
    drawObstacles(obstacles) {
        obstacles.forEach(obstacle => this.drawObstacle(obstacle));
    }

    // Draw single obstacle
    drawObstacle(obstacle) {
        const x = obstacle.x;
        const y = obstacle.y;
        const w = obstacle.width;
        const h = obstacle.height;

        this.ctx.save();
        this.ctx.translate(x, y);

        if (obstacle.type === 'detected') {
            // Dispatch to per-class icon drawing
            switch (obstacle.class) {
                case 'car':       this._drawCar2D(w, h, obstacle.color); break;
                case 'truck':     this._drawTruck2D(w, h, obstacle.color); break;
                case 'bus':       this._drawBus2D(w, h, obstacle.color); break;
                case 'person':    this._drawPerson2D(w, h, obstacle.color); break;
                case 'bicycle':   this._drawBicycle2D(w, h, obstacle.color); break;
                case 'motorcycle': this._drawMotorcycle2D(w, h, obstacle.color); break;
                default:          this._drawGeneric2D(w, h, obstacle.color); break;
            }

            // Label + distance
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(obstacle.class, 0, -h / 2 - 5);
            if (obstacle.distance != null) {
                this.ctx.fillText(`d:${Math.round(obstacle.distance)}`, 0, h / 2 + 15);
            }
        } else if (obstacle.type === 'random') {
            // Cone
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
            // Barrel
            this.ctx.fillStyle = obstacle.color;
            this.ctx.fillRect(-w / 2, -h / 2, w, h);
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(-w / 2, -h / 6, w, h / 3);
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-w / 2, -h / 2, w, h);
        }

        this.ctx.restore();
    }

    // Draw the player's car
    drawCar(carX, carY, rotation) {
        const w = CONFIG.car.width;
        const h = CONFIG.car.height;

        this.ctx.save();
        this.ctx.translate(carX, carY);
        this.ctx.rotate((rotation || 0) * Math.PI / 180);

        this.ctx.fillStyle = CONFIG.colors.car;
        this.ctx.fillRect(-w / 2, -h / 2, w, h);

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

    // ── Per-class top-down icon renderers ───────────────────────
    // All drawn centred at (0,0) within the obstacle's w×h bounds.

    // Car: rounded body, rear window, two headlights
    _drawCar2D(w, h, color) {
        const ctx = this.ctx;
        const r = Math.min(w, h) * 0.18;
        // Body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-w/2 + r, -h/2);
        ctx.lineTo( w/2 - r, -h/2);
        ctx.quadraticCurveTo( w/2, -h/2,  w/2, -h/2 + r);
        ctx.lineTo( w/2,  h/2 - r);
        ctx.quadraticCurveTo( w/2,  h/2,  w/2 - r,  h/2);
        ctx.lineTo(-w/2 + r,  h/2);
        ctx.quadraticCurveTo(-w/2,  h/2, -w/2,  h/2 - r);
        ctx.lineTo(-w/2, -h/2 + r);
        ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
        // Windshield (front = top)
        ctx.fillStyle = 'rgba(150,220,255,0.6)';
        ctx.fillRect(-w/2 + w*0.15, -h/2 + h*0.05, w*0.7, h*0.22);
        // Rear window
        ctx.fillStyle = 'rgba(150,220,255,0.35)';
        ctx.fillRect(-w/2 + w*0.2,  h/2 - h*0.25, w*0.6, h*0.18);
        // Headlights
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(-w/2 + 3, -h/2 + 1, w*0.18, h*0.06);
        ctx.fillRect( w/2 - 3 - w*0.18, -h/2 + 1, w*0.18, h*0.06);
        // Tail lights
        ctx.fillStyle = '#FF2020';
        ctx.fillRect(-w/2 + 3, h/2 - h*0.06, w*0.15, h*0.05);
        ctx.fillRect( w/2 - 3 - w*0.15, h/2 - h*0.06, w*0.15, h*0.05);
    }

    // Truck: elongated box, cab at front, cargo area
    _drawTruck2D(w, h, color) {
        const ctx = this.ctx;
        // Cargo
        ctx.fillStyle = color;
        ctx.fillRect(-w/2, -h/2 + h*0.25, w, h*0.75);
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-w/2, -h/2 + h*0.25, w, h*0.75);
        // Cab
        const cabColor = this._lighten(color, 30);
        ctx.fillStyle = cabColor;
        ctx.fillRect(-w/2 + w*0.1, -h/2, w*0.8, h*0.3);
        ctx.strokeRect(-w/2 + w*0.1, -h/2, w*0.8, h*0.3);
        // Windshield
        ctx.fillStyle = 'rgba(150,220,255,0.6)';
        ctx.fillRect(-w/2 + w*0.2, -h/2 + h*0.03, w*0.6, h*0.12);
        // Headlights
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(-w/2 + w*0.1, -h/2 + 1, w*0.15, h*0.05);
        ctx.fillRect( w/2 - w*0.1 - w*0.15, -h/2 + 1, w*0.15, h*0.05);
    }

    // Bus: long rectangle, row of windows
    _drawBus2D(w, h, color) {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-w/2, -h/2, w, h);
        // Window strip (left + right sides)
        ctx.fillStyle = 'rgba(150,220,255,0.5)';
        const winH = h * 0.06;
        const gap = h * 0.1;
        for (let wy = -h/2 + h*0.12; wy < h/2 - h*0.1; wy += gap) {
            ctx.fillRect(-w/2 + 2, wy, w*0.12, winH);
            ctx.fillRect( w/2 - 2 - w*0.12, wy, w*0.12, winH);
        }
        // Front windshield
        ctx.fillStyle = 'rgba(150,220,255,0.6)';
        ctx.fillRect(-w/2 + w*0.15, -h/2 + h*0.02, w*0.7, h*0.08);
    }

    // Person: circle head + body oval (from above)
    _drawPerson2D(w, h, color) {
        const ctx = this.ctx;
        const headR = w * 0.35;
        // Head (circle at top)
        ctx.fillStyle = '#FFD5A0';
        ctx.beginPath();
        ctx.arc(0, -h/2 + headR + 1, headR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
        // Body (ellipse below head)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, h*0.15, w*0.4, h*0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Bicycle: two wheels + frame triangle
    _drawBicycle2D(w, h, color) {
        const ctx = this.ctx;
        const wheelR = w * 0.3;
        // Rear wheel (bottom)
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, h/2 - wheelR - 1, wheelR, 0, Math.PI * 2);
        ctx.stroke();
        // Front wheel (top)
        ctx.beginPath();
        ctx.arc(0, -h/2 + wheelR + 1, wheelR, 0, Math.PI * 2);
        ctx.stroke();
        // Frame
        ctx.strokeStyle = color; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -h/2 + wheelR + 1);
        ctx.lineTo(-w*0.15, 0);
        ctx.lineTo( w*0.15, 0);
        ctx.lineTo(0, h/2 - wheelR - 1);
        ctx.stroke();
        // Handlebars
        ctx.beginPath();
        ctx.moveTo(-w*0.35, -h/2 + wheelR*0.7);
        ctx.lineTo( w*0.35, -h/2 + wheelR*0.7);
        ctx.stroke();
        // Seat dot
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(0, h*0.05, w*0.1, 0, Math.PI * 2);
        ctx.fill();
    }

    // Motorcycle: similar to bicycle but thicker wheels + engine block
    _drawMotorcycle2D(w, h, color) {
        const ctx = this.ctx;
        const wheelR = w * 0.32;
        // Rear wheel
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(0, h/2 - wheelR - 1, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.stroke();
        // Front wheel
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(0, -h/2 + wheelR + 1, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.stroke();
        // Body/engine block
        ctx.fillStyle = color;
        ctx.fillRect(-w*0.3, -h*0.12, w*0.6, h*0.25);
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1; ctx.strokeRect(-w*0.3, -h*0.12, w*0.6, h*0.25);
        // Exhaust
        ctx.fillStyle = '#888';
        ctx.fillRect(w*0.2, h*0.1, w*0.2, h*0.06);
        // Handlebars
        ctx.strokeStyle = '#CCC'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w*0.4, -h/2 + wheelR*0.5);
        ctx.lineTo( w*0.4, -h/2 + wheelR*0.5);
        ctx.stroke();
    }

    // Fallback for unknown classes
    _drawGeneric2D(w, h, color) {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2;
        ctx.strokeRect(-w/2, -h/2, w, h);
        ctx.fillStyle = '#FFF'; ctx.font = `${Math.max(8, w*0.3)|0}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
    }

    // Utility: lighten a hex colour by `amount` (0–255)
    _lighten(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, ((num >> 16) & 0xFF) + amount);
        const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
        const b = Math.min(255, (num & 0xFF) + amount);
        return `rgb(${r},${g},${b})`;
    }

    // Draw game over overlay
    drawGameOver() {
        this.ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
