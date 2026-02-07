# Pong

A classic Pong game built with vanilla JavaScript and HTML5 Canvas.

## How to Play

Open `index.html` in any modern browser.

## Controls

| Action | Player 1 (Left) | Player 2 (Right) |
|--------|-----------------|-------------------|
| Move Up | W | Arrow Up |
| Move Down | S | Arrow Down |

- **Space** — Start / Pause / Resume / Restart

## Rules

- First player to reach **10 points** wins.
- Ball speed increases with each paddle hit (caps at 2x).

## Project Structure

```
pong/
├── index.html
├── styles.css
├── README.md
└── js/
    ├── constants.js
    ├── Ball.js
    ├── Paddle.js
    ├── Input.js
    ├── Renderer.js
    └── Game.js
```
