# Voice-Controlled 2D Boxing Game Plan

## Game Concept
A 2D side-view boxing game where two players control fighters using voice commands. Inspired by Street Fighter but simplified for voice control with clear, responsive animations.

## Core Voice Commands

### Attack Commands
- **"jab"** / **"left"** - Quick left jab (fast, low damage)
- **"cross"** / **"right"** - Right cross (slower, medium damage)
- **"hook"** - Left hook (medium speed, good damage)
- **"uppercut"** - Uppercut (slow, high damage, short range)

### Movement Commands
- **"forward"** / **"advance"** - Move toward opponent
- **"back"** / **"retreat"** - Move away from opponent

### Defense Commands
- **"block"** / **"guard"** - Raise guard (reduces damage, auto-releases after 1.5s)
- **"dodge"** / **"duck"** - Quick defensive duck (brief invincibility)

### Game Control Commands
- **"pause"** - Pause/unpause the match
- **"fight"** / **"start"** - Start round or rematch

## Game Mechanics

### Fighter Stats
- **Health**: 100 HP per fighter
- **Stamina**: 100 points (depletes with actions, regenerates slowly) *(post-MVP)*
- **Position**: X coordinate on horizontal axis
- **State**: idle, moving, attacking, blocking, dodging, hurt, stunned, KO

### Combat System

**Damage Values**:
| Attack    | Damage | Range | Duration | Stamina Cost | Cooldown |
|-----------|--------|-------|----------|--------------|----------|
| Jab       | 10 HP  | 80px  | 200ms    | 5            | 300ms    |
| Cross     | 20 HP  | 90px  | 400ms    | 10           | 300ms    |
| Hook      | 15 HP  | 70px  | 350ms    | 12           | 300ms    |
| Uppercut  | 25 HP  | 60px  | 500ms    | 20           | 300ms    |

**Hit Detection**: Bounding box collision during active attack frames (30%-70% of attack duration).

**Block Mechanic**:
- Reduces incoming damage by 60%
- Auto-releases after 1.5 seconds (voice commands are discrete, not held)
- Any attack or movement command cancels block immediately
- Costs 2 stamina/second while active *(post-MVP)*

**Dodge Mechanic**:
- 300ms invincibility window
- Costs 15 stamina *(post-MVP)*
- Fighter visually crouches during dodge

**Knockdown System** *(post-MVP)*:
- Triggered when a single hit deals 20+ damage while fighter is below 30 HP
- Fighter falls to ground for 2 seconds, then auto-recovers to standing with brief invincibility
- 3 knockdowns in one round = TKO (automatic round loss)
- Knockdown counter resets each round

**Stun Mechanic** *(post-MVP)*:
- Taking 3 hits within 2 seconds causes 1-second stun
- Stunned fighter cannot act but can still take damage
- Visual indicator: stars above head

### Movement Model
- **MVP**: Instant 50px teleport per command (snappy, responsive to voice latency)
- **Post-MVP option**: Velocity-based with acceleration (smoother but may feel laggy with voice delay)
- **Boundaries**: Fighters clamped to 50px-750px on canvas
- **Minimum distance**: 100px between fighters (auto-push apart)
- **Maximum distance**: 400px between fighters (can't retreat further)

### Round System
- **Round Time**: 90 seconds
- **Rounds**: Best of 3
- **Victory Conditions**:
  - KO (health reaches 0)
  - TKO (3 knockdowns in one round) *(post-MVP)*
  - Decision (higher health at time limit)
- **Between rounds**: 3-second intermission, health resets, positions reset

## Visual Design

### Art Style
- **Minimalist 2D sprites** - Simple geometric shapes with clear silhouettes
- **Color Scheme**:
  - Player 1: Blue trunks/gloves
  - Player 2: Red trunks/gloves
  - Background: Neutral grays with ring floor
- **Animation Frames**: 3-5 frames per action for smooth motion

### Fighter Representation
```
Idle Pose:        Jab Pose:         Block Pose:
    O                 O                 O
   /|\               /|==              [|]
   / \               / \               / \
```

### Screen Layout
```
┌─────────────────────────────────────────────────────────────┐
│ P1: ████████████░░░░  90s  Round 1  ░░░░████████████  :P2   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P1                                                  P2     │
│  [CMD]                                             [CMD]    │
│  [VOL]                                             [VOL]    │
│                                                             │
│           O                           O                     │
│          /|\                         /|\                    │
│          / \                         / \                    │
│  ─────────────────────────────────────────────────          │
│                      RING                                   │
└─────────────────────────────────────────────────────────────┘
```

### UI Elements
- **Top Bar**: Health bars, round timer, round counter
- **Side Panels**:
  - Player names (from speaker assignments)
  - Speaker selection dropdowns (reuse from Pong)
  - Last command indicator
  - Volume meter (reuse from Pong)
- **Center**: Arena with ring floor
- **Bottom**: Command hints (optional tutorial mode)

## Technical Architecture

### File Structure
```
boxing/
  index.html            - Game page with canvas, player panels, script loading
  styles.css            - Health bars, ring styling, overlays, responsive layout
  js/
    constants.js        - Attack definitions, fighter constants, canvas dimensions
    Fighter.js          - Fighter entity class (position, health, state, combat)
    Game.js             - Game orchestrator (loop, collisions, rounds, state machine)
    Renderer.js         - Canvas drawing (ring, fighters, health bars, overlays)
    BoxingVoiceInput.js - Extends VoiceInput with boxing command mapping
    Input.js            - Keyboard fallback controls
    AudioManager.js     - Sound effects (post-MVP)
    AnimationManager.js - Sprite animation controller (post-MVP)
```

### Core Classes

#### Fighter Class
```javascript
class Fighter {
  // Properties
  position { x, y }
  health (0-100)
  stamina (0-100)         // post-MVP
  state (idle, attacking, blocking, dodging, hurt, KO)
  facing (left/right)
  currentAttack           // active attack definition or null
  actionCooldown          // ms until next action allowed
  blockTimer              // auto-release countdown

  // Methods
  update(deltaTime)       // cooldowns, attack timing, stamina regen
  attack(type)            // jab/cross/hook/uppercut
  block()                 // raise guard, starts 1.5s auto-release timer
  dodge()                 // 300ms invincibility
  move(direction)         // forward/back 50px
  takeDamage(amount)      // apply damage, check block/dodge
  canPerformAction(type)  // cooldown + stamina checks
  reset()                 // restore for new round
}
```

#### Game Class
```javascript
class Game {
  // Properties
  fighter1, fighter2
  state (menu, countdown, fighting, paused, roundEnd, matchEnd)
  roundTimer
  currentRound
  scores { fighter1, fighter2 }

  // Methods
  start()                 // begin game loop
  update(deltaTime)       // update fighters, collisions, timer
  checkCollisions()       // hitbox vs hurtbox detection
  checkWinConditions()    // KO, TKO, time
  handleCommand(player, command)  // route voice command to fighter
  endRound(reason)        // KO/TKO/time
  startNextRound()        // reset fighters, countdown
  endMatch()              // determine winner, show stats
  reset()                 // full restart
}
```

### Keyboard Fallback Controls

Both players need full keyboard control for testing without voice:

**Player 1 (Left)**:
| Key | Action   |
|-----|----------|
| A   | Move back    |
| D   | Move forward |
| Z   | Jab          |
| X   | Cross        |
| C   | Hook         |
| V   | Uppercut     |
| S   | Block        |
| Q   | Dodge        |

**Player 2 (Right)**:
| Key        | Action   |
|------------|----------|
| ArrowLeft  | Move back    |
| ArrowRight | Move forward |
| J          | Jab          |
| K          | Cross        |
| L          | Hook         |
| ;          | Uppercut     |
| ArrowDown  | Block        |
| M          | Dodge        |

**Shared**:
| Key   | Action |
|-------|--------|
| Space | Pause  |
| Enter | Start / Rematch |

## Game Selection & Routing

### Backend Routes
Boxing follows the same pattern as Pong in `main.py`:

```python
boxing_path = os.path.join(os.path.dirname(__file__), "..", "boxing")

@app.get("/boxing")
async def boxing():
    index_path = os.path.join(boxing_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Boxing not found"}

if os.path.exists(boxing_path):
    app.mount("/boxing-static", StaticFiles(directory=boxing_path), name="boxing")
```

### Navigation
- Enrollment page (`/`) has links to both games
- Each game page has a nav header back to enrollment (already exists in Pong)
- Games share the same WebSocket endpoint (`/ws`) and speaker system

### Config Coexistence
`VALID_COMMANDS` in `config.py` must include commands for ALL games as a superset. The backend doesn't need to know which game is active — it just parses audio into commands and sends them to whichever frontend is connected.

```python
VALID_COMMANDS = [
    # Pong
    "up", "down",
    # Boxing
    "jab", "cross", "hook", "uppercut",
    "block", "dodge", "guard", "duck",
    "forward", "back", "advance", "retreat",
    # Shared
    "start", "pause", "resume", "serve", "fight",
]
```

Each game's VoiceInput class handles only the commands relevant to it — unknown commands are ignored on the frontend.

## Voice Integration

### BoxingVoiceInput
Extends the existing `VoiceInput` class (or copies the pattern) with boxing-specific command handling:

```javascript
class BoxingVoiceInput extends VoiceInput {
  constructor(game) {
    super();
    this.game = game;

    this.commandMap = {
      'jab': 'jab', 'left': 'jab',
      'cross': 'cross', 'right': 'cross',
      'hook': 'hook',
      'uppercut': 'uppercut', 'upper': 'uppercut',
      'block': 'block', 'guard': 'block',
      'dodge': 'dodge', 'duck': 'dodge',
      'forward': 'forward', 'advance': 'forward',
      'back': 'back', 'retreat': 'back',
      'pause': 'pause', 'fight': 'start', 'start': 'start'
    };

    this.debounceTime = 100;  // ms between same command
  }

  handleVoiceCommand(player, command, confidence, volume) {
    if (confidence < 0.65) return;  // higher threshold than Pong

    const action = this.commandMap[command];
    if (!action) return;

    // Debounce same command from same player
    // ...

    this.game.handleCommand(player, action);
    this.showCommand(player, action);
    this.updateVolumeMeter(player, volume);
  }
}
```

### Command Processing Flow
1. **Audio captured** (browser) → 16kHz PCM chunks
2. **Sent to backend** → WebSocket binary frames
3. **Speaker identified** → Pyannote embedding match → player number
4. **Transcribed** → Deepgram Nova-2
5. **Command extracted** → Direct match or LLM fallback
6. **Volume calculated** → RMS of audio chunk
7. **Sent to frontend** → JSON `{ type, player, command, confidence, volume }`
8. **Game updated** → `handleCommand()` triggers fighter action
9. **Visual feedback** → Command indicator flashes, volume meter updates

### Phonetic Matching
Add to `parser.py` direct match list:

```python
# Boxing commands
"jab": ["jab", "job", "ja", "jap", "jabs"],
"cross": ["cross", "crawss", "craw", "crosses"],
"hook": ["hook", "huk", "hooked", "hulk"],
"uppercut": ["uppercut", "upper", "cut", "upperkat", "upcut"],
"block": ["block", "blog", "blocked", "box"],
"dodge": ["dodge", "duck", "doge", "dodged", "dok"],
"forward": ["forward", "for", "towards", "advance"],
"back": ["back", "bak", "backwards", "retreat"],
```

### Multi-Word Commands *(post-MVP)*
Parse compound utterances into command sequences:
- "forward jab" → `["forward", "jab"]` executed with 100ms delay
- "dodge back" → `["dodge", "back"]`
- "throw a jab" → `["jab"]`

### Anti-Spam Measures
- **Action cooldown**: 300ms between any actions per fighter
- **Stamina costs**: Prevent command spamming *(post-MVP)*
- **Confidence threshold**: 0.65 filters false positives (higher than Pong's 0.5)
- **Debounce**: Same command from same player within 100ms ignored
- **Recovery frames**: Post-attack cooldown varies by move type

### Volume Modulation *(post-MVP)*
- **Attack speed**: Louder voice = faster windup (`0.8x - 1.2x` speed multiplier)
- **Attack power**: Louder voice = slight damage boost (`0.9x - 1.1x`)
- **Risk/reward**: Shouting is powerful but fatiguing; encourages varied play

## Latency Strategy

Current Pong system uses 1.5s audio buffers — too slow for boxing reactions. Target: **< 500ms command-to-action**.

### Approach
1. **Reduce audio buffer** to 0.75s for boxing (trade speaker ID accuracy for speed)
2. **Game-specific buffer config**: Add `buffer_duration` to WebSocket `start_listening` message so the backend adjusts per game
3. **Skip speaker ID on known sessions**: Once a speaker is identified 3+ times consecutively, skip Pyannote for subsequent chunks (just transcribe)
4. **Optimistic matching**: Direct phonetic match returns immediately without waiting for LLM
5. **Frontend prediction**: Show attack animation immediately on local keypress, confirm/rollback on server response *(post-MVP)*

### Latency Budget
| Stage                  | Target  |
|------------------------|---------|
| Audio capture + send   | < 100ms |
| WebSocket transit      | < 10ms  |
| Speaker ID             | < 150ms |
| Deepgram transcription | < 200ms |
| Command match          | < 10ms  |
| WebSocket response     | < 10ms  |
| Frontend render        | < 16ms  |
| **Total**              | **< 500ms** |

## Implementation Phases

### MVP Phase 1: Minimum Playable
**Goal**: Two players can fight with basic commands and see who wins

- [ ] **Canvas + page setup** — `boxing/index.html` with 800x600 canvas, player panels, nav header
- [ ] **constants.js** — Attack definitions (jab + cross only), fighter constants, canvas dimensions
- [ ] **Fighter.js (minimal)** — Position, health, state, facing, `attack()`, `takeDamage()`, `move()`
- [ ] **Game.js** — Game loop, `handleCommand()`, collision detection (distance-based), KO check
- [ ] **Renderer.js** — Clear canvas, draw fighters (rectangles + circles), health bars, state text
- [ ] **Input.js** — Keyboard fallback for both players
- [ ] **BoxingVoiceInput.js** — Command mapping, reuse WebSocket/mic from VoiceInput
- [ ] **Backend routes** — `/boxing` route, `/boxing-static` mount
- [ ] **Config update** — Add boxing commands to `VALID_COMMANDS`

**MVP commands**: jab, cross, forward, back (4 commands only)
**MVP win condition**: First to 0 HP, manual refresh to restart

**Success criteria**:
- Both players see their fighters
- Voice commands trigger visible actions
- Punches land and reduce health
- Winner clearly shown
- No crashes

---

### Phase 2: Core Combat Feel
**Goal**: Game feels responsive and satisfying

- [ ] **Complete attack set** — Hook + uppercut with unique animations
- [ ] **Defense** — Block (1.5s auto-release) + dodge (300ms i-frames)
- [ ] **Stamina system** — Costs per action, regen at 10/sec
- [ ] **Hit feedback** — Screen shake, white flash, damage numbers, stagger
- [ ] **Enhanced sprites** — Head/torso/arms/legs as shapes, 3-frame punch animations
- [ ] **Hitbox/hurtbox** — Separate boxes, attack active during 30%-70% of duration

---

### Phase 3: Game Structure
**Goal**: Complete match flow

- [ ] **Round system** — 90s timer, best of 3, health reset between rounds
- [ ] **Countdown** — 3, 2, 1, FIGHT! before each round
- [ ] **Win conditions** — KO, TKO (3 knockdowns), time decision
- [ ] **Match end** — Winner screen, stats summary, rematch button
- [ ] **Pause** — Voice or spacebar, overlay with resume/restart

---

### Phase 4: Polish
**Goal**: Professional feel

- [ ] **Advanced animations** — 5-frame attacks, idle breathing, walking, KO fall
- [ ] **Visual effects** — Impact particles, motion trails, dust, ring texture
- [ ] **Sound design** — Punch impacts, block thump, dodge whoosh, crowd, bell
- [ ] **UI polish** — Smooth health bars, stamina color gradient, combo counter
- [ ] **Camera effects** — Dynamic zoom, slow-mo on KO

---

### Phase 5: Advanced Features *(optional)*
- [ ] **Special moves** — Combo sequences trigger power attacks
- [ ] **Training mode** — AI opponent, dummy mode, tutorials
- [ ] **Fighter customization** — Stats balance, visual options, localStorage profiles
- [ ] **Tournament mode** — Bracket progression
- [ ] **Replay system** — Record/playback match data

## Technical Challenges & Solutions

### Challenge: Voice Latency for Combat
**Solution**: Reduce audio buffer to 0.75s, skip speaker ID after identification streak, direct phonetic matching returns instantly.

### Challenge: Block is a Hold State but Voice is Discrete
**Solution**: "block" command activates guard for 1.5 seconds, then auto-releases. Any attack or movement command cancels block early. This creates a strategic window rather than a permanent state.

### Challenge: Preventing Command Spam
**Solution**: 300ms cooldown between all actions, stamina costs, 100ms debounce on duplicate commands, recovery frames after attacks.

### Challenge: Fairness in Voice Recognition
**Solution**: Per-speaker calibration during enrollment, volume normalization, higher confidence threshold (0.65), command accuracy logging for balance tuning.

### Challenge: Visual Clarity
**Solution**: Large distinct sprites, color-coded players (blue/red), clear hit feedback (flash + shake), status indicators always visible.

### Challenge: Two Games Sharing One Backend
**Solution**: `VALID_COMMANDS` is a superset of all game commands. Frontend filters to relevant commands. Same WebSocket, same speaker system, same player assignments. Only the game-specific VoiceInput class differs.

## Success Metrics

### MVP
- Both players can control fighters with voice
- Commands trigger within 500ms
- Punches visibly connect and reduce health
- Winner clearly determined when health reaches 0
- No crashes during 5-minute play session
- Command recognition > 70% accuracy

### Post-MVP
- Command recognition > 85% accuracy
- Average command-to-action latency < 400ms
- Hit detection feels fair and consistent
- Animations smooth and readable
- No dominant strategy (balanced)
- Fun factor: 80% of testers want rematch

### Performance Benchmarks
- 60 FPS during active combat
- Audio capture to backend < 100ms
- Speaker identification < 150ms
- Command parsing (direct match) < 100ms
- Total command latency < 500ms

## Accessibility Goals
- Voice recognition works for diverse accents
- Clear visual feedback for all actions
- Colorblind-friendly UI (use shapes/patterns, not just red/blue)
- Keyboard fallback fully functional
- Tutorial mode explains all mechanics

## Reference Implementation

### Fighter Class (Full)

```javascript
class Fighter {
  constructor(x, y, facing, color) {
    this.position = { x, y };
    this.startPosition = { x, y };

    // Stats
    this.maxHealth = 100;
    this.health = 100;
    this.maxStamina = 100;      // post-MVP
    this.stamina = 100;          // post-MVP

    // State
    this.state = 'idle';         // idle, attacking, blocking, dodging, hurt, KO
    this.facing = facing;        // 'left' or 'right'
    this.isAlive = true;
    this.isInvincible = false;   // during dodge i-frames

    // Combat timing
    this.actionCooldown = 0;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.attackActive = false;
    this.blockTimer = 0;         // auto-release countdown

    // Stats tracking (post-MVP)
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

    this.color = color;
    this.flashTimer = 0;
  }

  update(deltaTime, opponentPosition) {
    this.updateFacing(opponentPosition);

    if (this.actionCooldown > 0) {
      this.actionCooldown -= deltaTime;
    }

    // Auto-release block after 1.5 seconds
    if (this.state === 'blocking') {
      this.blockTimer -= deltaTime;
      if (this.blockTimer <= 0) {
        this.state = 'idle';
      }
    }

    // Update attack timing
    if (this.currentAttack) {
      this.attackTimer += deltaTime;

      // Hitbox active during middle 40% of attack duration
      this.attackActive = (
        this.attackTimer > this.currentAttack.duration * 0.3 &&
        this.attackTimer < this.currentAttack.duration * 0.7
      );

      if (this.attackTimer >= this.currentAttack.duration) {
        this.endAttack();
      }
    }

    // Regenerate stamina (post-MVP)
    if (this.state !== 'blocking' && this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 10 * (deltaTime / 1000));
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= deltaTime;
    }

    if (this.health <= 0 && this.isAlive) {
      this.KO();
    }
  }

  attack(attackType) {
    if (!this.canPerformAction('attack')) return false;

    const attackDef = ATTACKS[attackType];
    if (!attackDef) return false;

    // Cancel block if active
    if (this.state === 'blocking') this.state = 'idle';

    this.stamina -= attackDef.staminaCost;  // post-MVP
    this.state = 'attacking';
    this.currentAttack = { ...attackDef };
    this.attackTimer = 0;
    this.attackActive = false;
    this.actionCooldown = ATTACK_COOLDOWN;
    this.stats.punchesThrown++;
    return true;
  }

  endAttack() {
    this.state = 'idle';
    this.currentAttack = null;
    this.attackActive = false;
    this.attackTimer = 0;
  }

  block() {
    if (!this.canPerformAction('block')) return false;
    this.state = 'blocking';
    this.blockTimer = 1500;  // auto-release after 1.5 seconds
    return true;
  }

  dodge() {
    if (!this.canPerformAction('dodge')) return false;

    // Cancel block if active
    if (this.state === 'blocking') this.state = 'idle';

    this.state = 'dodging';
    this.isInvincible = true;
    this.stamina -= DODGE_STAMINA_COST;  // post-MVP
    this.actionCooldown = DODGE_DURATION;

    setTimeout(() => {
      this.isInvincible = false;
      if (this.state === 'dodging') this.state = 'idle';
    }, DODGE_DURATION);

    this.stats.dodgesSuccessful++;
    return true;
  }

  move(direction) {
    if (!this.canPerformAction('move')) return false;

    // Cancel block if active
    if (this.state === 'blocking') this.state = 'idle';

    const moveDistance = 50;

    if (direction === 'forward') {
      this.position.x += this.facing === 'right' ? moveDistance : -moveDistance;
    } else if (direction === 'back') {
      this.position.x += this.facing === 'right' ? -moveDistance : moveDistance;
    }

    this.position.x = Math.max(50, Math.min(750, this.position.x));
    this.actionCooldown = MOVE_COOLDOWN;
    return true;
  }

  takeDamage(amount, attackType) {
    if (this.isInvincible) return 0;

    let finalDamage = amount;
    if (this.state === 'blocking') {
      finalDamage *= 0.4;  // 60% reduction
      this.stats.blocksSuccessful++;
    }

    this.health = Math.max(0, this.health - finalDamage);
    this.stats.damageTaken += finalDamage;
    this.flashTimer = 100;

    if (this.state !== 'blocking') {
      this.state = 'hurt';
      setTimeout(() => {
        if (this.state === 'hurt') this.state = 'idle';
      }, 200);
    }

    return finalDamage;
  }

  canPerformAction(actionType) {
    if (this.actionCooldown > 0) return false;
    if (!this.isAlive) return false;
    if (this.currentAttack && actionType !== 'block') return false;
    return true;
  }

  updateFacing(opponentPosition) {
    this.facing = opponentPosition.x > this.position.x ? 'right' : 'left';
  }

  KO() {
    this.isAlive = false;
    this.state = 'KO';
    this.health = 0;
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
    this.blockTimer = 0;
    this.flashTimer = 0;
  }

  getHitbox() {
    if (!this.attackActive || !this.currentAttack) return null;
    return {
      x: this.facing === 'right'
        ? this.position.x + 20
        : this.position.x - this.currentAttack.range - 20,
      y: this.position.y - 40,
      width: this.currentAttack.range,
      height: 40
    };
  }

  getHurtbox() {
    return {
      x: this.position.x - 20,
      y: this.position.y - 80,
      width: 40,
      height: 80
    };
  }
}
```

### Game Class (Full)

```javascript
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    this.fighter1 = new Fighter(200, 400, 'right', 'blue');
    this.fighter2 = new Fighter(600, 400, 'left', 'red');

    this.state = 'menu';  // menu, countdown, fighting, paused, roundEnd, matchEnd
    this.isPaused = false;
    this.lastTime = 0;
    this.deltaTime = 0;

    // Round system (post-MVP)
    this.roundTimer = ROUND_DURATION;
    this.currentRound = 1;
    this.maxRounds = 3;
    this.roundWinners = [];
    this.scores = { fighter1: 0, fighter2: 0 };

    // Collision tracking
    this.lastHitBy = { fighter1: null, fighter2: null };
    this.hitTimestamps = { fighter1: [], fighter2: [] };

    this.renderer = new Renderer(this.ctx);
    this.ui = { countdownText: '', roundEndText: '', winnerText: '' };
  }

  start() {
    this.state = 'fighting';
    this.gameLoop(performance.now());
  }

  gameLoop(currentTime) {
    this.deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.update(this.deltaTime);
    this.render();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  update(deltaTime) {
    if (this.state !== 'fighting') return;

    this.fighter1.update(deltaTime, this.fighter2.position);
    this.fighter2.update(deltaTime, this.fighter1.position);
    this.checkCollisions();
    this.enforceDistance();
    this.checkWinConditions();

    // Round timer (post-MVP)
    if (this.roundTimer > 0) {
      this.roundTimer -= deltaTime / 1000;
      if (this.roundTimer <= 0) this.endRound('time');
    }
  }

  checkCollisions() {
    this.checkAttackHit(this.fighter1, this.fighter2, 'fighter2');
    this.checkAttackHit(this.fighter2, this.fighter1, 'fighter1');
  }

  checkAttackHit(attacker, defender, defenderKey) {
    if (!attacker.attackActive) return;

    const hitbox = attacker.getHitbox();
    const hurtbox = defender.getHurtbox();
    if (!hitbox) return;

    if (this.boxesCollide(hitbox, hurtbox)) {
      if (this.lastHitBy[defenderKey] !== attacker.currentAttack) {
        const damage = defender.takeDamage(
          attacker.currentAttack.damage,
          attacker.currentAttack.type
        );
        if (damage > 0) {
          attacker.stats.punchesLanded++;
          attacker.stats.damageDealt += damage;
          this.hitTimestamps[defenderKey].push(performance.now());
          this.lastHitBy[defenderKey] = attacker.currentAttack;
        }
      }
    }
  }

  enforceDistance() {
    const distance = Math.abs(this.fighter1.position.x - this.fighter2.position.x);
    const minDistance = 100;

    if (distance < minDistance) {
      const push = (minDistance - distance) / 2;
      if (this.fighter1.position.x < this.fighter2.position.x) {
        this.fighter1.position.x -= push;
        this.fighter2.position.x += push;
      } else {
        this.fighter1.position.x += push;
        this.fighter2.position.x -= push;
      }
    }
  }

  boxesCollide(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
  }

  checkWinConditions() {
    if (!this.fighter1.isAlive) this.endRound('KO', 'fighter2');
    else if (!this.fighter2.isAlive) this.endRound('KO', 'fighter1');
  }

  endRound(reason, winner) {
    if (this.state !== 'fighting') return;
    this.state = 'roundEnd';

    let roundWinner = winner;
    if (reason === 'time') {
      roundWinner = this.fighter1.health > this.fighter2.health
        ? 'fighter1'
        : this.fighter2.health > this.fighter1.health
          ? 'fighter2'
          : 'draw';
    }

    if (roundWinner === 'fighter1') this.scores.fighter1++;
    else if (roundWinner === 'fighter2') this.scores.fighter2++;

    this.roundWinners.push(roundWinner);

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
    this.fighter1.reset();
    this.fighter2.reset();
    this.lastHitBy = { fighter1: null, fighter2: null };
    this.hitTimestamps = { fighter1: [], fighter2: [] };
    this.startCountdown(() => { this.state = 'fighting'; });
  }

  startCountdown(callback) {
    this.state = 'countdown';
    let count = 3;
    const interval = setInterval(() => {
      this.ui.countdownText = count > 0 ? String(count) : 'FIGHT!';
      count--;
      if (count < 0) {
        clearInterval(interval);
        this.ui.countdownText = '';
        callback();
      }
    }, 1000);
  }

  endMatch() {
    this.state = 'matchEnd';
    if (this.scores.fighter1 > this.scores.fighter2) {
      this.ui.winnerText = 'Fighter 1 Wins!';
    } else if (this.scores.fighter2 > this.scores.fighter1) {
      this.ui.winnerText = 'Fighter 2 Wins!';
    } else {
      this.ui.winnerText = 'Draw!';
    }
  }

  handleCommand(player, command) {
    const fighter = player === 1 ? this.fighter1 : this.fighter2;
    if (this.state !== 'fighting') return;

    switch (command) {
      case 'jab': fighter.attack('jab'); break;
      case 'cross': fighter.attack('cross'); break;
      case 'hook': fighter.attack('hook'); break;
      case 'uppercut': fighter.attack('uppercut'); break;
      case 'block': fighter.block(); break;
      case 'dodge': fighter.dodge(); break;
      case 'forward': fighter.move('forward'); break;
      case 'back': fighter.move('back'); break;
      case 'pause': this.togglePause(); break;
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.state = this.isPaused ? 'paused' : 'fighting';
  }

  render() {
    this.renderer.clear();
    this.renderer.drawRing();
    this.renderer.drawFighter(this.fighter1);
    this.renderer.drawFighter(this.fighter2);
    this.renderer.drawHealthBars(this.fighter1.health, this.fighter2.health);

    if (this.state === 'countdown') {
      this.renderer.drawCenterText(this.ui.countdownText, 72);
    } else if (this.state === 'roundEnd') {
      this.renderer.drawCenterText(`Round ${this.currentRound} Complete!`, 48);
    } else if (this.state === 'matchEnd') {
      this.renderer.drawCenterText(this.ui.winnerText, 64);
    } else if (this.state === 'paused') {
      this.renderer.drawCenterText('PAUSED', 48);
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
}
```
