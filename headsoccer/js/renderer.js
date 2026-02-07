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

  drawField() {
    const ctx = this.ctx;

    // Center line (vertical)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 50);
    ctx.lineTo(CANVAS_WIDTH / 2, FIELD_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left goal post and crossbar (higher up)
    const goalTop = FIELD_Y - GOAL_Y_OFFSET - GOAL_HEIGHT;
    const goalBottom = FIELD_Y - GOAL_Y_OFFSET;
    
    ctx.strokeStyle = COLOR_WHITE;
    ctx.lineWidth = 4;
    ctx.strokeRect(FIELD_LEFT - 5, goalTop, 5, GOAL_HEIGHT);
    
    // Left goal net (simple lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = goalTop + (i * GOAL_HEIGHT / 5);
      ctx.beginPath();
      ctx.moveTo(FIELD_LEFT - 30, y);
      ctx.lineTo(FIELD_LEFT, y);
      ctx.stroke();
    }

    // Right goal post and crossbar (higher up)
    ctx.strokeStyle = COLOR_WHITE;
    ctx.lineWidth = 4;
    ctx.strokeRect(FIELD_RIGHT, goalTop, 5, GOAL_HEIGHT);
    
    // Right goal net
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = goalTop + (i * GOAL_HEIGHT / 5);
      ctx.beginPath();
      ctx.moveTo(FIELD_RIGHT, y);
      ctx.lineTo(FIELD_RIGHT + 30, y);
      ctx.stroke();
    }

    // Ground line
    ctx.strokeStyle = COLOR_LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(FIELD_LEFT, FIELD_Y);
    ctx.lineTo(FIELD_RIGHT, FIELD_Y);
    ctx.stroke();
  }

  drawPlayer(player) {
    const ctx = this.ctx;
    const x = player.x;
    const y = player.y;
    const color = player.color;

    // Tiny body
    ctx.fillStyle = color;
    ctx.fillRect(
      x - PLAYER_WIDTH / 2,
      y - PLAYER_HEIGHT,
      PLAYER_WIDTH,
      PLAYER_HEIGHT
    );

    // HUGE head
    ctx.beginPath();
    ctx.arc(x, y - PLAYER_HEIGHT - PLAYER_HEAD_RADIUS, PLAYER_HEAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Tiny legs (simple lines)
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x - 12, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + 12, y + 5);
    ctx.stroke();

    // Kicking animation indicator
    if (player.kickCooldown > 200) {
      const kickDir = player.facing === 'right' ? 1 : -1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y - PLAYER_HEIGHT / 2);
      ctx.lineTo(x + kickDir * 30, y - PLAYER_HEIGHT / 2);
      ctx.stroke();
    }
  }

  drawBall(ball) {
    const ctx = this.ctx;

    // Ball shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    const shadowDistance = Math.min(ball.y - FIELD_Y + BALL_RADIUS, 150);
    const shadowOpacity = Math.max(0, 0.3 - shadowDistance / 500);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
    ctx.ellipse(ball.x, FIELD_Y + 5, BALL_RADIUS * 0.8, BALL_RADIUS * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball glow
    const gradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, BALL_RADIUS * 1.5);
    gradient.addColorStop(0, 'rgba(255, 255, 100, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 100, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    ctx.fillStyle = COLOR_BALL;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Ball outline
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Simple hexagon pattern
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const x1 = ball.x + Math.cos(angle) * BALL_RADIUS * 0.6;
      const y1 = ball.y + Math.sin(angle) * BALL_RADIUS * 0.6;
      const x2 = ball.x + Math.cos(angle + Math.PI / 3) * BALL_RADIUS * 0.6;
      const y2 = ball.y + Math.sin(angle + Math.PI / 3) * BALL_RADIUS * 0.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  drawScore(score1, score2) {
    const ctx = this.ctx;

    // Score background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(CANVAS_WIDTH / 2 - 80, 10, 160, 50);

    // Scores
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = COLOR_P1;
    ctx.fillText(score1, CANVAS_WIDTH / 2 - 30, 35);

    ctx.fillStyle = COLOR_WHITE;
    ctx.fillText('-', CANVAS_WIDTH / 2, 35);

    ctx.fillStyle = COLOR_P2;
    ctx.fillText(score2, CANVAS_WIDTH / 2 + 30, 35);

    ctx.textBaseline = 'alphabetic';
  }

  drawTimer(timeRemaining) {
    const ctx = this.ctx;
    const seconds = Math.max(0, Math.ceil(timeRemaining));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = mins + ':' + String(secs).padStart(2, '0');

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = seconds <= 10 ? '#FF4444' : COLOR_WHITE;
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, CANVAS_WIDTH / 2, 75);
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

  drawSubText3(text) {
    const ctx = this.ctx;
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
  }

  drawPowerup(powerup) {
    const ctx = this.ctx;
    const box = powerup.getBoundingBox();
    const centerY = box.y + box.height / 2;

    if (powerup.type === 'flame') {
      // Flame powerup - fire icon
      const gradient = ctx.createRadialGradient(
        powerup.x, centerY, 0,
        powerup.x, centerY, POWERUP_SIZE
      );
      gradient.addColorStop(0, '#FF6600');
      gradient.addColorStop(0.5, '#FF3300');
      gradient.addColorStop(1, '#990000');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      // Flame shape
      ctx.moveTo(powerup.x, centerY - POWERUP_SIZE / 2);
      ctx.bezierCurveTo(
        powerup.x - POWERUP_SIZE / 3, centerY - POWERUP_SIZE / 3,
        powerup.x - POWERUP_SIZE / 2, centerY,
        powerup.x, centerY + POWERUP_SIZE / 2
      );
      ctx.bezierCurveTo(
        powerup.x + POWERUP_SIZE / 2, centerY,
        powerup.x + POWERUP_SIZE / 3, centerY - POWERUP_SIZE / 3,
        powerup.x, centerY - POWERUP_SIZE / 2
      );
      ctx.fill();

      // Glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#FF6600';
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (powerup.type === 'cage') {
      // Cage powerup - shield/cage icon
      ctx.fillStyle = COLOR_CAGE;
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = 3;
      
      // Shield shape
      ctx.beginPath();
      ctx.moveTo(powerup.x, centerY - POWERUP_SIZE / 2);
      ctx.lineTo(powerup.x - POWERUP_SIZE / 2, centerY - POWERUP_SIZE / 4);
      ctx.lineTo(powerup.x - POWERUP_SIZE / 2, centerY + POWERUP_SIZE / 4);
      ctx.lineTo(powerup.x, centerY + POWERUP_SIZE / 2);
      ctx.lineTo(powerup.x + POWERUP_SIZE / 2, centerY + POWERUP_SIZE / 4);
      ctx.lineTo(powerup.x + POWERUP_SIZE / 2, centerY - POWERUP_SIZE / 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = COLOR_CAGE;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Lifetime indicator (fades when running out)
    if (powerup.lifetime < 2000) {
      ctx.globalAlpha = powerup.lifetime / 2000;
      ctx.fillStyle = '#FFF';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', powerup.x, centerY - POWERUP_SIZE);
      ctx.globalAlpha = 1.0;
    }
  }

  drawFlameShot(flameShot) {
    const ctx = this.ctx;
    
    // Flame trail
    for (let i = 0; i < 3; i++) {
      const trailX = flameShot.x - flameShot.direction * i * 15;
      const alpha = 0.4 - i * 0.1;
      const size = FLAME_SHOT_SIZE - i * 5;
      
      const gradient = ctx.createRadialGradient(
        trailX, flameShot.y, 0,
        trailX, flameShot.y, size
      );
      gradient.addColorStop(0, `rgba(255, 200, 0, ${alpha})`);
      gradient.addColorStop(1, `rgba(255, 100, 0, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(trailX, flameShot.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main fireball
    const gradient = ctx.createRadialGradient(
      flameShot.x, flameShot.y, 0,
      flameShot.x, flameShot.y, FLAME_SHOT_SIZE
    );
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(0.4, '#FF6600');
    gradient.addColorStop(1, '#FF0000');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(flameShot.x, flameShot.y, FLAME_SHOT_SIZE, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FF6600';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  drawGoalCage(cage) {
    const ctx = this.ctx;
    const goalTop = FIELD_Y - GOAL_Y_OFFSET - GOAL_HEIGHT;
    const goalBottom = FIELD_Y - GOAL_Y_OFFSET;
    const x = cage.getX();

    // Cage bars (vertical)
    ctx.strokeStyle = COLOR_CAGE;
    ctx.lineWidth = 4;
    
    const numBars = 5;
    for (let i = 0; i < numBars; i++) {
      const y = goalTop + (i * GOAL_HEIGHT / (numBars - 1));
      ctx.beginPath();
      if (cage.side === 'left') {
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x - 25, y);
      } else {
        ctx.moveTo(x + 5, y);
        ctx.lineTo(x + 25, y);
      }
      ctx.stroke();
    }

    // Cage frame glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = COLOR_CAGE;
    ctx.strokeStyle = COLOR_CAGE;
    ctx.lineWidth = 6;
    ctx.strokeRect(
      cage.side === 'left' ? x - 25 : x + 5,
      goalTop,
      20,
      GOAL_HEIGHT
    );
    ctx.shadowBlur = 0;

    // Duration indicator
    const pct = cage.duration / CAGE_DURATION;
    ctx.fillStyle = `rgba(255, 215, 0, ${pct})`;
    ctx.fillRect(
      cage.side === 'left' ? x - 30 : x + 5,
      goalTop - 10,
      25 * pct,
      5
    );
  }

drawPowerupReloadIndicator(player, side) {
    const ctx = this.ctx;
    const x = side === 'left' ? 100 : CANVAS_WIDTH - 100;
    const y = 100;

    // Draw powerup type icon
    const icon = player.powerupType === 'flame' ? '🔥' : '🛡️';
    const iconColor = player.powerupType === 'flame' ? COLOR_FLAME : COLOR_CAGE;
    
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = player.powerupReady ? iconColor : '#555';
    ctx.fillText(icon, x, y);
    
    // Draw reload bar
    const barWidth = 60;
    const barHeight = 8;
    const barY = y + 10;
    
    ctx.fillStyle = '#222';
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
    
    if (player.powerupReady) {
      // Ready - full bar
      ctx.fillStyle = iconColor;
      ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
      
      // "READY" text
      ctx.font = '10px monospace';
      ctx.fillStyle = '#FFF';
      ctx.fillText('READY', x, barY + 20);
    } else {
      // Reloading - show progress
      const progress = 1 - (player.powerupReloadTimer / POWERUP_RELOAD_TIME);
      ctx.fillStyle = iconColor;
      ctx.fillRect(x - barWidth / 2, barY, barWidth * progress, barHeight);
      
      // Show seconds remaining
      const secsLeft = Math.ceil(player.powerupReloadTimer / 1000);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#999';
      ctx.fillText(secsLeft + 's', x, barY + 20);
    }
  }

  endFrame() {
    if (this._shaking) {
      this.ctx.restore();
    }
  }
}