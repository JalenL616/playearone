# Pong Architecture

This is a purely frontend application — there is no backend. All game logic runs client-side in the browser using vanilla JavaScript and HTML5 Canvas.

## File Overview

### index.html
Entry point. Sets up the HTML document with a single `<canvas>` element and loads all JavaScript files via `<script>` tags in dependency order:
`constants.js` → `Ball.js` → `Paddle.js` → `Input.js` → `Renderer.js` → `Game.js`

### styles.css
Minimal styling. Resets margins, centers the canvas in the viewport using flexbox, sets a dark background (`#1a1a1a`), and adds a subtle border to the canvas.

---

## JavaScript Files (`js/`)

### constants.js
Defines all global configuration values used across the app:
- **Canvas size**: 800x600
- **Paddle properties**: width, height, max speed
- **Ball properties**: size, base speed
- **Game rules**: winning score (10)
- **Colors**: white, black, plus player-specific and ball speed-indicator colors (blue, orange/red, yellow, red)

### Ball.js
`Ball` class — manages the ball's position and movement.
- `update()` — Moves the ball by `dx`/`dy` multiplied by `speedMultiplier`. Caps velocity at a max of 15 to prevent tunneling through paddles.
- `reverseX()` / `reverseY()` — Flips direction on paddle/wall collisions. `reverseY` also prevents perfectly horizontal trajectories.
- `increaseDifficulty()` — Bumps `speedMultiplier` by 0.15 per paddle hit (caps at 2.5x).
- `reset()` — Centers the ball and randomizes direction. Accepts an optional `serveDirection` parameter (`'left'`/`'right'`) to aim the serve toward the player who was scored on.

### Paddle.js
`Paddle` class — manages paddle position with acceleration-based movement.
- Tracks `velocity`, `acceleration` (1.2), and `friction` (0.8).
- `update()` — Accelerates toward max speed while a key is held, decelerates via friction when released. Clamps position to canvas bounds and zeroes velocity on wall contact.

### Input.js
Keyboard input handler.
- `keys` object — Global map of key states (`true`/`false`).
- `initInput()` — Registers `keydown`/`keyup` listeners. Prevents default browser behavior for arrow keys and spacebar to stop page scrolling.

### Renderer.js
All drawing logic using the Canvas 2D API.
- Initializes the canvas element and 2D context at load time.
- **Drawing primitives**: `clearCanvas()`, `drawRect()`, `drawCircle()`, `drawText()`, `drawCenterLine()` (dashed).
- `drawGameStateText()` — Renders overlay text based on game state: "Press SPACE to Start", "PAUSED", "Press SPACE to serve", or "Player X Wins!".
- `render()` — Main draw function called each frame. Clears the screen, draws the center line, both paddles, the ball, both scores, and any state text.

### Game.js
`Game` class — orchestrates everything.
- **Constructor** — Creates the ball and two paddles (Player 1: W/S, Player 2: ArrowUp/ArrowDown), initializes input, sets initial state to `'waiting'`.
- **Game states**: `waiting` → `playing` ↔ `paused`, `playing` → `serving` → `playing`, `playing` → `gameover` → `waiting`.
- `handleInput()` — Space key controls state transitions (start, pause, serve, restart). Uses a `keyHandled` flag to debounce.
- `checkCollisions()` — Detects ball-wall (top/bottom bounce) and ball-paddle collisions. Corrects ball position on hit to prevent sticking, then increases difficulty.
- `handleScoring()` — Detects when ball exits left/right edges. Increments the opponent's score, checks for win condition (first to 10), or enters serve state.
- `enterServeState()` — Freezes ball at center with zero velocity. Paddles can still move during this state.
- `update()` — Runs input handling, then (if playing) updates paddles, ball, collisions, and scoring.
- `reset()` — Resets scores, ball, and paddle positions back to initial state.
- `gameLoop()` — Calls `update()` and `render()` every frame via `requestAnimationFrame`.
- Auto-starts on `DOMContentLoaded`.

## Data Flow

```
Input (keyboard) → Game.update()
                      ├── handleInput()     → state transitions
                      ├── Paddle.update()   → paddle movement
                      ├── Ball.update()     → ball movement
                      ├── checkCollisions() → physics responses
                      └── handleScoring()   → score / state changes
                    Game.render()
                      └── Renderer draws everything to canvas
```
