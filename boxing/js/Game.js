class BoxingGame {
  constructor() {
    this.renderer = new Renderer();

    this.fighter1 = new Fighter(250, 'right', COLOR_P1);
    this.fighter2 = new Fighter(550, 'left', COLOR_P2);

    // States: waiting, countdown, fighting, paused, roundEnd, matchEnd
    this.state = 'waiting';

    // Round system
    this.currentRound = 1;
    this.roundTimer = ROUND_DURATION;
    this.scores = { p1: 0, p2: 0 };
    this.roundResults = [];         // 'p1', 'p2', or 'draw' per round

    // Countdown / intermission timer (seconds, counts down)
    this.transitionTimer = 0;
    this.transitionText = '';

    // Match result
    this.matchWinner = null;

    // Accumulated match stats (summed across rounds)
    this.matchStats = { p1: null, p2: null };

    this.lastTime = 0;

    // Track which keyboard commands were already processed (debounce)
    this.keyHandled = {};

    initInput();
  }

  // --- State transitions ---

  startMatch() {
    this.currentRound = 1;
    this.scores = { p1: 0, p2: 0 };
    this.roundResults = [];
    this.matchWinner = null;
    this.fighter1.reset();
    this.fighter2.reset();
    this.beginCountdown();
  }

  beginCountdown() {
    this.state = 'countdown';
    this.transitionTimer = COUNTDOWN_SECONDS + 1; // +1 for "FIGHT!" frame
    this.roundTimer = ROUND_DURATION;
  }

  startRound() {
    this.state = 'fighting';
    this.transitionText = '';
  }

  endRound(reason, winner) {
    if (this.state !== 'fighting') return;
    this.state = 'roundEnd';

    let roundWinner;
    if (reason === 'KO') {
      roundWinner = winner;
      this.transitionText = 'KO!';
    } else if (reason === 'TKO') {
      roundWinner = winner;
      this.transitionText = 'TKO!';
    } else if (reason === 'time') {
      if (this.fighter1.health > this.fighter2.health) {
        roundWinner = 'p1';
      } else if (this.fighter2.health > this.fighter1.health) {
        roundWinner = 'p2';
      } else {
        roundWinner = 'draw';
      }
      this.transitionText = 'TIME!';
    }

    this.roundResults.push(roundWinner);
    if (roundWinner === 'p1') this.scores.p1++;
    else if (roundWinner === 'p2') this.scores.p2++;

    // Accumulate stats
    this._accumulateStats();

    this.transitionTimer = INTERMISSION_SECONDS;
  }

  _accumulateStats() {
    const add = (target, source) => {
      if (!target) return { ...source };
      return {
        punchesThrown: target.punchesThrown + source.punchesThrown,
        punchesLanded: target.punchesLanded + source.punchesLanded,
        damageDealt: target.damageDealt + source.damageDealt,
        damageTaken: target.damageTaken + source.damageTaken,
        blocksUsed: target.blocksUsed + source.blocksUsed,
        dodgesUsed: target.dodgesUsed + source.dodgesUsed
      };
    };
    this.matchStats.p1 = add(this.matchStats.p1, this.fighter1.stats);
    this.matchStats.p2 = add(this.matchStats.p2, this.fighter2.stats);
  }

  advanceAfterRound() {
    // Check if match is decided
    const roundsNeeded = Math.ceil(MAX_ROUNDS / 2);
    const roundsPlayed = this.roundResults.length;
    const roundsRemaining = MAX_ROUNDS - roundsPlayed;

    if (this.scores.p1 >= roundsNeeded ||
        this.scores.p2 >= roundsNeeded ||
        roundsPlayed >= MAX_ROUNDS) {
      this.endMatch();
    } else {
      // Next round
      this.currentRound++;
      this.fighter1.reset();
      this.fighter2.reset();
      this.beginCountdown();
    }
  }

  endMatch() {
    this.state = 'matchEnd';
    if (this.scores.p1 > this.scores.p2) {
      this.matchWinner = 'Player 1';
    } else if (this.scores.p2 > this.scores.p1) {
      this.matchWinner = 'Player 2';
    } else {
      this.matchWinner = 'Draw';
    }
  }

  togglePause() {
    if (this.state === 'fighting') {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'fighting';
    }
  }

  // --- Command handling ---

  handleCommand(player, command, isHolding = false) {
    if (this.state !== 'fighting') return;

    const fighter = player === 1 ? this.fighter1 : this.fighter2;

    switch (command) {
      case 'jab':
      case 'cross':
      case 'hook':
      case 'uppercut':
        fighter.attack(command);
        break;
      case 'block':
        fighter.block(isHolding);
        break;
      case 'dodge':
        fighter.dodge(isHolding);
        break;
      case 'forward':
      case 'back':
        fighter.move(command);
        break;
    }
  }

  handleKeyboard() {
    // Start / restart / pause
    if (keys[' '] || keys['Enter']) {
      if (!this.keyHandled['start']) {
        this.keyHandled['start'] = true;
        if (this.state === 'waiting' || this.state === 'matchEnd') {
          this.startMatch();
        } else if (this.state === 'fighting') {
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

    if (this.state !== 'fighting') return;

    // Player 1 keys
    for (const [key, action] of Object.entries(P1_KEYS)) {
      if (action === 'block' || action === 'dodge') {
        // Block and dodge are hold-based, but skip keyboard if voice is controlling
        if (!this.voiceInput || !this.voiceInput.isVoiceHoldActive(1, action)) {
          this.handleCommand(1, action, keys[key]);
        }
      } else if (keys[key] && !this.keyHandled['p1_' + key]) {
        this.keyHandled['p1_' + key] = true;
        this.handleCommand(1, action);
      } else if (!keys[key]) {
        this.keyHandled['p1_' + key] = false;
      }
    }

    // Player 2 keys
    for (const [key, action] of Object.entries(P2_KEYS)) {
      if (action === 'block' || action === 'dodge') {
        // Block and dodge are hold-based, but skip keyboard if voice is controlling
        if (!this.voiceInput || !this.voiceInput.isVoiceHoldActive(2, action)) {
          this.handleCommand(2, action, keys[key]);
        }
      } else if (keys[key] && !this.keyHandled['p2_' + key]) {
        this.keyHandled['p2_' + key] = true;
        this.handleCommand(2, action);
      } else if (!keys[key]) {
        this.keyHandled['p2_' + key] = false;
      }
    }
  }

  // --- Collision & rules ---

  checkCollisions() {
    this.checkHit(this.fighter1, this.fighter2);
    this.checkHit(this.fighter2, this.fighter1);
  }

  checkHit(attacker, defender) {
    if (!attacker.attackActive || !attacker.currentAttack) return;

    const hitbox = attacker.getHitbox();
    const hurtbox = defender.getHurtbox();

    if (!hitbox || !defender.isAlive) return;

    const collision = (
      hitbox.x < hurtbox.x + hurtbox.width &&
      hitbox.x + hitbox.width > hurtbox.x &&
      hitbox.y < hurtbox.y + hurtbox.height &&
      hitbox.y + hitbox.height > hurtbox.y
    );

    if (collision) {
      if (!attacker._hitLanded) {
        attacker._hitLanded = true;
        const dmg = defender.takeDamage(attacker.currentAttack.damage);
        if (dmg > 0) {
          attacker.stats.punchesLanded++;
          attacker.stats.damageDealt += dmg;
          const intensity = Math.min(dmg / 5, 6);
          this.renderer.triggerShake(intensity, 100);
        }
      }
    }
  }

  enforceDistance() {
    const distance = Math.abs(this.fighter1.x - this.fighter2.x);
    if (distance < MIN_DISTANCE) {
      const push = (MIN_DISTANCE - distance) / 2;
      if (this.fighter1.x < this.fighter2.x) {
        this.fighter1.x -= push;
        this.fighter2.x += push;
      } else {
        this.fighter1.x += push;
        this.fighter2.x -= push;
      }
      this.fighter1.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, this.fighter1.x));
      this.fighter2.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, this.fighter2.x));
    }
  }

  checkWin() {
    if (!this.fighter1.isAlive) {
      this.endRound('KO', 'p2');
    } else if (!this.fighter2.isAlive) {
      this.endRound('KO', 'p1');
    } else if (this.fighter1.knockdowns >= TKO_KNOCKDOWNS) {
      this.endRound('TKO', 'p2');
    } else if (this.fighter2.knockdowns >= TKO_KNOCKDOWNS) {
      this.endRound('TKO', 'p1');
    }
  }

  // --- Update ---

  update(deltaTime) {
    this.handleKeyboard();

    if (this.state === 'countdown') {
      this.transitionTimer -= deltaTime / 1000;
      const count = Math.ceil(this.transitionTimer);
      if (count > COUNTDOWN_SECONDS) {
        // Not started yet (first frame)
      } else if (count > 0) {
        this.transitionText = String(count);
      } else {
        this.transitionText = 'FIGHT!';
      }
      if (this.transitionTimer <= -0.5) {
        this.startRound();
      }
      return;
    }

    if (this.state === 'roundEnd') {
      this.transitionTimer -= deltaTime / 1000;
      if (this.transitionTimer <= 0) {
        this.advanceAfterRound();
      }
      return;
    }

    if (this.state !== 'fighting') return;

    // Reset hit tracking when attack ends
    if (this.fighter1.currentAttack === null) this.fighter1._hitLanded = false;
    if (this.fighter2.currentAttack === null) this.fighter2._hitLanded = false;

    this.fighter1.update(deltaTime, this.fighter2.x);
    this.fighter2.update(deltaTime, this.fighter1.x);
    this.checkCollisions();
    this.enforceDistance();
    this.checkWin();

    // Round timer
    if (this.state === 'fighting') {
      this.roundTimer -= deltaTime / 1000;
      if (this.roundTimer <= 0) {
        this.roundTimer = 0;
        this.endRound('time');
      }
    }
  }

  // --- Render ---

  render() {
    this.renderer.clear();
    this.renderer.drawRing();
    this.renderer.drawFighter(this.fighter1);
    this.renderer.drawFighter(this.fighter2);
    this.renderer.drawHealthBars(this.fighter1.health, this.fighter2.health);
    this.renderer.drawStaminaBars(this.fighter1.stamina, this.fighter2.stamina);
    this.renderer.drawRoundInfo(this.currentRound, MAX_ROUNDS, this.roundTimer, this.scores);
    this.renderer.drawDamageNumbers(this.fighter1, this.fighter2);

    if (this.state === 'waiting') {
      this.renderer.drawCenterText('BOXING', 48);
      this.renderer.drawSubText('Press SPACE or ENTER to fight');
      this.renderer.drawSubText2('Best of ' + MAX_ROUNDS + ' rounds');
    } else if (this.state === 'countdown') {
      this.renderer.drawCenterText(this.transitionText, this.transitionText === 'FIGHT!' ? 56 : 72);
    } else if (this.state === 'paused') {
      this.renderer.drawOverlay();
      this.renderer.drawCenterText('PAUSED', 48);
      this.renderer.drawSubText('Press SPACE to resume');
    } else if (this.state === 'roundEnd') {
      this.renderer.drawCenterText(this.transitionText, 56);
      const lastResult = this.roundResults[this.roundResults.length - 1];
      let resultText;
      if (lastResult === 'p1') resultText = 'Player 1 wins round ' + this.roundResults.length;
      else if (lastResult === 'p2') resultText = 'Player 2 wins round ' + this.roundResults.length;
      else resultText = 'Round ' + this.roundResults.length + ' is a draw';
      this.renderer.drawSubText(resultText);
      this.renderer.drawSubText2('P1: ' + this.scores.p1 + '  -  P2: ' + this.scores.p2);
    } else if (this.state === 'matchEnd') {
      this.renderer.drawOverlay();
      if (this.matchWinner === 'Draw') {
        this.renderer.drawCenterText('DRAW!', 56);
      } else {
        this.renderer.drawCenterText(this.matchWinner + ' WINS!', 48);
      }
      this.renderer.drawSubText('P1: ' + this.scores.p1 + '  -  P2: ' + this.scores.p2);
      this.renderer.drawMatchStats(this.matchStats);
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
const boxingGame = new BoxingGame();
window.boxingGame = boxingGame;
boxingGame.start();

const boxingVoice = new BoxingVoiceInput(boxingGame);
boxingGame.voiceInput = boxingVoice;
boxingVoice.initialize().catch(() => {
  const el = document.getElementById('voiceStatus');
  if (el) {
    el.textContent = 'Voice: Unavailable';
    el.style.color = '#666';
  }
});
