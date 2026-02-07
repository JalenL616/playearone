class Paddle {
  constructor(x, y, width, height, speed, upKey, downKey) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.upKey = upKey;
    this.downKey = downKey;

    this.velocity = 0;
    this.acceleration = 1.2;
    this.friction = 0.8;
  }

  update(keys, canvasHeight) {
    if (keys[this.upKey]) {
      this.velocity -= this.acceleration;
    }
    if (keys[this.downKey]) {
      this.velocity += this.acceleration;
    }

    // Clamp velocity to max speed
    if (this.velocity > this.speed) this.velocity = this.speed;
    if (this.velocity < -this.speed) this.velocity = -this.speed;

    // Apply friction when no input
    if (!keys[this.upKey] && !keys[this.downKey]) {
      this.velocity *= this.friction;
      if (Math.abs(this.velocity) < 0.1) this.velocity = 0;
    }

    this.y += this.velocity;

    // Clamp within canvas bounds
    if (this.y < 0) {
      this.y = 0;
      this.velocity = 0;
    }
    if (this.y + this.height > canvasHeight) {
      this.y = canvasHeight - this.height;
      this.velocity = 0;
    }
  }
}
