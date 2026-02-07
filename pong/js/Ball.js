class Ball {
  constructor(x, y, radius, speed) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.speed = speed;
    this.dx = speed;
    this.dy = speed;
    this.speedMultiplier = 1;
  }

  update() {
    const maxSpeed = 15; // Maximum absolute velocity
    
    this.x += this.dx * this.speedMultiplier;
    this.y += this.dy * this.speedMultiplier;
    
    // Ensure velocities don't exceed maximum
    const currentSpeedX = Math.abs(this.dx * this.speedMultiplier);
    const currentSpeedY = Math.abs(this.dy * this.speedMultiplier);
    
    if (currentSpeedX > maxSpeed) {
      this.dx = (this.dx > 0 ? 1 : -1) * maxSpeed / this.speedMultiplier;
    }
    if (currentSpeedY > maxSpeed) {
      this.dy = (this.dy > 0 ? 1 : -1) * maxSpeed / this.speedMultiplier;
    }
  }

  reverseX() {
    this.dx = -this.dx;
  }

  reverseY() {
    this.dy = -this.dy;
    
    // Prevent perfectly horizontal movement
    if (Math.abs(this.dy) < 1) {
      this.dy = this.dy < 0 ? -1.5 : 1.5;
    }
  }

  increaseDifficulty() {
    this.speedMultiplier = Math.min(this.speedMultiplier + 0.15, 2.5);
  }

  reset(canvasWidth, canvasHeight, serveDirection = null) {
    this.x = canvasWidth / 2;
    this.y = canvasHeight / 2;
    this.speedMultiplier = 1;
    
    // Set horizontal direction
    if (serveDirection === 'left') {
      this.dx = -this.speed; // Serve toward left player
    } else if (serveDirection === 'right') {
      this.dx = this.speed; // Serve toward right player
    } else {
      this.dx = (Math.random() > 0.5 ? 1 : -1) * this.speed;
    }
    
    // Random vertical angle between -0.7 and 0.7 of speed
    this.dy = (Math.random() * 1.4 - 0.7) * this.speed;
  }
}
