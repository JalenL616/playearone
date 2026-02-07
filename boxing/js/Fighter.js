class Fighter {
  constructor(x, facing, color) {
    this.x = x;
    this.startX = x;
    this.y = RING_Y;
    this.facing = facing;       // 'right' or 'left'
    this.color = color;

    this.maxHealth = 100;
    this.health = 100;
    this.isAlive = true;

    // Stamina
    this.stamina = MAX_STAMINA;

    // State: idle, attacking, blocking, dodging, hurt, KO
    this.state = 'idle';
    this.actionCooldown = 0;

    // Attack
    this.currentAttack = null;
    this.attackTimer = 0;
    this.attackActive = false;  // true during hit window

    // Block
    this.blockTimer = 0;

    // Dodge
    this.isInvincible = false;
    this.dodgeTimer = 0;

    // Knockdown
    this.knockdowns = 0;
    this.knockdownTimer = 0;
    this.isKnockedDown = false;

    // Hit feedback
    this.flashTimer = 0;
    this.lastDamageTaken = 0;

    // Stats
    this.stats = {
      punchesThrown: 0,
      punchesLanded: 0,
      damageDealt: 0,
      damageTaken: 0,
      blocksUsed: 0,
      dodgesUsed: 0
    };
  }

  update(deltaTime, opponentX) {
    // Update facing
    this.facing = opponentX > this.x ? 'right' : 'left';

    // Cooldown
    if (this.actionCooldown > 0) {
      this.actionCooldown -= deltaTime;
    }

    // Attack timing
    if (this.currentAttack) {
      this.attackTimer += deltaTime;

      // Hit window: 30%-70% of duration
      this.attackActive = (
        this.attackTimer > this.currentAttack.duration * 0.3 &&
        this.attackTimer < this.currentAttack.duration * 0.7
      );

      if (this.attackTimer >= this.currentAttack.duration) {
        this.endAttack();
      }
    }

    // Block stamina drain
    if (this.state === 'blocking') {
      // Drain stamina while blocking
      this.stamina = Math.max(0, this.stamina - BLOCK_STAMINA_COST * (deltaTime / 1000));
      if (this.stamina <= 0) {
        this.state = 'idle';  // Can't maintain block without stamina
      }
    }

    // Knockdown recovery
    if (this.isKnockedDown) {
      this.knockdownTimer -= deltaTime;
      if (this.knockdownTimer <= 0) {
        this.isKnockedDown = false;
        this.state = 'idle';
        // Brief invincibility after getting up
        this.isInvincible = true;
        this.dodgeTimer = KNOCKDOWN_INVINCIBILITY;
        this.actionCooldown = KNOCKDOWN_INVINCIBILITY;
      }
      return; // Skip all other updates while knocked down
    }

    // Dodge timer
    if (this.state === 'dodging') {
      // Drain stamina while dodging
      this.stamina = Math.max(0, this.stamina - DODGE_STAMINA_COST * (deltaTime / 1000));
      if (this.stamina <= 0) {
        this.state = 'idle';  // Can't maintain dodge without stamina
        this.isInvincible = false;
        this.dodgeTimer = 0;
      }
    }

    // Post-knockdown invincibility timer
    if (this.isInvincible && this.dodgeTimer > 0 && this.state !== 'dodging') {
      this.dodgeTimer -= deltaTime;
      if (this.dodgeTimer <= 0) {
        this.isInvincible = false;
        this.dodgeTimer = 0;
      }
    }

    // Stamina regen (not while blocking)
    if (this.state !== 'blocking' && this.stamina < MAX_STAMINA) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN_RATE * (deltaTime / 1000));
    }

    // Flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= deltaTime;
    }

    if (this.health <= 0 && this.isAlive) {
      this.isAlive = false;
      this.state = 'KO';
    }
  }

  attack(type) {
    if (!this.canAct()) return false;
    const def = ATTACKS[type];
    if (!def) return false;

    // Check stamina
    if (this.stamina < def.staminaCost) return false;

    // Cancel block if active
    if (this.state === 'blocking') {
      this.blockTimer = 0;
    }

    this.stamina -= def.staminaCost;
    this.state = 'attacking';
    this.currentAttack = { ...def };
    this.attackTimer = 0;
    this.attackActive = false;
    this._hitLanded = false;
    this.actionCooldown = ATTACK_COOLDOWN;
    this.stats.punchesThrown++;
    return true;
  }

  endAttack() {
    this.state = 'idle';
    this.currentAttack = null;
    this.attackActive = false;
    this.attackTimer = 0;
    this._hitLanded = false;
  }

  block(isHolding) {
    if (!this.isAlive) return false;
    if (this.state === 'dodging') return false;
    if (this.currentAttack) return false;

    if (isHolding) {
      // Start or maintain block
      if (this.stamina < 1) return false;  // Can't block with no stamina
      
      if (this.state !== 'blocking') {
        this.state = 'blocking';
        this.stats.blocksUsed++;
      }
      return true;
    } else {
      // Release block
      if (this.state === 'blocking') {
        this.state = 'idle';
      }
      return false;
    }
  }

  dodge(isHolding) {
    if (!this.isAlive) return false;
    if (this.currentAttack) return false;

    if (isHolding) {
      // Start or maintain dodge
      if (this.stamina < 1) return false;  // Can't dodge with no stamina
      
      if (this.state !== 'dodging') {
        // Cancel block if active
        if (this.state === 'blocking') {
          this.blockTimer = 0;
        }
        this.state = 'dodging';
        this.isInvincible = true;
        this.stats.dodgesUsed++;
      }
      return true;
    } else {
      // Release dodge
      if (this.state === 'dodging') {
        this.state = 'idle';
        this.isInvincible = false;
        this.dodgeTimer = 0;
      }
      return false;
    }
  }

  move(direction) {
    if (!this.canAct()) return false;

    // Cancel block if active
    if (this.state === 'blocking') {
      this.blockTimer = 0;
      this.state = 'idle';
    }

    if (direction === 'forward') {
      this.x += this.facing === 'right' ? MOVE_DISTANCE : -MOVE_DISTANCE;
    } else if (direction === 'back') {
      this.x += this.facing === 'right' ? -MOVE_DISTANCE : MOVE_DISTANCE;
    }

    this.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, this.x));
    this.actionCooldown = MOVE_COOLDOWN;
    return true;
  }

  takeDamage(amount) {
    if (!this.isAlive) return 0;
    if (this.isInvincible) return 0;
    if (this.isKnockedDown) return 0;

    let finalDamage = amount;
    if (this.state === 'blocking') {
      finalDamage *= (1 - BLOCK_DAMAGE_REDUCTION);
    }

    this.health = Math.max(0, this.health - finalDamage);
    this.lastDamageTaken = finalDamage;
    this.stats.damageTaken += finalDamage;
    this.flashTimer = 150;

    // Check for knockdown: big hit while low HP
    if (amount >= KNOCKDOWN_THRESHOLD && this.health > 0 && this.health < KNOCKDOWN_HP_THRESHOLD) {
      this.triggerKnockdown();
      return finalDamage;
    }

    if (this.state !== 'attacking' && this.state !== 'blocking') {
      this.state = 'hurt';
      // Brief hitstun - prevents instant counter-attack
      this.actionCooldown = 150;
      setTimeout(() => {
        if (this.state === 'hurt') this.state = 'idle';
      }, 200);
    }

    return finalDamage;
  }

  triggerKnockdown() {
    this.knockdowns++;
    this.isKnockedDown = true;
    this.knockdownTimer = KNOCKDOWN_DURATION;
    this.state = 'knockdown';
    // Cancel any active attack
    this.currentAttack = null;
    this.attackActive = false;
    this.attackTimer = 0;
    this.blockTimer = 0;
  }

  canAct() {
    if (!this.isAlive) return false;
    if (this.isKnockedDown) return false;
    if (this.state === 'dodging') return false;
    if (this.actionCooldown > 0 && this.state !== 'blocking') return false;
    if (this.currentAttack) return false;
    return true;
  }

  getAttackTipX() {
    if (!this.currentAttack) return this.x;
    if (this.facing === 'right') {
      return this.x + this.currentAttack.range;
    }
    return this.x - this.currentAttack.range;
  }

  getHurtbox() {
    return {
      x: this.x - FIGHTER_WIDTH / 2,
      y: this.y - FIGHTER_HEIGHT - 24,
      width: FIGHTER_WIDTH,
      height: FIGHTER_HEIGHT + 24
    };
  }

  getHitbox() {
    if (!this.attackActive || !this.currentAttack) {
      return null;
    }

    const range = this.currentAttack.range;
    const hitboxHeight = 40;
    const hitboxY = this.y - FIGHTER_HEIGHT + 20;

    if (this.facing === 'right') {
      return {
        x: this.x,
        y: hitboxY - hitboxHeight / 2,
        width: range,
        height: hitboxHeight
      };
    } else {
      return {
        x: this.x - range,
        y: hitboxY - hitboxHeight / 2,
        width: range,
        height: hitboxHeight
      };
    }
  }

  reset() {
    this.x = this.startX;
    this.health = this.maxHealth;
    this.stamina = MAX_STAMINA;
    this.isAlive = true;
    this.state = 'idle';
    this.actionCooldown = 0;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.attackActive = false;
    this.blockTimer = 0;
    this.isInvincible = false;
    this.dodgeTimer = 0;
    this.knockdowns = 0;
    this.knockdownTimer = 0;
    this.isKnockedDown = false;
    this.flashTimer = 0;
    this.lastDamageTaken = 0;
    this.stats = {
      punchesThrown: 0,
      punchesLanded: 0,
      damageDealt: 0,
      damageTaken: 0,
      blocksUsed: 0,
      dodgesUsed: 0
    };
  }
}
