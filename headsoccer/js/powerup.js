class Powerup {
  constructor(type) {
    this.type = type;  // 'flame' or 'cage'
    this.x = FIELD_LEFT + Math.random() * (FIELD_RIGHT - FIELD_LEFT);
    this.y = 150 + Math.random() * 150;  // Spawn in upper-mid area
    this.lifetime = POWERUP_LIFETIME;
    this.active = true;
    
    // Visual bobbing animation
    this.bobOffset = 0;
    this.bobSpeed = 0.003;
  }

  update(deltaTime) {
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.active = false;
    }

    // Bob up and down
    this.bobOffset += this.bobSpeed * deltaTime;
  }

  getBoundingBox() {
    return {
      x: this.x - POWERUP_SIZE / 2,
      y: this.y - POWERUP_SIZE / 2 + Math.sin(this.bobOffset) * 5,
      width: POWERUP_SIZE,
      height: POWERUP_SIZE
    };
  }

  checkCollision(player) {
    const pBox = player.getHeadBox();
    const puBox = this.getBoundingBox();
    
    return pBox.x < puBox.x + puBox.width &&
           pBox.x + pBox.width > puBox.x &&
           pBox.y < puBox.y + puBox.height &&
           pBox.y + pBox.height > puBox.y;
  }
}

class FlameShot {
  constructor(x, y, direction, owner) {
    this.x = x;
    this.y = y;
    this.direction = direction;  // 1 for right, -1 for left
    this.owner = owner;  // 'p1' or 'p2'
    this.velocityX = direction * FLAME_SHOT_SPEED;
    this.active = true;
    this.lifetime = FLAME_SHOT_DURATION;
    this.blocked = false;
  }

  update(deltaTime) {
    const dt = deltaTime / 1000;
    this.x += this.velocityX * dt;
    this.lifetime -= deltaTime;

    // Check if out of bounds or expired
    if (this.lifetime <= 0 || this.x < FIELD_LEFT - 50 || this.x > FIELD_RIGHT + 50) {
      this.active = false;
    }
  }

  getBoundingBox() {
    return {
      x: this.x - FLAME_SHOT_SIZE / 2,
      y: this.y - FLAME_SHOT_SIZE / 2,
      width: FLAME_SHOT_SIZE,
      height: FLAME_SHOT_SIZE
    };
  }

  checkGoal() {
    const goalTop = FIELD_Y - GOAL_Y_OFFSET - GOAL_HEIGHT;
    const goalBottom = FIELD_Y - GOAL_Y_OFFSET;

    // Left goal
    if (this.x < FIELD_LEFT && this.y > goalTop && this.y < goalBottom) {
      return 'left';
    }
    // Right goal
    if (this.x > FIELD_RIGHT && this.y > goalTop && this.y < goalBottom) {
      return 'right';
    }
    return null;
  }

  checkPlayerBlock(player) {
    const pBox = player.getHeadBox();
    const fBox = this.getBoundingBox();
    
    return pBox.x < fBox.x + fBox.width &&
           pBox.x + pBox.width > fBox.x &&
           pBox.y < fBox.y + fBox.height &&
           pBox.y + pBox.height > fBox.y;
  }
}

class GoalCage {
  constructor(side) {
    this.side = side;  // 'left' or 'right'
    this.duration = CAGE_DURATION;
    this.active = true;
  }

  update(deltaTime) {
    this.duration -= deltaTime;
    if (this.duration <= 0) {
      this.active = false;
    }
  }

  getX() {
    return this.side === 'left' ? FIELD_LEFT : FIELD_RIGHT;
  }

  blocksGoal() {
    return this.active;
  }
}
