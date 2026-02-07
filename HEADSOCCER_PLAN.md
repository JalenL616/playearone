# Head Soccer - Code Analysis & Voice Command Integration Plan

## Current State

The head soccer game exists as a complete, playable game with keyboard controls and a **partial** voice command implementation. However, it is **not served by the backend** — there is no route or static file mount in `backend/main.py`, so navigating to `/headsoccer` or `/head-soccer` will 404.

---

## File Inventory

| File | Lines | Purpose |
|---|---|---|
| `headsoccer/index.html` | 66 | Entry point, canvas, player panels with speaker dropdowns, script loader |
| `headsoccer/styles.css` | 125 | Dark theme, player panels (blue P1 / red P2), voice status indicator |
| `headsoccer/js/constants.js` | 53 | All game tuning: canvas 800x500, field boundaries, physics values, powerup timers, colors |
| `headsoccer/js/keybinds.js` | 23 | P1: WASD+E, P2: IJKL+O — left/right/jump/kick/power |
| `headsoccer/js/input.js` | 17 | Simple keydown/keyup tracker into global `keys` object |
| `headsoccer/js/player.js` | 138 | Player class: position, velocity, gravity, jump, kick cooldown, powerup reload timer, facing direction |
| `headsoccer/js/ball.js` | 85 | Ball physics: gravity, bounce damping, friction, goal-zone pass-through, boundary collision |
| `headsoccer/js/powerup.js` | 124 | Three classes: `Powerup` (spawning/bobbing), `FlameShot` (projectile), `GoalCage` (goal blocker) |
| `headsoccer/js/renderer.js` | 478 | Canvas rendering: field, goals with nets, players (huge heads + tiny bodies), ball with glow/shadow/hexagons, score, timer, powerup icons, flame shots, goal cages, screen shake |
| `headsoccer/js/socvoiceinput.js` | 276 | Voice input: WebSocket connection, mic capture, speaker assignment dropdowns, command routing |
| `headsoccer/js/game.js` | 411 | Game loop: state machine (waiting/countdown/playing/paused/goalCelebration/matchEnd), keyboard handling, ball-head collision, goal detection, scoring |

---

## How the Game Works

### Game States
```
waiting → countdown (3-2-1-PLAY!) → playing ↔ paused
                                       ↓
                              goalCelebration → playing (or matchEnd)
                                                        ↓
                                                   matchEnd → waiting
```

### Core Mechanics
- **2 players** with huge circle heads and tiny rectangle bodies
- **Ball** spawns at center top, affected by gravity (lighter than players)
- **Heading**: Circle-to-circle collision between ball and player head — applies force based on player velocity and facing direction
- **Kicking**: Point-based check near player's feet, 300ms cooldown, applies directional force
- **Goals**: Ball passes through left/right field boundaries when vertically aligned with goal zone (goal posts are elevated `GOAL_Y_OFFSET` above ground)
- **Win condition**: First to 5 goals OR highest score when 3-minute timer expires
- **Screen shake** on goals

### Physics
- Player gravity: 1000 px/s², jump force: 550, move speed: 250 px/s
- Ball gravity: 500 px/s² (floats more), bounce damping: 0.88, friction: 0.99
- Kick force: 500, header force: 450

### Powerups (Defined but NOT Wired)
The powerup system has full class definitions (`Powerup`, `FlameShot`, `GoalCage`) and renderer methods (`drawPowerup`, `drawFlameShot`, `drawGoalCage`, `drawPowerupReloadIndicator`), but:
- `game.js` never spawns powerups, never calls powerup update/render, never handles the `'power'` command
- P1 is assigned `'flame'` type, P2 is assigned `'cage'` type
- `Player` tracks `powerupReady` and `powerupReloadTimer` (10s reload) but nothing triggers them
- The `'power'` keybind exists in `keybinds.js` but `handleCommand()` in `game.js` has no `case 'power'`
- Constants reference `POWERUP_LIFETIME` and `POWERUP_SIZE` which are **not defined** in `constants.js`

---

## Voice Command System (Current State)

### What Exists: `socvoiceinput.js`

The `SoccerVoiceInput` class is **fully implemented** for the frontend side:

1. **WebSocket connection** to `ws://host:port/ws` with auto-reconnect
2. **Microphone capture** at 16kHz mono via `ScriptProcessor` (deprecated API, works but should use AudioWorklet like the dance game)
3. **Speaker assignment UI**: Fetches enrolled speakers from `/api/speakers`, populates dropdowns, updates assignments via `/api/player-assignments`
4. **Command mapping**:
   ```
   left → left, right → right
   jump/up → jump
   kick/shoot → kick
   power/special/ability → power
   start/play → start
   pause/stop → pause
   ```
5. **Debouncing**: 100ms per player per command
6. **Confidence threshold**: Rejects commands with confidence < 0.65
7. **Visual feedback**: Shows command text on player panel with 600ms fade

### What's Missing: Backend

**The backend has no idea about soccer-specific commands.** Here's the gap:

#### 1. No Route in `backend/main.py`
The game has no `/headsoccer` (or `/head-soccer`) route and no static file mount. Compare with pong/boxing which have:
```python
@app.get("/pong")    # route
@app.get("/boxing")  # route
app.mount("/pong-static", ...)    # static files
app.mount("/boxing-static", ...)  # static files
```

#### 2. Missing Commands in `backend/config.py`
`VALID_COMMANDS` does not include soccer commands. Currently:
```python
VALID_COMMANDS = [
    "up", "down",                                    # Pong
    "jab", "cross", "hook", "uppercut", "upper",     # Boxing
    "block", "guard", "dodge", "duck",               # Boxing
    "forward", "back", "advance", "retreat", "left", "right",  # Boxing/Shared
    "start", "serve", "resume", "pause", "fight",    # Shared
]
```

Missing soccer commands: **`jump`, `kick`, `shoot`, `power`, `special`, `ability`**

Note: `left`, `right`, `start`, `pause` already exist in the valid commands list and will work. `up` also exists (mapped to `jump` on the frontend).

#### 3. Command Parser Prompt
The LLM prompt in `backend/commands/parser.py` (`_build_system_prompt`) dynamically builds from `VALID_COMMANDS`, so once the commands are added to config, the parser will recognize them automatically. The example at the end of the prompt currently shows:
```
- Input "jump": {"command": null, "confidence": 0.0}
```
This explicitly tells the LLM to reject "jump" — this needs to be removed once jump is a valid command.

#### 4. `index.html` Path Mismatch
The HTML checks `location.pathname === '/head-soccer'` for base path resolution, but the frontend link at `frontend/index.html` links to `/headsoccer`. These need to match.

---

## What Needs to Be Done

### Phase 1: Backend Route & Static Files (Required)

**`backend/main.py`** — Add route and static mount:
```python
# Serve Head Soccer game
headsoccer_path = os.path.join(os.path.dirname(__file__), "..", "headsoccer")

@app.get("/headsoccer")
async def headsoccer():
    index_path = os.path.join(headsoccer_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Head Soccer not found"}

# Add to static mounts (BEFORE the catch-all "/" mount):
app.mount("/headsoccer-static", StaticFiles(directory=headsoccer_path), name="headsoccer")
```

**`headsoccer/index.html`** — Fix path check to match route:
```javascript
if (location.pathname === '/headsoccer') {
    window.__basePath = '/headsoccer-static/';
}
```

### Phase 2: Add Soccer Commands to Backend (Required)

**`backend/config.py`** — Add missing commands:
```python
VALID_COMMANDS = [
    # Pong
    "up", "down",
    # Boxing
    "jab", "cross", "hook", "uppercut", "upper",
    "block", "guard", "dodge", "duck",
    "forward", "back", "advance", "retreat", "left", "right",
    # Soccer
    "jump", "kick", "shoot", "power",
    # Shared
    "start", "serve", "resume", "pause", "fight",
]
```

**`backend/commands/parser.py`** — Remove the example that explicitly rejects "jump":
```
- Input "jump": {"command": null, "confidence": 0.0}  ← DELETE THIS LINE
```

### Phase 3: Upgrade Audio Capture (Recommended)

**`headsoccer/js/socvoiceinput.js`** — The voice input uses the deprecated `ScriptProcessor` API. The dance game already uses `AudioWorklet` (`dance/audio-capture.js` + `dance/audio-processor-worklet.js`). The soccer voice input should be upgraded similarly or share the same audio capture module. This isn't strictly required (ScriptProcessor still works) but is best practice for performance and future-proofing.

### Phase 4: Wire Up Powerups (Optional, Gameplay)

The powerup system is fully coded but never connected. To enable it:

1. **`constants.js`** — Add missing constants:
   ```javascript
   const POWERUP_SIZE = 20;
   const POWERUP_LIFETIME = 8000;  // 8 seconds before despawning
   const COLOR_FLAME = '#FF6600';
   const COLOR_CAGE = '#FFD700';
   ```

2. **`game.js`** — Add powerup state and logic:
   - Track active powerups, flame shots, and goal cages in the game state
   - Handle `'power'` command in `handleCommand()` to fire flame shot or deploy goal cage
   - Spawn powerups periodically during play
   - Check flame shot → goal and flame shot → player block collisions
   - Check goal cage blocking ball entry
   - Render all powerup objects each frame

---

## Architecture Comparison with Working Games

| Aspect | Pong/Boxing (Working) | Head Soccer (Current) |
|---|---|---|
| Backend route | `/pong`, `/boxing` in main.py | Missing |
| Static mount | `/pong-static`, `/boxing-static` | Missing |
| Commands in config | All pong/boxing commands listed | `jump`, `kick`, `shoot`, `power` missing |
| Voice input class | Game-specific voice input JS | `SoccerVoiceInput` exists, fully implemented |
| Audio capture | Varies | Uses deprecated `ScriptProcessor` |
| WebSocket protocol | Shared `/ws` endpoint | Uses same shared `/ws` endpoint |
| Speaker assignment | Shared `/api/config` + `/api/player-assignments` | Uses same shared APIs |

---

## Summary

The head soccer game is **fully playable with keyboard** and has a **complete frontend voice input implementation**. The only blockers for voice commands working are:

1. **No backend route** — the game can't be served (highest priority)
2. **Missing commands in config** — `jump`, `kick`, `shoot`, `power` not in `VALID_COMMANDS`
3. **Parser anti-pattern** — the LLM prompt explicitly rejects "jump" as invalid

All three are small config/routing changes. No new voice processing logic is needed — the existing pipeline (mic → WebSocket → Deepgram transcription → LLM command extraction → speaker identification → WebSocket response) works identically for all games. The frontend `SoccerVoiceInput` class already handles command routing, debouncing, and UI feedback correctly.
