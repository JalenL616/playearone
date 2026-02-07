# Voice-Controlled 2D Boxing Game Plan

## Game Concept
A 2D side-view boxing game where two players control fighters using voice commands. Inspired by Street Fighter but simplified for voice control with clear, responsive animations.

## Core Voice Commands

### Movement Commands
- **"forward"** / **"advance"** - Move toward opponent
- **"back"** / **"retreat"** - Move away from opponent
- **"dodge"** / **"duck"** - Quick defensive duck (brief invincibility)

### Attack Commands
- **"jab"** / **"left"** - Quick left jab (fast, low damage)
- **"cross"** / **"right"** - Right cross (slower, medium damage)
- **"hook"** - Left hook (medium speed, good damage)
- **"uppercut"** - Uppercut (slow, high damage, short range)

### Defense Commands
- **"block"** / **"guard"** - Raise guard (reduces damage)
- **"weave"** - Side-to-side head movement (dodge timing-based)

## Game Mechanics

### Fighter Stats
- **Health**: 100 HP per fighter
- **Stamina**: 100 points (depletes with actions, regenerates slowly)
- **Position**: X coordinate on horizontal axis
- **State**: Idle, Moving, Attacking, Blocking, Dodging, Stunned, KO'd

### Combat System
- **Hit Detection**: Simple bounding box collision
- **Damage Values**:
  - Jab: 5 HP
  - Cross: 10 HP
  - Hook: 15 HP
  - Uppercut: 25 HP
- **Stamina Cost**:
  - Jab: 5
  - Cross: 10
  - Hook: 15
  - Uppercut: 25
  - Block: 2/second
  - Dodge: 15
- **Block Reduction**: 50% damage when blocking
- **Dodge Window**: 0.3 second invincibility frame
- **Attack Range**: 
  - Jab: 60px
  - Cross: 70px
  - Hook: 50px
  - Uppercut: 40px
- **Attack Speed**:
  - Jab: 200ms
  - Cross: 350ms
  - Hook: 400ms
  - Uppercut: 600ms
- **Recovery Time**: Brief cooldown after each attack to prevent spam
- **Stun Mechanic**: Taking 3 hits in 2 seconds causes 1-second stun

### Round System
- **Round Time**: 90 seconds
- **Rounds**: Best of 3
- **Victory Conditions**:
  - KO (health reaches 0)
  - TKO (3 knockdowns in one round)
  - Decision (higher health at time limit)

## Visual Design

### Art Style
- **Minimalist 2D sprites** - Simple geometric shapes with clear silhouettes
- **Color Scheme**: 
  - Player 1: Blue trunks/gloves
  - Player 2: Red trunks/gloves
  - Background: Neutral grays with crowd silhouettes
- **Animation Frames**: 3-5 frames per action for smooth motion

### Fighter Representation
```
Idle Pose:
    O     (head)
   /|\    (body/arms)
   / \    (legs)

Jab Pose:
    O
   /|==   (extended arm)
   / \

Block Pose:
    O
   [|]    (raised guard)
   / \
```

### UI Elements
- **Top Bar**: Health bars, round timer, round counter
- **Side Panels**: 
  - Fighter names
  - Stamina bars (vertical)
  - Last command indicator
  - Volume meter (from existing system)
- **Center**: Arena with distance markers
- **Bottom**: Command hints (optional tutorial mode)

### Screen Layout
```
┌─────────────────────────────────────────────────────────────┐
│ P1: ████████████░░░░  90s  Round 1  ░░░░████████████  :P2  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🟦 ░░░░                                      ░░░░ 🟥      │
│  P1  STA                                       STA  P2      │
│  ███  [█]                                     [█]  ███      │
│  ███  [█]                                     [█]  ███      │
│  ███  [█]                                     [█]  ███      │
│      [█]                                     [█]            │
│      [░]                                     [█]            │
│                                                             │
│           O                           O                     │
│          /|\                         /|\                    │
│          / \                         / \                    │
│  ─────────────────────────────────────────────────         │
│         RING                                                │
└─────────────────────────────────────────────────────────────┘
```

## Technical Architecture

### File Structure
```
boxing/
  index.html           - Main game page, canvas setup, script loading
  styles.css          - UI styling, health bars, overlays, responsive layout
  js/
    constants.js      - Game constants (MVP: damage, speeds, ranges, cooldowns)
                       - Attack definitions: { type, damage, range, duration, stamina }
                       - Fighter constants: maxHealth, moveSpeed, attackCooldown
                       - Canvas dimensions, colors
    
    Fighter.js        - Fighter entity class
                       - MVP: position, health, state, facing, takeDamage(), render()
                       - Post-MVP: stamina, animations, hitbox/hurtbox, combo tracking
                       - Methods: attack(type), block(), dodge(), move(direction)
                       - updateAnimation(deltaTime) - frame advancement
                       - canPerformAction(actionType) - stamina/cooldown checks
     (Detailed)
```javascript
class Fighter {
  // Core Properties
  constructor(x, y, facing, color) {
    this.position = { x, y };              // Current position on canvas
    this.startPosition = { x, y };         // Reset position for new rounds
    this.velocity = { x: 0, y: 0 };        // For smooth movement (post-MVP)
    
    // Stats
    this.maxHealth = 100;
    this.health = 100;                     // Current health (0-100)
    this.maxStamina = 100;                 // Post-MVP
    this.stamina = 100;                    // Post-MVP (0-100)
    
    // State Management
    this.state = 'idle';                   // idle, moving, attacking, blocking, dodging, hurt, KO
    this.facing = facing;                  // 'left' or 'right'
    this.isAlive = true;
    this.isInvincible = false;             // During dodge i-frames
    
    // Combat Timing
    this.actionCooldown = 0;               // Time until can act again (ms)
    this.attack (Detailed)
```javascript
class Game {
  constructor() {
    // Canvas setup
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;   // 800px
    this.canvas.height = CANVAS_HEIGHT;  // 600px
    
    // Fighters
    this.fighter1 = new Fighter(200, 400, 'right', 'blue');
    this.fighter2 = new Fighter(600, 400, 'left', 'red');
    
    // Game State
    this.state = 'menu';  // menu, countdown, fighting, paused, roundEnd, matchEnd
    this.isPaused = false;
    
    // Timing
    this.lastTime = 0;
    this.deltaTime = 0;
    
    // Round System (Post-MVP)
    this.roundTimer = ROUND_DURATION;  // 90 seconds
    this.currentRound = 1;
    this.maxRounds = 3;
    this.roundWinners = [];  // Track who won each round
    
    // Score
    this.scores = {
      fighter1: 0,  // Rounds won
      fighter2: 0
    };
    
    // Collision tracking
    this.lastHitBy = {
      fighter1: null,
      fighter2: null
    };
    this.hitTimestamps = {
      fighter1: [],
      fighter2: []
    };
    
    // UI Elements
    this.renderer = new Renderer(this.ctx);
    this.ui = {
      countdownText: '',
      roundEndText: '',
      winnerText: ''
    };
  }
  
  // Main Game Loop
  start() {
    this.state = 'fighting';
    this.gameLoop(performance.now());
  }
  
  gameLoop(currentTime) {
    // Calculate delta time
    this.deltaTime = currentTime - this.lastTime;
    this.lastTime = c (Detailed)

#### Backend Integration
- **Reuse existing infrastructure**: WebSocket handler, speaker identification, command parser
- **Add boxing commands to config.py**:
  ```python
  VALID_COMMANDS = ["jab", "cross", "hook", "uppercut", "block", "dodge", 
                    "forward", "back", "guard", "duck", "advance", "retreat",
                    "left", "right", "upper", "pause"]
  ```
  
- **Phonetic matching in parser.py**:
  ```python
  # "jab" variations
  if text_lower in ["jab", "job", "ja", "jap", "jabs"]:
      return ParsedCommand("jab", raw_text, 0.85)
  
  # "cross" variations
  if text_lower in ["cross", "crawss", "craw", "crosses"]:
      return ParsedCommand("cross", raw_text, 0.85)
  
  # "hook" variations
  if text_lower in ["hook", "huk", "hooked", "hulk"]:
      return ParsedCommand("hook", raw_text, 0.85)
  
  # "uppercut" variations
  if text_lower in ["uppercut", "upper", "cut", "upperkat", "upcut"]:
      return ParsedCommand("uppercut", raw_text, 0.85)
  
  # "block" variations
  if text_lower in ["block", "blog", "blocked", "box"]:
      return ParsedCommand("block", raw_text, 0.85)
  
  # "dodge" variations
  if text_lower in ["dodge", "duck", "doge", "dodged", "dok"]:
      return ParsedCommand("dodge", raw_text, 0.85)
  
  # "forward" variations
  if text_lower in ["forward", "for", "towards", "advance"]:
      return ParsedCommand("forward", raw_text, 0.85)
  
  # "back" variations  
  if text_lower in ["back", "bak", "backwards", "retreat"]:
      return ParsedCommand("back", raw_text, 0.85)
  ```

#### Frontend VoiceInput.js Adaptation
```javascript
class BoxingVoiceInput extends VoiceInput {
  constructor(game) {
    super();
    this.game = game;
    
    // Command to action mapping
    this.commandMap = {
      'jab': 'jab',
      'left': 'jab',
      'cross': 'cross',
      'right': 'cross',
      'hook': 'hook',
      'uppercut': 'uppercut',
      'upper': 'uppercut',
      'block': 'block',
      'guard': 'block',
      'dodge': 'dodge',
      'duck': 'dodge',
      'forward': 'forward',
      'advance': 'forward',
      'back': 'back',
      'retreat': 'back',
      'pause': 'pause'
    };
    
    // Debounce tracking
    this.lastCommands = { 1: null, 2: null };
    this.lastCommandTime = { 1: 0, 2: 0 };
    this.debounceTime = 100;  // ms
  }
  
  handleVoiceCommand(player, command, confidence, volume) {
    // Higher confidence threshold for combat
    if (confidence < 0.65) {
      console.log(`[Voice] Command '${command}' rejected: low confidence ${confidence}`);
      return;
    }
    
    // Map command
    const action = this.commandMap[command];
    if (!action) {
      console.log(`[Voice] Unknown command: ${command}`);
      return;
    }
    
    // Debounce same command
    const now = performance.now();
    if (this.lastCommands[player] === action && 
        now - this.lastCommandTime[player] < this.debounceTime) {
      console.log(`[Voice] Command '${action}' debounced`);
      return;
    }
    
    this.lastCommands[player] = action;
    this.lastCommandTime[player] = now;
    
    // Update volume meter
    this.updateVolumeMeter(player, volume);
    
    // Send to game
    this.game.handleCommand(player, action);
    
    // Show visual feedback
    this.showCommand(player, action);
    
    console.log(`[Voice] Player ${player}: ${action} (confidence: ${confidence.toFixed(2)}, volume: ${volume.toFixed(2)})`);
  }
  
  // Volume modulation (Post-MVP)
  getVolumeModifier(volume) {
    // Louder voice = faster attack windup
    // 0.5 volume = normal speed (1.0x)
    // 1.0 volume = faster (1.3x)
    // 0.2 volume = slower (0.8x)
    return 0.6 + (volume * 0.7);
  }
}
```

#### Command Processing Flow
1. **Audio captured** → 16kHz PCM chunks
2. **Sent to backend** → WebSocket
3. **Speaker identified** → Pyannote.audio embedding match
4. **Transcribed** → Deepgram Nova-2
5. **Command extracted** → Direct match or LLM fallback
6. **Volume calculated** → RMS of audio chunk
7. **Sent to frontend** → JSON with player, command, confidence, volume
8. **Game updated** → handleCommand() triggers fighter action
9. **Visual feedback** → Command indicator flashes

#### Simultaneous Commands (Post-MVP)
- Parse multi-word utterances: "forward jab" → execute forward, then jab
- LLM prompt updated to extract sequences:
  ```
  "move forward and jab" → ["forward", "jab"]
  "dodge back" → ["dodge", "back"]
  ```
- Execute in order with slight delay (100ms between)
- Useful for combo moves

#### Volume Modulation (Post-MVP)
- **Attack Power**: Louder voice slightly increases damage (5-10%)
  ```javascript
  const damageMultiplier = 1.0 + (volume - 0.5) * 0.2;  // 0.9x - 1.1x
  ```
- **Attack Speed**: Louder voice reduces windup time
  ```javascript
  const speedMultiplier = 0.8 + (volume * 0.4);  // 0.8x - 1.2x
  ```
- **Risk/Reward**: Shouting is powerful but fatiguing; encourages varied play

#### Anti-Spam Measures
- **Cooldown system**: 300ms between any actions per fighter
- **Stamina costs**: Prevent command spamming (post-MVP)
- **Confidence threshold**: 0.65 filters out false positives
- **Debounce**: Same command within 100ms ignored
- **Recovery frames**: Post-attack cooldown varies by move
    
    // Render
    this.render();
    
    // Continue loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }
  
  update(deltaTime) {
    if (this.state !== 'fighting') {
      return;
    }
    
    // Update fighters
    this.fighter1.update(deltaTime, this.fighter2.position);
    this.fighter2.update(deltaTime, this.fighter1.position);
    
    // Check collisions
    this.checkCollisions();
    
    // Update round timer (Post-MVP)
    if (this.roundTimer > 0) {
      this.roundTimer -= deltaTime / 1000;
      if (this.roundTimer <= 0) {
        this.endRound('time');
      }
    }
    
    // Check win conditions
    this.checkWinConditions();
    
    // Update combo tracking
    this.updateCombos();
  }
  
  checkCollisions() {
    // Fighter 1 attacking Fighter 2
    if (this.fighter1.attackActive) {
      const f1Hitbox = this.fighter1.getHitbox();
      const f2Hurtbox = this.fighter2.getHurtbox();
      
      if (f1Hitbox && this.boxesCollide(f1Hitbox, f2Hurtbox)) {
        // Only register hit once per attack
        if (this.lastHitBy.fighter2 !== this.fighter1.currentAttack) {
          const damage = this.fighter2.takeDamage(
            this.fighter1.currentAttack.damage,
            this.fighter1.currentAttack.type
          );
          
          if (damage > 0) {
            this.fighter1.stats.punchesLanded++;
            this.fighter1.stats.damageDealt += damage;
            this.fighter1.stats.comboCount++;
            
            // Track hit for combo system
            this.hitTimestamps.fighter2.push(performance.now());
            this.lastHitBy.fighter2 = this.fighter1.currentAttack;
            
            console.log(`Fighter 1 ${this.fighter1.currentAttack.type} hit! Damage: ${damage}`);
          }
        }
      }
    }
    
    // Fighter 2 attacking Fighter 1
    if (this.fighter2.attackActive) {
      const f2Hitbox = this.fighter2.getHitbox();
      const f1Hurtbox = this.fighter1.getHurtbox();
      
      if (f2Hitbox && this.boxesCollide(f2Hitbox, f1Hurtbox)) {
        if (this.lastHitBy.fighter1 !== this.fighter2.currentAttack) {
          const damage = this.fighter1.takeDamage(
            this.fighter2.currentAttack.damage,
            this.fighter2.currentAttack.type
          );
          
          if (damage > 0) {
            this.fighter2.stats.punchesLanded++;
            this.fighter2.stats.damageDealt += damage;
            this.fighter2.stats.comboCount++;
            
            this.hitTimestamps.fighter1.push(performance.now());
            this.lastHitBy.fighter1 = this.fighter2.currentAttack;
            
            console.log(`Fighter 2 ${this.fighter2.currentAttack.type} hit! Damage: ${damage}`);
          }
        }
      }
    }
    
    // Enforce minimum distance between fighters
    const distance = Math.abs(this.fighter1.position.x - this.fighter2.position.x);
    const minDistance = 100;  // Can't get closer than this
    
    if (distance < minDistance) {
      // Push fighters apart
      const pushAmount = (minDistance - distance) / 2;
      if (this.fighter1.position.x < this.fighter2.position.x) {
        this.fighter1.position.x -= pushAmount;
        this.fighter2.position.x += pushAmount;
      } else {
        this.fighter1.position.x += pushAmount;
        this.fighter2.position.x -= pushAmount;
      }
    }
  }
  
  boxesCollide(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }
  
  updateCombos() {
    const now = performance.now();
    const comboWindow = 2000;  // 2 seconds
    
    // Update Fighter 1 combo
    this.hitTimestamps.fighter1 = this.hitTimestamps.fighter1.filter(
      time => now - time < comboWindow
    );
    if (this.hitTimestamps.fighter1.length === 0) {
      if (this.fighter1.stats.comboCount > this.fighter1.stats.longestCombo) {
        this.fighter1.stats.longestCombo = this.fighter1.stats.comboCount;
      }
      this.fighter1.stats.comboCount = 0;
    }
    
    // Update Fighter 2 combo
    this.hitTimestamps.fighter2 = this.hitTimestamps.fighter2.filter(
      time => now - time < comboWindow
    );
    if (this.hitTimestamps.fighter2.length === 0) {
      if (this.fighter2.stats.comboCount > this.fighter2.stats.longestCombo) {
        this.fighter2.stats.longestCombo = this.fighter2.stats.comboCount;
      }
      this.fighter2.stats.comboCount = 0;
    }
  }
  
  checkWinConditions() {
    // MVP: Simple KO check
    if (!this.fighter1.isAlive) {
      this.endRound('KO', 'fighter2');
    } else if (!this.fighter2.isAlive) {
      this.endRound('KO', 'fighter1');
    }
  }
  
  endRound(reason, winner) {
    if (this.state !== 'fighting') return;
    
    this.state = 'roundEnd';
    console.log(`Round ${this.currentRound} ended: ${reason}`);
    
    // Determine winner
    let roundWinner = winner;
    if (reason === 'time') {
      // Decision based on health
      if (this.fighter1.health > this.fighter2.health) {
        roundWinner = 'fighter1';
      } else if (this.fighter2.health > this.fighter1.health) {

### MVP Success Criteria
- ✓ Both players can control fighters with voice
- ✓ Commands trigger within 500ms
- ✓ Punches visibly connect and reduce health
- ✓ Winner clearly determined when health reaches 0
- ✓ No crashes during 5-minute play session
- ✓ Basic visual feedback (health bars, simple sprites)
- ✓ Command recognition > 70% accuracy

### Post-MVP Quality Targets
- Command recognition accuracy > 85%
- Average command-to-action latency < 400ms
- Hit detection feels fair and consistent
- Animations are smooth and readable
- Game feels balanced (no dominant strategy)
- Players can complete best-of-3 matches
- Fun factor: 80% of testers want rematch

### Performance Benchmarks
- Maintain 60 FPS during active combat
- Audio latency < 100ms (capture to backend)
- WebSocket message processing < 50ms
- Speaker identification < 200ms
- Command parsing (direct match) < 100ms
- Total command latency budget: 450ms

### Accessibility Goals
- Voice recognition works for diverse accents
- Clear visual feedback for all actions
- Colorblind-friendly UI (not just red/blue)
- Keyboard fallback fully functional
- Tutorial mode explains all mechanics
- Stats screen aids understanding of gameplay
    // Update scores
    if (roundWinner === 'fighter1') {
      this.scores.fighter1++;
    } else if (roundWinner === 'fighter2') {
      this.scores.fighter2++;
    }
    
    this.roundWinners.push(roundWinner);
    
    // Check if match is over
    if (this.currentRound >= this.maxRounds || 
        this.scores.fighter1 > this.maxRounds / 2 ||
        this.scores.fighter2 > this.maxRounds / 2) {
      setTimeout(() => this.endMatch(), 3000);
    } else {
      setTimeout(() => this.startNextRound(), 3000);
    }
  }
  
  startNextRound() {
    this.currentRound++;
    this.roundTimer = ROUND_DURATION;
    
    // Reset fighters
    this.fighter1.reset();
    this.fighter2.reset();
    
    // Clear collision tracking
    this.lastHitBy = { fighter1: null, fighter2: null };
    this.hitTimestamps = { fighter1: [], fighter2: [] };
    
    // Start countdown
    this.startCountdown(() => {
      this.state = 'fighting';
    });
  }
  
  startCountdown(callback) {
    this.state = 'countdown';
    let count = 3;
    
    const countdown = setInterval(() => {
      this.ui.countdownText = count > 0 ? count : 'FIGHT!';
      count--;
      
      if (count < 0) {
        clearInterval(countdown);
        this.ui.countdownText = '';
        callback();
      }
    }, 1000);
  }
  
  endMatch() {
    this.state = 'matchEnd';
    
    // Determine match winner
    let matchWinner;
    if (this.scores.fighter1 > this.scores.fighter2) {
      matchWinner = 'Fighter 1';
    } else if (this.scores.fighter2 > this.scores.fighter1) {
      matchWinner = 'Fighter 2';
    } else {
      matchWinner = 'Draw';
    }
    
    this.ui.winnerText = `${matchWinner} Wins!`;
    console.log(`Match over! ${matchWinner}`);
    
    // Display stats
    this.displayMatchStats();
  }
  
  displayMatchStats() {
    console.log('=== Match Stats ===');
    console.log('Fighter 1:', this.fighter1.stats);
    console.log('Fighter 2:', this.fighter2.stats);
  }
  
  handleCommand(player, command) {
    const fighter = player === 1 ? this.fighter1 : this.fighter2;
    
    if (this.state !== 'fighting') {
      return;
    }
    
    switch(command) {
      case 'jab':
      case 'left':
        fighter.attack('jab');
        break;
      case 'cross':
      case 'right':
        fighter.attack('cross');
        break;
      case 'hook':
        fighter.attack('hook');
        break;
      case 'uppercut':
      case 'upper':
        fighter.attack('uppercut');
        break;
      case 'block':
      case 'guard':
        fighter.block(true);
        break;
      case 'dodge':
      case 'duck':
        fighter.dodge();
        break;
      case 'forward':
      case 'advance':
        fighter.move('forward');
        break;
      case 'back':
      case 'retreat':
        fighter.move('back');
        break;
      case 'pause':
        this.togglePause();
        break;
    }
  }
  
  togglePause() {
    this.isPaused = !this.isPaused;
    this.state = this.isPaused ? 'paused' : 'fighting';
  }
  
  render() {
    // Clear canvas
    this.renderer.clear();
    
    // Draw ring/background
    this.renderer.drawRing();
    
    // Draw fighters
    this.renderer.drawFighter(this.fighter1);
    this.renderer.drawFighter(this.fighter2);
    
    // Draw UI
    this.renderer.drawHealthBars(this.fighter1.health, this.fighter2.health);
    this.renderer.drawStaminaBars(this.fighter1.stamina, this.fighter2.stamina);  // Post-MVP
    this.renderer.drawRoundInfo(this.currentRound, this.roundTimer);  // Post-MVP
    
    // Draw game state overlays
    if (this.state === 'countdown') {
      this.renderer.drawCenterText(this.ui.countdownText, 72);
    } else if (this.state === 'roundEnd') {
      this.renderer.drawCenterText(`Round ${this.currentRound} Complete!`, 48);
    } else if (this.state === 'matchEnd') {
      this.renderer.drawCenterText(this.ui.winnerText, 64);
      this.renderer.drawMatchStats(this.fighter1.stats, this.fighter2.stats);
    } else if (this.state === 'paused') {
      this.renderer.drawCenterText('PAUSED', 48);
    }
    
    // Draw debug info if enabled
    if (DEBUG_MODE) {
      this.renderer.drawDebugInfo(this);
    }
  }
  
  reset() {
    this.currentRound = 1;
    this.roundTimer = ROUND_DURATION;
    this.scores = { fighter1: 0, fighter2: 0 };
    this.roundWinners = [];
    this.fighter1.reset();
    this.fighter2.reset();
    this.state = 'menu';
  }
    // Stats Tracking (Post-MVP)
    this.stats = {
      punchesThrown: 0,
      punchesLanded: 0,
      damageDealt: 0,
      damageTaken: 0,
      blocksSuccessful: 0,
      dodgesSuccessful: 0,
      comboCount: 0,
      longestCombo: 0
    };
    
    // Visuals
    this.color = color;                    // Player color (blue/red)
    this.flashTimer = 0;                   // Hit flash effect
  }
  
  // Core Methods
  
  update(deltaTime, opponentPosition) {
    // Update facing direction
    this.updateFacing(opponentPosition);
    
    // Update cooldowns
    if (this.actionCooldown > 0) {
      this.actionCooldown -= deltaTime;
    }
    
    // Update attack timing
    if (this.currentAttack) {
      this.attackTimer += deltaTime;
      
      // Activate hitbox during middle portion of attack
      if (this.attackTimer > this.currentAttack.duration * 0.3 &&
          this.attackTimer < this.currentAttack.duration * 0.7) {
        this.attackActive = true;
      } else {
        this.attackActive = false;
      }
      
      // End attack when duration complete
      if (this.attackTimer >= this.currentAttack.duration) {
        this.endAttack();
      }
    }
    
    // Regenerate stamina (Post-MVP)
    if (this.state !== 'blocking' && this.stamina < this.maxStamina) {
      this.stamina += 10 * (deltaTime / 1000);  // 10 per second
      this.stamina = Math.min(this.stamina, this.maxStamina);
    }
    
    // Update animation frames (Post-MVP)
    this.updateAnimation(deltaTime);
    
    // Update visual effects
    if (this.flashTimer > 0) {
      this.flashTimer -= deltaTime;
    }
    
    // Check if still alive
    if (this.health <= 0 && this.isAlive) {
      this.KO();
    }
  }
  
  attack(attackType) {
    // Check if can attack
    if (!this.canPerformAction('attack')) {
      console.log('Cannot attack: on cooldown or insufficient stamina');
      return false;
    }
    
    // Get attack definition from constants
    const attackDef = ATTACKS[attackType];
    if (!attackDef) {
      console.error('Unknown attack type:', attackType);
      return false;
    }
    
    // Consume stamina (Post-MVP)
    this.stamina -= attackDef.staminaCost;
    
    // Set attack state
    this.state = 'attacking';
    this.currentAttack = { ...attackDef };
    this.attackTimer = 0;
    this.attackActive = false;
    this.actionCooldown = ATTACK_COOLDOWN;
    
    // Track stats
    this.stats.punchesThrown++;
    
    console.log(`${this.color} fighter: ${attackType} attack!`);
    return true;
  }
  
  endAttack() {
    this.state = 'idle';
    this.currentAttack = null;
    this.attackActive = false;
    this.attackTimer = 0;
  }
  
  block(isActive) {
    if (isActive && this.canPerformAction('block')) {
      this.state = 'blocking';
      this.stamina -= 2 * (1/60);  // 2 per second at 60fps (Post-MVP)
      return true;
    } else {
      if (this.state === 'blocking') {
        this.state = 'idle';
      }
      return false;
    }
  }
  
  dodge() {
    if (!this.canPerformAction('dodge')) {
      return false;
    }
    
    this.state = 'dodging';
    this.isInvincible = true;
    this.stamina -= DODGE_STAMINA_COST;  // Post-MVP
    this.actionCooldown = DODGE_DURATION;
    
    // End dodge after duration
    setTimeout(() => {
      this.isInvincible = false;
      if (this.state === 'dodging') {
        this.state = 'idle';
      }
    }, DODGE_DURATION);
    
    this.stats.dodgesSuccessful++;
    return true;
  }
  
  move(direction) {
    if (!this.canPerformAction('move')) {
      return false;
    }
    
    const moveDistance = 50;  // pixels
    
    if (direction === 'forward') {
      if (this.facing === 'right') {
        this.position.x += moveDistance;
      } else {
        this.position.x -= moveDistance;
      }
    } else if (direction === 'back') {
      if (this.facing === 'right') {
        this.position.x -= moveDistance;
      } else {
        this.position.x += moveDistance;
      }
    }
    
    // Clamp position to canvas bounds
    this.position.x = Math.max(50, Math.min(750, this.position.x));
    
    this.actionCooldown = MOVE_COOLDOWN;
    return true;
  }
  
  takeDamage(amount, attackType) {
    // Check invincibility (dodge)
    if (this.isInvincible) {
      console.log('Dodge successful! No damage taken.');
      return 0;
    }
    
    // Apply block reduction
    let finalDamage = amount;
    if (this.state === 'blocking') {
      finalDamage *= 0.4;  // 60% damage reduction
      this.stats.blocksSuccessful++;
      console.log(`Blocked! Damage reduced to ${finalDamage.toFixed(1)}`);
    }
    
    // Apply damage
    this.health -= finalDamage;
    this.health = Math.max(0, this.health);
    
    // Update stats
    this.stats.damageTaken += finalDamage;
    
    // Visual feedback
    this.flashTimer = 100;  // Flash for 100ms
    
    // Enter hurt state briefly (unless blocking)
    if (this.state !== 'blocking') {
      this.state = 'hurt';
      setTimeout(() => {
        if (this.state === 'hurt') {
          this.state = 'idle';
        }
      }, 200);
    }
    
    console.log(`${this.color} took ${finalDamage.toFixed(1)} damage. Health: ${this.health.toFixed(1)}`);
    return finalDamage;
  }
  
  canPerformAction(actionType) {
    // Cannot act if on cooldown
    if (this.actionCooldown > 0) {
      return false;
    }
    
    // Cannot act if KO'd
    if (!this.isAlive) {
      return false;
    }
    
    // Cannot act while already attacking
    if (this.currentAttack) {
      return false;
    }
    
    // Check stamina for specific actions (Post-MVP)
    if (actionType === 'attack' || actionType === 'dodge') {
      // Would check stamina here in post-MVP
      // return this.stamina >= requiredStamina;
    }
    
    return true;
  }
  
  updateFacing(opponentPosition) {
    if (opponentPosition.x > this.position.x) {
      this.facing = 'right';
    } else {
      this.facing = 'left';
    }
  }
  
  updateAnimation(deltaTime) {
    // Post-MVP: Advance animation frames
    this.animation.timer += deltaTime;
    if (this.animation.timer >= this.animation.frameRate) {
      this.animation.timer = 0;
      this.animation.frame++;
      // Loop or stop based on animation type
    }
  }
  
  KO() {
    this.isAlive = false;
    this.state = 'KO';
    this.health = 0;
    console.log(`${this.color} fighter KO'd!`);
  }
  
  reset() {
    this.position = { ...this.startPosition };
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.state = 'idle';
    this.isAlive = true;
    this.isInvincible = false;
    this.actionCooldown = 0;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.flashTimer = 0;
  }
  
  getHitbox() {
    // Return current hitbox based on attack and facing
    if (!this.attackActive || !this.currentAttack) {
      return null;
    }
    
    const hitbox = { ...this.hitbox };
    hitbox.width = this.currentAttack.range;
    
    if (this.facing === 'right') {
      hitbox.x = this.position.x + 20;
    } else {
      hitbox.x = this.position.x - this.currentAttack.range - 20;
    }
    hitbox.y = this.position.y;
    
    return hitbox;
  }
  
  getHurtbox() {
    return {
      x: this.position.x - this.hurtbox.width / 2,
      y: this.position.y - this.hurtbox.height,
      width: this.hurtbox.width,
      height: this.hurtbox.height
    };
  }
  
  render(ctx) {
    // MVP: Simple shape rendering
    // See Renderer.js for full drawing logic
  }nds to game actions
                       - Display command feedback UI
                       - Volume-based attack modulation (post-MVP)
    
    Input.js         - Keyboard fallback controls
                       - MVP: Arrow keys for player 1, WASD for player 2
                       - Key mappings: Z/X = jab/cross, A/S = block/dodge
                       - DEBUG: number keys for direct attack triggers
    
    AudioManager.js  - Sound effect player (post-MVP)
                       - Load and cache audio files
                       - play(soundName) with volume control
                       - Background music management
                       - Sound pooling for overlapping effects
    
    AnimationManager.js - Sprite animation controller (post-MVP)
                       - Load sprite sheets
                       - Define animation sequences
                       - getCurrentFrame(animationName, time)
                       - Manage animation state transitions
```

### Core Classes

#### Fighter Class
```javascript
class Fighter {
  - position { x, y }
  - health (0-100)
  - stamina (0-100)
  - state (idle, attacking, blocking, etc.)
  - facing (left/right)
  - animation { currentFrame, frameTimer }
  - cooldown (time until next action allowed)
  
  methods:
  - update(deltaTime)
  - attack(type)
  - block()
  - dodge()
  - move(direction)
  - takeDamage(amount, isBlocking)
  - regenerateStamina()
  - canAct() - check stamina and cooldown
}
```

#### Game Class
```javascript
class Game {
  - fighter1, fighter2
  - gameState (menu, fighting, paused, roundEnd, gameOver)
  - roundTimer
  - currentRound
  - scores { p1Rounds, p2Rounds }
  
  methods:
  - startRound()
  - update(deltaTime)
  - checkCollisions()
  - checkWinConditions()
  - endRound()
  - reset()
}
```

### Voice Integration
- Reuse existing speaker identification system
- Command confidence threshold: 0.6 (higher than Pong for safety)
- Simultaneous commands allowed (e.g., "forward jab")
- Volume affects attack "charge" time (louder = faster windup)
- Debounce: 100ms between same command to prevent double-triggers

## MVP Implementation Priority

### MVP Phase 1: Absolute Minimum Playable (PRIORITY 1)
**Goal**: Two players can fight with basic commands and see who wins

- [ ] **HTML Canvas Setup**
  - Create boxing/index.html with 800x600 canvas
  - Link to styles.css and JS files
  - Add basic page structure with canvas element
  
- [ ] **Fighter Class - Minimal**
  - Position (x, y coordinates)
  - Health (0-100, displayed as bar)
  - State: idle, attacking, hurt, KO
  - Facing direction (left/right based on opponent position)
  - Single sprite representation (colored rectangle with circle head)
  - takeDamage(amount) method
  - isAlive() check
  
- [ ] **Two Attack Types Only**
  - **Jab**: Fast, 10 damage, 80px range, 200ms duration
  - **Cross**: Slower, 20 damage, 90px range, 400ms duration
  - Attack hit detection: simple distance check between fighters
  - Cooldown: 300ms between any actions
  - Visual: extend arm rectangle toward opponent
  
- [ ] **Basic Movement**
  - Forward: move 50px toward opponent (max distance: 100px apart)
  - Back: move 50px away (max distance: 400px apart)
  - Movement speed: 200px/second
  - No stamina cost in MVP
  
- [ ] **Voice Commands - Minimal Set**
  - "jab" or "left"
  - "cross" or "right"  
  - "forward" or "advance"
  - "back" or "retreat"
  - Reuse existing VoiceInput.js with new command mapping
  - No volume modulation in MVP
  
- [ ] **Basic UI**
  - Two health bars at top (filled rectangles)
  - Player names/numbers
  - "Fight!" / "KO!" text display
  - No stamina bars in MVP
  
- [ ] **Win Condition - Simple**
  - First to 0 health loses
  - Display winner name
  - Manual refresh to restart (no rematch button)
  
- [ ] **Rendering**
  - Clear canvas each frame
  - Draw both fighters as simple shapes
  - Draw health bars
  - Draw game state text
  - 60 FPS game loop with requestAnimationFrame

**MVP Success Criteria**: 
- Both players can see their fighters
- Voice commands trigger visible actions
- Punches land and reduce health
- Winner is clearly shown
- No crashes or freezes

---

### Post-MVP Phase 2: Core Combat Feel
**Goal**: Game feels responsive and satisfying to play

- [ ] **Enhanced Fighter Sprites**
  - 3-frame punch animations (windup, contact, recover)
  - Distinct idle vs attacking poses
  - Color-coded gloves and trunks (blue/red)
  - Head, torso, arms, legs as separate shapes
  - Scale: ~100px tall fighters
  
- [ ] **Complete Attack Set**
  - **Hook**: 15 damage, 70px range, 350ms, medium speed
  - **Uppercut**: 25 damage, 60px range, 500ms, slow/powerful
  - Each attack has unique animation
  - Attack state machine: windup → active hitbox → recovery
  - Hit/miss feedback immediately visible
  
- [ ] **Defense Mechanics**
  - **Block**: Hold state, reduces incoming damage by 60%
  - **Dodge**: 300ms action, grants invincibility during animation
  - Visual indicators: block shows raised guard, dodge shows crouch
  - Voice commands: "block" / "guard", "dodge" / "duck"
  
- [ ] **Stamina System**
  - 100 stamina max
  - Costs: Jab (5), Cross (10), Hook (12), Uppercut (20), Dodge (15), Block (2/sec)
  - Regenerates at 10/second when not blocking
  - Cannot act when stamina < action cost
  - Stamina bar visual (vertical bar next to fighter)
  
- [ ] **Hit Feedback**
  - Screen shake on heavy hits (uppercut)
  - Brief white flash on hit fighter
  - Red damage number floats up from impact point
  - Hurt animation: fighter staggers back 20px
  - Miss indicator: "MISS" text appears briefly
  
- [ ] **Improved Collision**
  - Hitbox visualization in debug mode
  - Separate hurtbox and hitbox for each fighter
  - Attack only hits during "active" frames
  - Cannot hit opponent during their dodge i-frames

**Phase 2 Success Criteria**:
- Combat feels impactful
- Players can strategize with all options
- Visual feedback makes hits/blocks/dodges clear
- Stamina adds resource management

---

### Post-MVP Phase 3: Game Structure
**Goal**: Proper match flow and progression

- [ ] **Round System**
  - 90-second timer countdown displayed
  - Round ends on timer or KO
  - Best of 3 rounds format
  - Round counter UI (1/3, 2/3, 3/3)
  - Brief intermission between rounds (3 seconds)
  - Health resets each round, fighters return to start positions
  
- [ ] **Win Conditions - Complete**
  - KO: Health reaches 0
  - Time Decision: Higher health when timer expires
  - Match Winner: Best of 3 rounds
  - Victory screen with winner announcement
  - Stats summary: Total damage dealt, punches landed, accuracy %
  
- [ ] **Game States**
  - Menu/Intro screen with "Start Fight" option
  - Pre-round countdown (3, 2, 1, FIGHT!)
  - Active fighting
  - Round end pause
  - Match end with winner display
  - Rematch button functionality
  
- [ ] **Pause System**
  - "pause" voice command or spacebar
  - Overlay menu: Resume, Restart, Quit
  - Game timer stops during pause
  - Resume countdown (3, 2, 1)

**Phase 3 Success Criteria**:
- Complete match can be played start to finish
- Clear progression through rounds
- Winner determination feels fair
- Easy to start new match

---

### Polish Phase 4: Enhanced Experience
**Goal**: Professional feel and replayability

- [ ] **Advanced Animations**
  - 5 frames per attack for smoother motion
  - Idle breathing animation (subtle bob)
  - Walking animation for movement
  - Victory pose for winner
  - KO knockdown animation
  - Block hit reaction (guard shake)
  
- [ ] **Visual Effects**
  - Particle effects on punch impact (stars, lines)
  - Motion blur trails on fast attacks
  - Dust particles on footwork
  - Ring canvas texture
  - Crowd silhouettes in background (static or animated)
  - Corner posts and ropes for ring boundaries
  
- [ ] **Sound Design**
  - Punch impact sounds (thud, crack) - different per punch type
  - Block sound (thump)
  - Dodge whoosh
  - Footstep sounds on movement
  - Crowd ambience
  - Bell sound for round start/end
  - KO bell
  - Victory fanfare
  - Background music (optional, toggleable)
  
- [ ] **UI Polish**
  - Smooth health bar animations (not instant drop)
  - Stamina bar color changes (green → yellow → red)
  - Fighter portraits/icons next to health bars
  - Combo counter (hits landed in succession)
  - "COMBO!" text on 3+ consecutive hits
  - Last command indicator with fade-out
  - Volume meter integrated into stamina bar glow
  
- [ ] **Camera Effects**
  - Dynamic zoom based on fighter distance
  - Pan to follow action
  - Slow-motion on KO final hit
  - Screen shake intensity based on damage
  
- [ ] **Stats Tracking**
  - Punches thrown by type
  - Accuracy percentage per fighter
  - Total damage dealt/received
  - Blocks successful
  - Dodges successful
  - Longest combo
  - Time spent attacking vs defending
  - Post-match stats screen with comparison

**Phase 4 Success Criteria**:
- Game looks and sounds professional
- Every action has satisfying feedback
- Players feel immersed in boxing match
- Stats provide interesting post-match analysis

---

### Advanced Features Phase 5 (Optional)
**Goal**: Extended gameplay and variety

- [ ] **Special Moves System**
  - Combo sequences trigger special attacks
  - Example: "jab, jab, cross" → Powerful combo finisher
  - Special bar charges with successful hits
  - Special moves have dramatic animations
  - Voice command: "special" when bar is full
  
- [ ] **Fighter Customization**
  - Choose fighter stats (Speed/Power/Defense balance)
  - Visual customization: skin tone, trunks color, gloves
  - Fighter name input
  - Persistent profiles saved to localStorage
  
- [ ] **Training Mode**
  - AI opponent with adjustable difficulty
  - Dummy mode: opponent doesn't attack, infinite health
  - Tutorial overlays explaining mechanics
  - Practice specific commands
  - Command accuracy statistics
  
- [ ] **Advanced AI**
  - Easy: Random attacks, no defense
  - Medium: Pattern-based attacks, occasional blocks
  - Hard: Reads player patterns, counters, strategic spacing
  - Boss AI: Special moves, aggressive playstyle
  
- [ ] **Tournament Mode**
  - 4 or 8 fighter bracket
  - Progress through matches to championship
  - Increasing difficulty each round
  - Trophy/achievement system
  
- [ ] **Replay System**
  - Record match data (commands, positions, health over time)
  - Playback with speed controls
  - Save replays to localStorage
  - Share replay JSON for viewing on other devices
  
- [ ] **Online Features** (Ambitious)
  - WebRTC peer-to-peer connection
  - Voice transmitted over network
  - Latency compensation
  - Quick match or friend invite
  - Leaderboard with win/loss records

**Phase 5 Success Criteria**:
- Significant replay value added
- Players can customize experience
- Solo play is viable and fun
- Competitive scene potential

## Command Parsing Considerations

### Phonetic Variations
- "jab" → "job", "jap", "ja"
- "cross" → "crawss", "craw"
- "hook" → "huk", "hooked"
- "uppercut" → "upper", "cut", "upperkat"
- "block" → "blog", "blocked", "box"
- "dodge" → "dodge", "duck", "doge"
- "forward" → "for", "forward", "towards"
- "back" → "bak", "backwards", "retreat"

### Multi-Word Commands
- "left jab" → parse as single jab command
- "right cross" → parse as cross command
- "move forward" → parse as forward
- Allow natural language: "punch left", "throw a jab"

## Technical Challenges & Solutions

### Challenge: Fast Voice Response Time
**Solution**: 
- Reduce audio chunk size to 0.5s (from 1.5s)
- Prioritize speed over perfect transcription
- Use direct command matching before LLM fallback

### Challenge: Preventing Button Mashing
**Solution**:
- Cooldown system between actions
- Stamina cost prevents spam
- Recovery frames after attacks

### Challenge: Fairness in Voice Recognition
**Solution**:
- Per-speaker calibration during enrollment
- Volume normalization
- Command confidence logging for balance tuning

### Challenge: Visual Clarity
**Solution**:
- Large, distinct sprites
- Color-coded players
- Clear hit feedback (flash, shake)
- Status indicators always visible

## Success Metrics
- Command recognition accuracy > 90%
- Average command-to-action latency < 0.5s
- Game feels responsive and fair
- Players can complete full 3-round matches
- Clear winner determination
- Fun factor: Players want to rematch

## Future Expansion Ideas
- **Career Mode**: Fight through ranked opponents
- **Character Customization**: Different stats, appearances
- **Special Moves**: Complex voice sequences unlock power moves
- **Crowd Noise**: Dynamic audio based on fight intensity
- **Replay System**: Record and review matches
- **Online Multiplayer**: Voice over network with latency compensation
- **Mobile Support**: Touch controls + voice hybrid
