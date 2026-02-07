class SoccerGame {
  constructor() {
    this.renderer = new Renderer();

    this.player1 = new Player(150, 'left', COLOR_P1);
    this.player2 = new Player(650, 'right', COLOR_P2);
    this.ball = new Ball();

    // States: waiting, countdown, playing, paused, goalCelebration, matchEnd
    this.state = 'waiting';

    // Score
    this.score = { p1: 0, p2: 0 };

    // Timer
    this.matchTimer = MATCH_DURATION;

    // Countdown / celebration timer
    this.transitionTimer = 0;
    this.transitionText = '';

    // Match result
    this.matchWinner = null;
    this.lastGoalScorer = null;

    this.lastTime = 0;

    // Track which keyboard commands were already processed (debounce)
    this.keyHandled = {};

    // Powerup state
    this.flameShots = [];
    this.goalCages = [];

    initInput();
  }

  // --- State transitions ---

  startMatch() {
    this.score = { p1: 0, p2: 0 };
    this.matchWinner = null;
    this.player1.reset();
    this.player2.reset();
    this.ball.reset();
    this.flameShots = [];
    this.goalCages = [];
    this.beginCountdown();
  }

  beginCountdown() {
    this.state = 'countdown';
    this.transitionTimer = COUNTDOWN_SECONDS + 1;
    this.matchTimer = MATCH_DURATION;
  }

  startPlaying() {
    this.state = 'playing';
    this.transitionText = '';
  }

  celebrateGoal(scorer) {
    if (this.state !== 'playing') return;
    this.state = 'goalCelebration';
    this.lastGoalScorer = scorer;
    
    if (scorer === 'p1') {
      this.score.p1++;
      this.transitionText = 'GOAL!';
    } else {
      this.score.p2++;
      this.transitionText = 'GOAL!';
    }

    this.transitionTimer = GOAL_CELEBRATION_SECONDS;
    this.renderer.triggerShake(8, 300);
  }

  resumeAfterGoal() {
    // Check if match is won
    if (this.score.p1 >= MAX_GOALS || this.score.p2 >= MAX_GOALS) {
      this.endMatch();
    } else {
      // Reset positions and continue
      this.player1.reset();
      this.player2.reset();
      this.ball.reset();
      this.state = 'playing';
    }
  }

  endMatch() {
    this.state = 'matchEnd';
    if (this.score.p1 > this.score.p2) {
      this.matchWinner = 'Player 1';
    } else if (this.score.p2 > this.score.p1) {
      this.matchWinner = 'Player 2';
    } else {
      this.matchWinner = 'Draw';
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  // --- Command handling ---

  handleCommand(player, command, volume = null) {
    if (this.state !== 'playing') return;

    const playerObj = player === 1 ? this.player1 : this.player2;
    const speedMultiplier = volume !== null
      ? 1.0 + volume * (VOICE_SPEED_MAX_MULTIPLIER - 1.0)
      : 1.0;

    switch (command) {
      case 'left':
        playerObj.moveLeft(speedMultiplier);
        break;
      case 'right':
        playerObj.moveRight(speedMultiplier);
        break;
      case 'jump':
        playerObj.jump();
        break;
      case 'kick':
        if (playerObj.kick()) {
          this.checkKick(playerObj, player === 1 ? 'p1' : 'p2');
        }
        break;
      case 'power':
        this.usePowerup(playerObj, player === 1 ? 'p1' : 'p2');
        break;
    }
  }

  usePowerup(player, playerId) {
    if (!player.powerupReady) return;

    player.powerupReady = false;
    player.powerupReloadTimer = POWERUP_RELOAD_TIME;

    if (player.powerupType === 'flame') {
      const direction = player.facing === 'right' ? 1 : -1;
      const shotX = player.x + direction * (PLAYER_HEAD_RADIUS + 10);
      const shotY = player.y - PLAYER_HEIGHT - PLAYER_HEAD_RADIUS;
      this.flameShots.push(new FlameShot(shotX, shotY, direction, playerId));
    } else if (player.powerupType === 'cage') {
      // Place cage on the opponent's goal
      const cageSide = playerId === 'p1' ? 'right' : 'left';
      this.goalCages.push(new GoalCage(cageSide));
    }
  }

  handleKeyboard() {
    // Start / restart / pause
    if (keys[' '] || keys['Enter']) {
      if (!this.keyHandled['start']) {
        this.keyHandled['start'] = true;
        if (this.state === 'waiting' || this.state === 'matchEnd') {
          this.startMatch();
        } else if (this.state === 'playing') {
          this.togglePause();
        } else if (this.state === 'paused') {
          this.togglePause();
        }
      }
    } else {
      this.keyHandled['start'] = false;
    }

    // Escape: restart match from pause
    if (keys['Escape']) {
      if (!this.keyHandled['escape']) {
        this.keyHandled['escape'] = true;
        if (this.state === 'paused') {
          this.state = 'waiting';
        }
      }
    } else {
      this.keyHandled['escape'] = false;
    }

    if (this.state !== 'playing') return;

    // Player 1 keys - use P1_KEYS mapping
    for (const [key, action] of Object.entries(P1_KEYS)) {
      if (action === 'left' || action === 'right') {
        // Continuous movement
        if (keys[key]) {
          this.handleCommand(1, action);
        }
      } else {
        // Single press actions (jump, kick)
        if (keys[key] && !this.keyHandled['p1_' + key]) {
          this.keyHandled['p1_' + key] = true;
          this.handleCommand(1, action);
        } else if (!keys[key]) {
          this.keyHandled['p1_' + key] = false;
        }
      }
    }

    // Player 2 keys - use P2_KEYS mapping
    for (const [key, action] of Object.entries(P2_KEYS)) {
      if (action === 'left' || action === 'right') {
        // Continuous movement
        if (keys[key]) {
          this.handleCommand(2, action);
        }
      } else {
        // Single press actions (jump, kick)
        if (keys[key] && !this.keyHandled['p2_' + key]) {
          this.keyHandled['p2_' + key] = true;
          this.handleCommand(2, action);
        } else if (!keys[key]) {
          this.keyHandled['p2_' + key] = false;
        }
      }
    }
  }

  // --- Collision & game logic ---

  checkKick(player, playerId) {
    const kickPoint = player.getKickPoint();
    const ballBox = this.ball.getBoundingBox();

    // Check if kick point is near ball
    const distance = Math.sqrt(
      Math.pow(kickPoint.x - this.ball.x, 2) +
      Math.pow(kickPoint.y - this.ball.y, 2)
    );

    if (distance < BALL_RADIUS + 30) {
      // Apply kick force
      const direction = player.facing === 'right' ? 1 : -1;
      this.ball.applyForce(direction * KICK_FORCE, -KICK_FORCE * 0.5);
      this.ball.lastTouchedBy = playerId;
    }
  }

  checkBallPlayerCollision() {
    // Check head collisions using circle-to-circle collision
    for (const [playerId, player] of [['p1', this.player1], ['p2', this.player2]]) {
      const headX = player.x;
      const headY = player.y - PLAYER_HEIGHT - PLAYER_HEAD_RADIUS;
      
      // Distance between ball center and head center
      const dx = this.ball.x - headX;
      const dy = this.ball.y - headY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const minDistance = BALL_RADIUS + PLAYER_HEAD_RADIUS;
      
      if (distance < minDistance) {
        // Collision detected!
        
        // Calculate collision normal
        const nx = dx / distance;
        const ny = dy / distance;
        
        // Push ball away from head to prevent overlap
        const overlap = minDistance - distance;
        this.ball.x += nx * overlap;
        this.ball.y += ny * overlap;
        
        // Apply header force based on player velocity and direction
        const playerVelX = player.velocityX || 0;
        const direction = player.facing === 'right' ? 1 : -1;
        
        // If player is moving, add that momentum to the ball
        const forceX = direction * HEADER_FORCE + playerVelX * 0.5;
        const forceY = -HEADER_FORCE * 0.8; // Upward force
        
        this.ball.applyForce(forceX, forceY);
        this.ball.lastTouchedBy = playerId;
      }
    }
  }

  checkGoal() {
    const ballY = this.ball.y;
    const ballX = this.ball.x;

    const goalTop = FIELD_Y - GOAL_Y_OFFSET - GOAL_HEIGHT;
    const goalBottom = FIELD_Y - GOAL_Y_OFFSET;

    // Check if a cage blocks the goal
    const leftCageActive = this.goalCages.some(c => c.active && c.side === 'left');
    const rightCageActive = this.goalCages.some(c => c.active && c.side === 'right');

    // Left goal (Player 2 scores)
    if (ballX < FIELD_LEFT &&
        ballY > goalTop &&
        ballY < goalBottom) {
      if (leftCageActive) {
        // Cage blocks the goal — bounce ball back
        this.ball.x = FIELD_LEFT + BALL_RADIUS;
        this.ball.velocityX = Math.abs(this.ball.velocityX) * BALL_BOUNCE_DAMPING;
      } else {
        this.celebrateGoal('p2');
      }
    }

    // Right goal (Player 1 scores)
    if (ballX > FIELD_RIGHT &&
        ballY > goalTop &&
        ballY < goalBottom) {
      if (rightCageActive) {
        // Cage blocks the goal — bounce ball back
        this.ball.x = FIELD_RIGHT - BALL_RADIUS;
        this.ball.velocityX = -Math.abs(this.ball.velocityX) * BALL_BOUNCE_DAMPING;
      } else {
        this.celebrateGoal('p1');
      }
    }
  }

  boxesIntersect(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }

  // --- Update ---

  update(deltaTime) {
    this.handleKeyboard();

    if (this.state === 'countdown') {
      this.transitionTimer -= deltaTime / 1000;
      const count = Math.ceil(this.transitionTimer);
      if (count > COUNTDOWN_SECONDS) {
        // Not started yet
      } else if (count > 0) {
        this.transitionText = String(count);
      } else {
        this.transitionText = 'PLAY!';
      }
      if (this.transitionTimer <= -0.5) {
        this.startPlaying();
      }
      return;
    }

    if (this.state === 'goalCelebration') {
      this.transitionTimer -= deltaTime / 1000;
      if (this.transitionTimer <= 0) {
        this.resumeAfterGoal();
      }
      return;
    }

    if (this.state !== 'playing') return;

    // Update game objects
    this.player1.update(deltaTime);
    this.player2.update(deltaTime);
    this.ball.update(deltaTime);

    // Update flame shots
    for (const shot of this.flameShots) {
      shot.update(deltaTime);

      if (!shot.active) continue;

      // Check if flame scores a goal
      const goalHit = shot.checkGoal();
      if (goalHit) {
        // Check if a cage blocks it
        const cageBlocks = this.goalCages.some(c => c.active && c.side === goalHit);
        if (cageBlocks) {
          shot.active = false;
        } else {
          const scorer = goalHit === 'left' ? 'p2' : 'p1';
          this.celebrateGoal(scorer);
          shot.active = false;
        }
        continue;
      }

      // Check if opponent blocks the flame with their head
      const opponent = shot.owner === 'p1' ? this.player2 : this.player1;
      if (shot.checkPlayerBlock(opponent)) {
        shot.active = false;
      }
    }
    this.flameShots = this.flameShots.filter(s => s.active);

    // Update goal cages
    for (const cage of this.goalCages) {
      cage.update(deltaTime);
    }
    this.goalCages = this.goalCages.filter(c => c.active);

    // Check collisions
    this.checkBallPlayerCollision();
    this.checkGoal();

    // Update timer
    this.matchTimer -= deltaTime / 1000;
    if (this.matchTimer <= 0) {
      this.matchTimer = 0;
      this.endMatch();
    }
  }

  // --- Render ---

  render() {
    this.renderer.clear();
    this.renderer.drawField();
    this.renderer.drawPlayer(this.player1);
    this.renderer.drawPlayer(this.player2);
    this.renderer.drawBall(this.ball);
    // Draw powerup elements
    for (const shot of this.flameShots) {
      this.renderer.drawFlameShot(shot);
    }
    for (const cage of this.goalCages) {
      this.renderer.drawGoalCage(cage);
    }
    this.renderer.drawPowerupReloadIndicator(this.player1, 'left');
    this.renderer.drawPowerupReloadIndicator(this.player2, 'right');

    this.renderer.drawScore(this.score.p1, this.score.p2);
    this.renderer.drawTimer(this.matchTimer);

    if (this.state === 'waiting') {
      this.renderer.drawCenterText('HEAD SOCCER', 48);
      this.renderer.drawSubText('Press SPACE or ENTER to play');
      this.renderer.drawSubText2('First to ' + MAX_GOALS + ' goals wins');
    } else if (this.state === 'countdown') {
      this.renderer.drawCenterText(this.transitionText, this.transitionText === 'PLAY!' ? 56 : 72);
    } else if (this.state === 'paused') {
      this.renderer.drawOverlay();
      this.renderer.drawCenterText('PAUSED', 48);
      this.renderer.drawSubText('Press SPACE to resume');
    } else if (this.state === 'goalCelebration') {
      this.renderer.drawCenterText(this.transitionText, 56);
      const scorer = this.lastGoalScorer === 'p1' ? 'Player 1' : 'Player 2';
      this.renderer.drawSubText(scorer + ' scores!');
      this.renderer.drawSubText2('P1: ' + this.score.p1 + '  -  P2: ' + this.score.p2);
    } else if (this.state === 'matchEnd') {
      this.renderer.drawOverlay();
      if (this.matchWinner === 'Draw') {
        this.renderer.drawCenterText('DRAW!', 56);
      } else {
        this.renderer.drawCenterText(this.matchWinner + ' WINS!', 48);
      }
      this.renderer.drawSubText('Final Score: ' + this.score.p1 + ' - ' + this.score.p2);
      this.renderer.drawSubText3('Press SPACE for rematch');
    }
  }

  gameLoop(currentTime) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.render();
    this.renderer.endFrame();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  start() {
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }
}

// Initialize
const soccerGame = new SoccerGame();
window.soccerGame = soccerGame;
soccerGame.start();

const soccerVoice = new SoccerVoiceInput(soccerGame);
soccerGame.voiceInput = soccerVoice;
soccerVoice.initialize().catch(() => {
  const el = document.getElementById('voiceStatus');
  if (el) {
    el.textContent = 'Voice: Unavailable';
    el.style.color = '#666';
  }
});