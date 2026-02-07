class Player {
  constructor(x, side, color) {
    this.startX = x;
    this.side = side;          // 'left' or 'right'
    this.color = color;
    
    // Powerup - each player gets alternating powerups
    this.powerupType = side === 'left' ? 'flame' : 'cage';  // P1 gets flame, P2 gets cage
    this.powerupReady = false;
    this.powerupReloadTimer = POWERUP_RELOAD_TIME;  // Start with full reload
    
    this.reset();
  }

  reset() {
    this.x = this.startX;
    this.y = FIELD_Y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.isGrounded = true;
    this.facing = this.side === 'left' ? 'right' : 'left';
    
    // Kick cooldown
    this.kickCooldown = 0;
    
    // Reset powerup timer
    this.powerupReady = false;
    this.powerupReloadTimer = POWERUP_RELOAD_TIME;
  }

  update(deltaTime) {
    const dt = deltaTime / 1000; // convert to seconds

    // Apply gravity
    if (!this.isGrounded) {
      this.velocityY += GRAVITY * dt;
    }

    // Update position
    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;

    // Horizontal boundaries
    this.x = Math.max(FIELD_LEFT + PLAYER_WIDTH / 2, Math.min(FIELD_RIGHT - PLAYER_WIDTH / 2, this.x));

    // Ground collision
    if (this.y >= FIELD_Y) {
      this.y = FIELD_Y;
      this.velocityY = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // Apply friction when grounded
    if (this.isGrounded) {
      this.velocityX *= 0.85;
      if (Math.abs(this.velocityX) < 5) {
        this.velocityX = 0;
      }
    } else {
      // Air resistance
      this.velocityX *= 0.98;
    }

    // Update kick cooldown
    if (this.kickCooldown > 0) {
      this.kickCooldown -= deltaTime;
    }

    // Update powerup reload timer
    if (!this.powerupReady) {
      this.powerupReloadTimer -= deltaTime;
      if (this.powerupReloadTimer <= 0) {
        this.powerupReady = true;
        this.powerupReloadTimer = 0;
      }
    }
  }

  moveLeft(speedMultiplier = 1.0) {
    this.velocityX = -MOVE_SPEED * speedMultiplier;
    this.facing = 'left';
  }

  moveRight(speedMultiplier = 1.0) {
    this.velocityX = MOVE_SPEED * speedMultiplier;
    this.facing = 'right';
  }

  jump() {
    if (this.isGrounded) {
      this.velocityY = -JUMP_FORCE;
      this.isGrounded = false;
    }
  }

  canKick() {
    return this.kickCooldown <= 0;
  }

  kick() {
    if (this.canKick()) {
      this.kickCooldown = 300; // 300ms cooldown
      return true;
    }
    return false;
  }

  getHeadBox() {
    // Return bounding box for the head (for heading the ball)
    return {
      x: this.x - PLAYER_HEAD_RADIUS,
      y: this.y - PLAYER_HEIGHT - PLAYER_HEAD_RADIUS * 2,
      width: PLAYER_HEAD_RADIUS * 2,
      height: PLAYER_HEAD_RADIUS * 2
    };
  }

  getBodyBox() {
    // Return bounding box for the body (for kicking)
    return {
      x: this.x - PLAYER_WIDTH / 2,
      y: this.y - PLAYER_HEIGHT,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT
    };
  }

  getKickPoint() {
    // Point where kick originates (front of player)
    const offset = this.facing === 'right' ? PLAYER_WIDTH / 2 : -PLAYER_WIDTH / 2;
    return {
      x: this.x + offset,
      y: this.y - PLAYER_HEIGHT / 2
    };
  }
}