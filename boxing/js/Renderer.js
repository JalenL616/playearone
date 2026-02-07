class Renderer {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    // Screen shake
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
  }

  triggerShake(intensity, duration) {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  clear() {
    const ctx = this.ctx;

    // Apply screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= 16;
      const dx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const dy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.save();
      ctx.translate(dx, dy);
      this._shaking = true;
    } else {
      this._shaking = false;
    }

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);
  }

  drawRing() {
    const ctx = this.ctx;

    // Ring floor
    ctx.fillStyle = COLOR_RING;
    ctx.fillRect(RING_LEFT - 20, RING_Y, RING_RIGHT - RING_LEFT + 40, 8);

    // Ropes (three horizontal lines)
    ctx.strokeStyle = COLOR_ROPE;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ropeY = RING_Y - 20 - i * 30;
      ctx.beginPath();
      ctx.moveTo(RING_LEFT - 20, ropeY);
      ctx.lineTo(RING_LEFT - 20, ropeY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(RING_RIGHT + 20, ropeY);
      ctx.lineTo(RING_RIGHT + 20, ropeY);
      ctx.stroke();
    }

    // Corner posts
    ctx.fillStyle = COLOR_ROPE;
    ctx.fillRect(RING_LEFT - 24, RING_Y - 90, 8, 98);
    ctx.fillRect(RING_RIGHT + 16, RING_Y - 90, 8, 98);
  }

  drawFighter(fighter) {
    const ctx = this.ctx;
    const x = fighter.x;
    const y = fighter.y;
    const color = fighter.color;
    const facingRight = fighter.facing === 'right';

    if (fighter.state === 'KO') {
      this._drawKOPose(ctx, x, y, color, facingRight);
      return;
    }

    // Flash white when hit
    const isFlashing = fighter.flashTimer > 0;
    const drawColor = isFlashing ? COLOR_WHITE : color;

    if (fighter.state === 'dodging') {
      this._drawDodgePose(ctx, x, y, drawColor, facingRight);
    } else if (fighter.state === 'blocking') {
      this._drawBlockPose(ctx, x, y, drawColor, facingRight);
    } else if (fighter.state === 'attacking' && fighter.currentAttack) {
      this._drawAttackPose(ctx, fighter, x, y, drawColor, facingRight);
    } else {
      this._drawIdlePose(ctx, x, y, drawColor, facingRight);
    }

    // Block timer indicator (blue bar above head)
    if (fighter.state === 'blocking') {
      const pct = fighter.blockTimer / BLOCK_DURATION;
      ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
      ctx.fillRect(x - 15, y - FIGHTER_HEIGHT - 32, 30 * pct, 4);
    }
  }

  _drawKOPose(ctx, x, y, color, facingRight) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 30, y - 15, 60, 15);
    ctx.beginPath();
    ctx.arc(facingRight ? x - 35 : x + 35, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawIdlePose(ctx, x, y, color, facingRight) {
    ctx.fillStyle = color;

    // Body
    ctx.fillRect(x - FIGHTER_WIDTH / 2, y - FIGHTER_HEIGHT, FIGHTER_WIDTH, FIGHTER_HEIGHT);

    // Head
    ctx.beginPath();
    ctx.arc(x, y - FIGHTER_HEIGHT - 12, 12, 0, Math.PI * 2);
    ctx.fill();

    // Arms - guard position
    const armY = y - FIGHTER_HEIGHT + 20;
    const frontX = facingRight ? x + 20 : x - 20;
    const backX = facingRight ? x - 15 : x + 15;

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;

    // Front arm
    ctx.beginPath();
    ctx.moveTo(x, armY);
    ctx.lineTo(frontX, armY - 5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(frontX, armY - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    // Back arm
    ctx.beginPath();
    ctx.moveTo(x, armY);
    ctx.lineTo(backX, armY - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(backX, armY - 10, 5, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    this._drawLegs(ctx, x, y, color);
  }

  _drawBlockPose(ctx, x, y, color, facingRight) {
    ctx.fillStyle = color;
    const dir = facingRight ? 1 : -1;

    // Body - slightly narrower, hunched
    ctx.fillRect(x - FIGHTER_WIDTH / 2 + 3, y - FIGHTER_HEIGHT + 5, FIGHTER_WIDTH - 6, FIGHTER_HEIGHT - 5);

    // Head - tucked behind guard
    ctx.beginPath();
    ctx.arc(x, y - FIGHTER_HEIGHT - 8, 11, 0, Math.PI * 2);
    ctx.fill();

    // Arms - raised guard (both arms up protecting face)
    const armY = y - FIGHTER_HEIGHT + 10;

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;

    // Front arm - raised vertically
    ctx.beginPath();
    ctx.moveTo(x + dir * 10, armY);
    ctx.lineTo(x + dir * 15, y - FIGHTER_HEIGHT - 15);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + dir * 15, y - FIGHTER_HEIGHT - 15, 6, 0, Math.PI * 2);
    ctx.fill();

    // Back arm - also raised
    ctx.beginPath();
    ctx.moveTo(x - dir * 5, armY);
    ctx.lineTo(x + dir * 5, y - FIGHTER_HEIGHT - 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + dir * 5, y - FIGHTER_HEIGHT - 20, 6, 0, Math.PI * 2);
    ctx.fill();

    // Shield arc effect
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + dir * 10, y - FIGHTER_HEIGHT, 25, -Math.PI * 0.6, Math.PI * 0.6);
    ctx.stroke();

    // Legs
    this._drawLegs(ctx, x, y, color);
  }

  _drawDodgePose(ctx, x, y, color, facingRight) {
    ctx.fillStyle = color;
    const crouchOffset = 30;

    // Body - crouched down
    ctx.fillRect(
      x - FIGHTER_WIDTH / 2 - 3,
      y - FIGHTER_HEIGHT + crouchOffset,
      FIGHTER_WIDTH + 6,
      FIGHTER_HEIGHT - crouchOffset
    );

    // Head - lower
    ctx.beginPath();
    ctx.arc(x, y - FIGHTER_HEIGHT + crouchOffset - 8, 10, 0, Math.PI * 2);
    ctx.fill();

    // Arms tucked
    const armY = y - FIGHTER_HEIGHT + crouchOffset + 15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, armY);
    ctx.lineTo(facingRight ? x + 10 : x - 10, armY - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, armY);
    ctx.lineTo(facingRight ? x - 8 : x + 8, armY - 3);
    ctx.stroke();

    // Ghost trail effect
    ctx.globalAlpha = 0.15;
    ctx.fillRect(
      x - FIGHTER_WIDTH / 2 - 3 + (facingRight ? 12 : -12),
      y - FIGHTER_HEIGHT + crouchOffset,
      FIGHTER_WIDTH + 6,
      FIGHTER_HEIGHT - crouchOffset
    );
    ctx.globalAlpha = 1.0;

    // Legs - spread wider when ducking
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 20);
    ctx.lineTo(x - 20, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 20);
    ctx.lineTo(x + 20, y + 5);
    ctx.stroke();
  }

  _drawAttackPose(ctx, fighter, x, y, color, facingRight) {
    const attackType = fighter.currentAttack.type;
    const tipX = fighter.getAttackTipX();
    const armY = y - FIGHTER_HEIGHT + 20;
    const dir = facingRight ? 1 : -1;

    ctx.fillStyle = color;

    // Body
    ctx.fillRect(x - FIGHTER_WIDTH / 2, y - FIGHTER_HEIGHT, FIGHTER_WIDTH, FIGHTER_HEIGHT);

    // Head
    ctx.beginPath();
    ctx.arc(x, y - FIGHTER_HEIGHT - 12, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;

    if (attackType === 'hook') {
      // Hook: arm swings wide in an arc
      ctx.lineWidth = 6;
      const midX = x + dir * 40;
      const midY = armY - 20;
      ctx.beginPath();
      ctx.moveTo(x, armY);
      ctx.quadraticCurveTo(midX, midY, tipX, armY);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tipX, armY, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (attackType === 'uppercut') {
      // Uppercut: arm goes low then punches upward
      const lowY = armY + 15;
      const highY = armY - 30;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, armY);
      ctx.quadraticCurveTo(x + dir * 15, lowY, x + dir * 30, highY);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + dir * 30, highY, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Jab / Cross: straight punch
      const thickness = attackType === 'cross' ? 7 : 5;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(x, armY);
      ctx.lineTo(tipX, armY);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tipX, armY, thickness, 0, Math.PI * 2);
      ctx.fill();
    }

    // Other arm in guard
    const guardX = facingRight ? x - 15 : x + 15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, armY);
    ctx.lineTo(guardX, armY - 10);
    ctx.stroke();

    // Legs
    this._drawLegs(ctx, x, y, color);
  }

  _drawLegs(ctx, x, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x - 15, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + 15, y + 5);
    ctx.stroke();
  }

  drawHealthBars(health1, health2) {
    const ctx = this.ctx;
    const barWidth = 300;
    const barHeight = 20;
    const barY = 20;
    const gap = 10;

    // Player 1 health bar (left, fills right to left)
    const p1X = CANVAS_WIDTH / 2 - barWidth - gap;
    ctx.fillStyle = COLOR_HEALTH_BG;
    ctx.fillRect(p1X, barY, barWidth, barHeight);
    const p1Width = (health1 / 100) * barWidth;
    ctx.fillStyle = health1 > 30 ? COLOR_P1 : COLOR_HEALTH_LOW;
    ctx.fillRect(p1X + barWidth - p1Width, barY, p1Width, barHeight);

    // Player 2 health bar (right, fills left to right)
    const p2X = CANVAS_WIDTH / 2 + gap;
    ctx.fillStyle = COLOR_HEALTH_BG;
    ctx.fillRect(p2X, barY, barWidth, barHeight);
    const p2Width = (health2 / 100) * barWidth;
    ctx.fillStyle = health2 > 30 ? COLOR_P2 : COLOR_HEALTH_LOW;
    ctx.fillRect(p2X, barY, p2Width, barHeight);

    // Labels
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('P1', p1X, barY - 5);
    ctx.textAlign = 'right';
    ctx.fillText('P2', p2X + barWidth, barY - 5);

    // Divider
    ctx.fillStyle = COLOR_WHITE;
    ctx.fillRect(CANVAS_WIDTH / 2 - 2, barY - 5, 4, barHeight + 10);
  }

  drawStaminaBars(stamina1, stamina2) {
    const ctx = this.ctx;
    const barWidth = 300;
    const barHeight = 8;
    const barY = 44;
    const gap = 10;

    // Player 1 stamina (left, fills right to left)
    const p1X = CANVAS_WIDTH / 2 - barWidth - gap;
    ctx.fillStyle = '#222';
    ctx.fillRect(p1X, barY, barWidth, barHeight);
    const p1Width = (stamina1 / MAX_STAMINA) * barWidth;
    ctx.fillStyle = stamina1 > 25 ? '#FFD700' : '#FF6600';
    ctx.fillRect(p1X + barWidth - p1Width, barY, p1Width, barHeight);

    // Player 2 stamina (right, fills left to right)
    const p2X = CANVAS_WIDTH / 2 + gap;
    ctx.fillStyle = '#222';
    ctx.fillRect(p2X, barY, barWidth, barHeight);
    const p2Width = (stamina2 / MAX_STAMINA) * barWidth;
    ctx.fillStyle = stamina2 > 25 ? '#FFD700' : '#FF6600';
    ctx.fillRect(p2X, barY, p2Width, barHeight);
  }

  drawDamageNumbers(fighter1, fighter2) {
    const ctx = this.ctx;

    for (const fighter of [fighter1, fighter2]) {
      if (fighter.flashTimer > 0 && fighter.lastDamageTaken > 0) {
        const alpha = fighter.flashTimer / 150;
        const offsetY = (1 - alpha) * 20;
        ctx.fillStyle = `rgba(255, 80, 80, ${alpha})`;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `-${Math.round(fighter.lastDamageTaken)}`,
          fighter.x,
          fighter.y - FIGHTER_HEIGHT - 35 - offsetY
        );
      }
    }
  }

  drawRoundInfo(currentRound, maxRounds, roundTimer, scores) {
    const ctx = this.ctx;
    const centerX = CANVAS_WIDTH / 2;

    // Round number (above the divider)
    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Round ' + currentRound + '/' + maxRounds, centerX, 14);

    // Round timer (below stamina bars)
    const seconds = Math.max(0, Math.ceil(roundTimer));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = mins + ':' + String(secs).padStart(2, '0');

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = seconds <= 10 ? '#FF4444' : COLOR_WHITE;
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, centerX, 72);

    // Score pips (dots showing round results)
    const pipY = 80;
    const pipRadius = 4;
    const pipGap = 14;
    const totalWidth = (maxRounds - 1) * pipGap;
    const startX = centerX - totalWidth / 2;

    // Draw all round dots and fill them based on who won
    for (let i = 0; i < maxRounds; i++) {
      const px = startX + i * pipGap;
      ctx.beginPath();
      ctx.arc(px, pipY, pipRadius, 0, Math.PI * 2);
      
      // Determine color based on rounds completed
      if (i < scores.p1 + scores.p2) {
        // This round is complete - color by who won
        // P1 wins are the first scores.p1 dots, P2 wins are the next scores.p2 dots
        if (i < scores.p1) {
          ctx.fillStyle = COLOR_P1;
        } else {
          ctx.fillStyle = COLOR_P2;
        }
      } else {
        // Not yet played
        ctx.fillStyle = '#444';
      }
      ctx.fill();
    }
  }

  drawOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  drawCenterText(text, size) {
    const ctx = this.ctx;
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
    ctx.textBaseline = 'alphabetic';
  }

  drawSubText(text) {
    const ctx = this.ctx;
    ctx.fillStyle = '#999';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
  }

  drawSubText2(text) {
    const ctx = this.ctx;
    ctx.fillStyle = '#777';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
  }

  endFrame() {
    if (this._shaking) {
      this.ctx.restore();
    }
  }
}
