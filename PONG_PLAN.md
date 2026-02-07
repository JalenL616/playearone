# Pong Game Development Plan

## Phase 1: Project Setup

### Step 1: Initialize Project Structure
- Create root `pong/` directory
- Create `js/` subdirectory
- Create empty files: `index.html`, `styles.css`
- Create empty JS files: `constants.js`, `Ball.js`, `Paddle.js`, `Input.js`, `Renderer.js`, `Game.js`

### Step 2: Set Up HTML Scaffold
- Add DOCTYPE, html, head, and body tags
- Link `styles.css` in head
- Create `<canvas id="gameCanvas"></canvas>` in body
- Add script tags for all JS files in correct order (constants → Ball → Paddle → Input → Renderer → Game)
- Set script tags to `type="module"` if using ES6 modules, or omit for global scope

### Step 3: Basic Styling
- Write CSS to center canvas (flexbox on body)
- Set body margin to 0, background color to dark gray or black
- Add canvas border for visibility during development

---

## Phase 2: Core Constants and Utilities

### Step 4: Define Constants
- Canvas dimensions: `CANVAS_WIDTH = 800`, `CANVAS_HEIGHT = 600`
- Paddle properties: `PADDLE_WIDTH = 10`, `PADDLE_HEIGHT = 100`, `PADDLE_SPEED = 5`
- Ball properties: `BALL_SIZE = 10`, `BALL_SPEED = 5`
- Game properties: `WINNING_SCORE = 10`
- Color constants: `COLOR_WHITE = '#FFFFFF'`, `COLOR_BLACK = '#000000'`
- Export all constants

### Step 5: Initialize Canvas Context
- In `Renderer.js`, get canvas element by id
- Get 2D rendering context
- Set canvas width and height from constants
- Store context in module variable
- Export context or init function

---

## Phase 3: Game Objects

### Step 6: Implement Ball Class
- Constructor takes initial x, y, radius, initial speed
- Add properties: `this.x`, `this.y`, `this.radius`, `this.dx`, `this.dy`
- Write `update()` method: increment x by dx, y by dy
- Write `reverseX()` method: negate dx
- Write `reverseY()` method: negate dy
- Write `reset(canvasWidth, canvasHeight)` method: center ball, randomize direction using `Math.random()`
- Export class

### Step 7: Implement Paddle Class
- Constructor takes x, y, width, height, speed, and control keys
- Add properties: `this.x`, `this.y`, `this.width`, `this.height`, `this.speed`
- Store control keys: `this.upKey`, `this.downKey`
- Write `update(keys, canvasHeight)` method:
  - Check if upKey is pressed, move up
  - Check if downKey is pressed, move down
  - Clamp y position between 0 and `canvasHeight - height`
- Export class

---

## Phase 4: Input System

### Step 8: Create Input Handler
- Create `keys` object to store key states (empty object)
- Write `initInput()` function:
  - Add `keydown` event listener on window
  - Set `keys[event.key]` to `true`
  - Add `keyup` event listener on window
  - Set `keys[event.key]` to `false`
- Export `keys` object and `initInput` function

---

## Phase 5: Rendering System

### Step 9: Implement Drawing Functions
- Write `clearCanvas(width, height)`: fill canvas with background color
- Write `drawRect(x, y, width, height, color)`: use `fillRect`
- Write `drawCircle(x, y, radius, color)`: use `arc` and `fill`
- Write `drawText(text, x, y, font, color)`: set font, `fillText` centered or aligned
- Write `drawCenterLine(width, height)`: draw dashed line down middle (optional visual)
- Export all functions

### Step 10: Create Main Render Function
- Write `render(ball, paddle1, paddle2, score1, score2)` function:
  - Call `clearCanvas`
  - Call `drawCenterLine` (optional)
  - Call `drawRect` for paddle1
  - Call `drawRect` for paddle2
  - Call `drawCircle` for ball
  - Call `drawText` for score1 (left side, top)
  - Call `drawText` for score2 (right side, top)
- Export render function

---

## Phase 6: Core Game Logic

### Step 11: Create Game Class Structure
- Constructor:
  - Get canvas width and height from constants
  - Initialize `score1 = 0`, `score2 = 0`
  - Create ball instance at center
  - Create leftPaddle instance (x near left edge, keys `'w'` and `'s'`)
  - Create rightPaddle instance (x near right edge, keys `'ArrowUp'` and `'ArrowDown'`)
  - Initialize Input system
  - Set `gameRunning` flag to `false`
  - Store bound `gameLoop` function
- Write empty methods: `start()`, `update()`, `checkCollisions()`, `handleScoring()`, `gameLoop()`

### Step 12: Implement Ball-Wall Collisions
- In `checkCollisions()` method:
  - Check if `ball.y - ball.radius <= 0` (top wall): call `ball.reverseY()`
  - Check if `ball.y + ball.radius >= canvasHeight` (bottom wall): call `ball.reverseY()`

### Step 13: Implement Ball-Paddle Collisions
- Continue in `checkCollisions()` method:
  - Check ball collision with leftPaddle:
    - Ball's left edge touches paddle's right edge
    - Ball's y overlaps with paddle's y range
    - If true: call `ball.reverseX()`, move ball just outside paddle to prevent sticking
  - Check ball collision with rightPaddle:
    - Ball's right edge touches paddle's left edge
    - Ball's y overlaps with paddle's y range
    - If true: call `ball.reverseX()`, move ball just outside paddle

### Step 14: Implement Scoring System
- In `handleScoring()` method:
  - Check if `ball.x - ball.radius < 0` (left side goal):
    - Increment `score2`
    - Call `ball.reset()`
    - Return `true` if scored
  - Check if `ball.x + ball.radius > canvasWidth` (right side goal):
    - Increment `score1`
    - Call `ball.reset()`
    - Return `true` if scored
  - Return `false` if no score

### Step 15: Implement Update Method
- In `update()` method:
  - Call `leftPaddle.update(keys, canvasHeight)`
  - Call `rightPaddle.update(keys, canvasHeight)`
  - Call `ball.update()`
  - Call `checkCollisions()`
  - Call `handleScoring()`

### Step 16: Implement Game Loop
- In `gameLoop()` method:
  - Check if `gameRunning` is `true`, otherwise return
  - Call `update()`
  - Call `render()` with ball, paddles, and scores
  - Call `requestAnimationFrame(this.gameLoop.bind(this))`

### Step 17: Implement Start Method
- In `start()` method:
  - Set `gameRunning` to `true`
  - Call `gameLoop()`

---

## Phase 7: Main Entry Point

### Step 18: Initialize and Start Game
- In `index.html`, add inline script or new `main.js` file:
  - Wait for `DOMContentLoaded` event
  - Create new `Game` instance
  - Call `game.start()`

### Step 19: Test Core Functionality
- Open `index.html` in browser
- Test paddle movement with W/S and Arrow keys
- Verify ball bounces off walls
- Verify ball bounces off paddles
- Verify scoring when ball passes edges
- Check score display updates correctly
- Debug any collision detection issues

---

## Phase 8: Optional Enhancement — Ball Speed Increase

### Step 20: Implement Progressive Difficulty
- In Ball class, add `this.speedMultiplier = 1`
- Add `increaseDifficulty()` method:
  - Increment `speedMultiplier` by `0.1`
  - Cap at maximum (e.g., `2.0`)
- In `update()` method, multiply `dx` and `dy` by `speedMultiplier`
- In Game class `checkCollisions()`, call `ball.increaseDifficulty()` after successful paddle hit
- In Ball `reset()` method, reset `speedMultiplier` to `1`

---

## Phase 9: Optional Enhancement — Game States

### Step 21: Add Start/Pause State
- In Game class constructor, add `this.gameState = 'waiting'` (states: `'waiting'`, `'playing'`, `'paused'`, `'gameover'`)
- Update `gameLoop()` to only update if `gameState` is `'playing'`
- Always render regardless of state
- Add `drawGameStateText()` in Renderer for state messages

### Step 22: Implement Space to Start
- In Input handler, listen for Space key specifically
- In Game class, add `handleInput()` method:
  - If `gameState` is `'waiting'` and Space pressed: set `gameState` to `'playing'`, reset ball
  - If `gameState` is `'playing'` and Space pressed: set `gameState` to `'paused'`
  - If `gameState` is `'paused'` and Space pressed: set `gameState` to `'playing'`
- Call `handleInput()` in update method
- Display "Press SPACE to Start" when waiting
- Display "PAUSED" when paused

---

## Phase 10: Optional Enhancement — Win Condition

### Step 23: Implement Game Over State
- In `handleScoring()` method:
  - After incrementing score, check if `score1 >= WINNING_SCORE` or `score2 >= WINNING_SCORE`
  - If true: set `gameState` to `'gameover'`, store winner
- In Renderer, add logic to display "Player X Wins!" message
- Display "Press SPACE to Restart" when game over

### Step 24: Implement Reset Functionality
- Add `reset()` method to Game class:
  - Set `score1` and `score2` to `0`
  - Reset ball position
  - Reset ball speed multiplier
  - Set `gameState` to `'waiting'`
- In `handleInput()`, add Space press handler for `'gameover'` state to call `reset()`

---

## Phase 11: Polish and Refinement

### Step 25: Add Visual Polish
- In Renderer, add slight padding to scores from edge
- Use monospace font for scores
- Add center dashed line visual
- Consider slightly rounded paddles or ball (`fillRect` vs `arc`)
- Ensure consistent color scheme

### Step 26: Add Sound Markers (Comments)
- Add comment markers where sound effects would go:
  - Paddle hit sound location
  - Wall bounce sound location
  - Score sound location
  - (Actual sound implementation optional for bare bones)

### Step 27: Code Cleanup
- Remove `console.log` statements used for debugging
- Add brief comments to complex collision logic
- Ensure consistent naming conventions
- Verify all constants are used from `constants.js`
- Check for magic numbers and replace with constants

### Step 28: Cross-Browser Testing
- Test in Chrome
- Test in Firefox
- Test in Safari (if available)
- Test in Edge
- Verify keyboard controls work in all browsers
- Check canvas rendering consistency

---

## Phase 12: Documentation

### Step 29: Add README
- Create `README.md` file
- Document how to run (open `index.html`)
- List controls (W/S for left paddle, Arrows for right, Space for start/pause)
- Note winning score
- List any known issues or limitations

### Step 30: Code Comments
- Add JSDoc-style comments to each class constructor
- Document method parameters and return values
- Add file header comments explaining purpose
- Keep comments concise for bare bones approach

---

## Phase 13: Final Testing and Deployment

### Step 31: Complete Playthrough Testing
- Play full game to 10 points
- Test pause/resume functionality
- Verify restart works correctly
- Test edge cases (ball hitting corner, rapid paddle movements)
- Ensure no score overflow or display issues

### Step 32: Performance Check
- Open browser dev tools
- Check frame rate stays at 60fps
- Verify no memory leaks during extended play
- Check CPU usage is reasonable

### Step 33: Deploy (Optional)
- Push to GitHub repository
- Enable GitHub Pages if desired
- Or simply keep as local files
- Share link or files with others for testing

---

## Estimated Time

| Phase | Duration |
|-------|----------|
| Phase 1–2: Project Setup & Constants | 15–20 minutes |
| Phase 3–6: Game Objects & Core Logic | 45–60 minutes |
| Phase 7: Main Entry Point & Testing | 10 minutes |
| Phase 8–10: Optional Enhancements | 30–40 minutes |
| Phase 11–13: Polish, Docs & Final Testing | 20–30 minutes |
| **Total** | **2–3 hours for complete implementation with all optional features** |
