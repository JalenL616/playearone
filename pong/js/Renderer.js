const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

function clearCanvas() {
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawRect(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function drawCircle(x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawText(text, x, y, font, color, align) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align || 'center';
  ctx.fillText(text, x, y);
}

function drawCenterLine() {
  ctx.strokeStyle = COLOR_WHITE;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGameStateText(gameState, winner) {
  if (gameState === 'waiting') {
    drawText('Press SPACE to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, '24px monospace', COLOR_WHITE, 'center');
  } else if (gameState === 'paused') {
    drawText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20, '36px monospace', COLOR_WHITE, 'center');
    drawText('Press SPACE to Resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20, '18px monospace', COLOR_WHITE, 'center');
  } else if (gameState === 'serving') {
    drawText('Press SPACE to serve', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40, '18px monospace', COLOR_WHITE, 'center');
  } else if (gameState === 'gameover') {
    drawText(winner + ' Wins!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20, '36px monospace', COLOR_WHITE, 'center');
    drawText('Press SPACE to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20, '18px monospace', COLOR_WHITE, 'center');
  }
}

function render(ball, paddle1, paddle2, score1, score2, gameState, winner) {
  clearCanvas();
  drawCenterLine();
  drawRect(paddle1.x, paddle1.y, paddle1.width, paddle1.height, COLOR_WHITE);
  drawRect(paddle2.x, paddle2.y, paddle2.width, paddle2.height, COLOR_WHITE);
  drawCircle(ball.x, ball.y, ball.radius, COLOR_WHITE);
  drawText(score1.toString(), CANVAS_WIDTH / 4, 60, '48px monospace', COLOR_WHITE, 'center');
  drawText(score2.toString(), (CANVAS_WIDTH * 3) / 4, 60, '48px monospace', COLOR_WHITE, 'center');
  drawGameStateText(gameState, winner);
}
