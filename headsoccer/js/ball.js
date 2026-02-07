class Ball {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = CANVAS_WIDTH / 2;
    this.y = 150;
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastTouchedBy = null; // 'p1' or 'p2'
  }

  update(deltaTime) {
    const dt = deltaTime / 1000;

    // Apply gravity
    this.velocityY += BALL_GRAVITY * dt;

    // Update position
    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;

    // Apply friction
    this.velocityX *= BALL_FRICTION;
    this.velocityY *= BALL_FRICTION;

    // Calculate goal boundaries
    const goalTop = FIELD_Y - GOAL_Y_OFFSET - GOAL_HEIGHT;
    const goalBottom = FIELD_Y - GOAL_Y_OFFSET;

    // Check if ball is in goal zone (vertically)
    const inGoalZone = this.y > goalTop && this.y < goalBottom;

    // Horizontal boundaries - only bounce if NOT in goal zone
    if (this.x - BALL_RADIUS < FIELD_LEFT) {
      if (!inGoalZone) {
        // Ball is outside goal zone, bounce it back
        this.x = FIELD_LEFT + BALL_RADIUS;
        this.velocityX = -this.velocityX * BALL_BOUNCE_DAMPING;
      }
      // Otherwise let it go through for goal detection
    }
    if (this.x + BALL_RADIUS > FIELD_RIGHT) {
      if (!inGoalZone) {
        // Ball is outside goal zone, bounce it back
        this.x = FIELD_RIGHT - BALL_RADIUS;
        this.velocityX = -this.velocityX * BALL_BOUNCE_DAMPING;
      }
      // Otherwise let it go through for goal detection
    }

    // Ground bounce
    if (this.y + BALL_RADIUS > FIELD_Y) {
      this.y = FIELD_Y - BALL_RADIUS;
      this.velocityY = -this.velocityY * BALL_BOUNCE_DAMPING;
      
      // Stop bouncing if velocity is very small
      if (Math.abs(this.velocityY) < 50) {
        this.velocityY = 0;
      }
    }

    // Top boundary
    if (this.y - BALL_RADIUS < 50) {
      this.y = 50 + BALL_RADIUS;
      this.velocityY = -this.velocityY * BALL_BOUNCE_DAMPING;
    }
  }

  getBoundingBox() {
    return {
      x: this.x - BALL_RADIUS,
      y: this.y - BALL_RADIUS,
      width: BALL_RADIUS * 2,
      height: BALL_RADIUS * 2
    };
  }

  applyForce(forceX, forceY) {
    this.velocityX += forceX;
    this.velocityY += forceY;
  }
}
