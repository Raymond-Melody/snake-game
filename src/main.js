import { SnakeGame, GAME_STATE } from './game.js';

const CELL_COUNT = 20;
const HIGH_SCORE_KEY = 'snake.highScore';
const COLORS = {
  board: '#0b1322',
  grid: 'rgba(143, 163, 192, 0.075)',
  body: '#a3e635',
  bodyAlt: '#84cc16',
  head: '#d9f99d',
  food: '#22d3ee',
  eye: '#0b1322',
  leaf: '#67e8f9',
};

const STATE_LABELS = {
  [GAME_STATE.READY]: '准备',
  [GAME_STATE.RUNNING]: '进行中',
  [GAME_STATE.PAUSED]: '已暂停',
  [GAME_STATE.OVER]: '游戏结束',
  [GAME_STATE.WON]: '你赢了',
};

const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const highScoreEl = document.querySelector('#high-score');
const stateEl = document.querySelector('#game-state');
const overlay = document.querySelector('#overlay');
const overlayKicker = document.querySelector('#overlay-kicker');
const overlayTitle = document.querySelector('#overlay-title');
const overlayText = document.querySelector('#overlay-text');
const overlayAction = document.querySelector('#overlay-action');
const pauseButton = document.querySelector('#pause-button');
const restartButton = document.querySelector('#restart-button');
const dpadButtons = document.querySelectorAll('[data-direction]');
const liveStatus = document.querySelector('#live-status');

const game = new SnakeGame({ cols: CELL_COUNT, rows: CELL_COUNT });
const cell = canvas.width / game.cols;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let highScore = readHighScore();
let timerId = null;
let swipeStart = null;
let lastAnnouncement = '';

function readHighScore() {
  try {
    const stored = Number.parseInt(window.localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function saveHighScore() {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  } catch {
    // localStorage can be unavailable in private/file contexts; the game still works.
  }
}

function formatScore(value) {
  return String(value).padStart(3, '0');
}

function roundedRect(x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, safeRadius);
    return;
  }
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawGrid() {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 0; index <= game.cols; index += 1) {
    const position = index * cell + 0.5;
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
  }
  ctx.stroke();
}

function drawFood() {
  if (!game.food) return;
  const centerX = (game.food.x + 0.5) * cell;
  const centerY = (game.food.y + 0.5) * cell;
  const pulse = reduceMotion ? 1 : 1 + Math.sin(performance.now() / 320) * 0.06;
  ctx.save();
  ctx.shadowColor = COLORS.food;
  ctx.shadowBlur = 20;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(centerX, centerY, cell * 0.28 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = COLORS.leaf;
  ctx.beginPath();
  ctx.ellipse(centerX + cell * 0.18, centerY - cell * 0.22, cell * 0.13, cell * 0.07, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeadEyes(head) {
  const centerX = (head.x + 0.5) * cell;
  const centerY = (head.y + 0.5) * cell;
  const offset = cell * 0.16;
  const eyeRadius = cell * 0.07;
  let eyes;

  if (game.direction.x === 1) {
    eyes = [[centerX + offset, centerY - offset], [centerX + offset, centerY + offset]];
  } else if (game.direction.x === -1) {
    eyes = [[centerX - offset, centerY - offset], [centerX - offset, centerY + offset]];
  } else if (game.direction.y === -1) {
    eyes = [[centerX - offset, centerY - offset], [centerX + offset, centerY - offset]];
  } else {
    eyes = [[centerX - offset, centerY + offset], [centerX + offset, centerY + offset]];
  }

  ctx.fillStyle = COLORS.eye;
  for (const [x, y] of eyes) {
    ctx.beginPath();
    ctx.arc(x, y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSnake() {
  for (let index = game.snake.length - 1; index >= 0; index -= 1) {
    const segment = game.snake[index];
    const padding = 2.5;
    const x = segment.x * cell + padding;
    const y = segment.y * cell + padding;
    const size = cell - padding * 2;
    const isHead = index === 0;
    ctx.save();
    if (isHead) {
      ctx.shadowColor = COLORS.body;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = isHead ? COLORS.head : index % 2 === 0 ? COLORS.body : COLORS.bodyAlt;
    roundedRect(x, y, size, size, isHead ? 9 : 7);
    ctx.fill();
    ctx.restore();
    if (isHead) drawHeadEyes(segment);
  }
}

function updateOverlay() {
  const state = game.state;
  overlay.hidden = state === GAME_STATE.RUNNING;

  if (state === GAME_STATE.READY) {
    overlayKicker.textContent = 'INSERT COIN';
    overlayTitle.textContent = '贪食蛇';
    overlayText.textContent = '方向键 / WASD 移动 · 空格暂停';
    overlayAction.textContent = '开始游戏';
  } else if (state === GAME_STATE.PAUSED) {
    overlayKicker.textContent = 'PAUSED';
    overlayTitle.textContent = '已暂停';
    overlayText.textContent = '按空格或点击继续';
    overlayAction.textContent = '继续';
  } else if (state === GAME_STATE.OVER) {
    overlayKicker.textContent = 'GAME OVER';
    overlayTitle.textContent = '游戏结束';
    overlayText.textContent = `本局得分 ${game.score} · 最高分 ${highScore}`;
    overlayAction.textContent = '再来一局';
  } else if (state === GAME_STATE.WON) {
    overlayKicker.textContent = 'YOU WIN';
    overlayTitle.textContent = '你赢了';
    overlayText.textContent = '棋盘已经填满，真正的贪食蛇大师。';
    overlayAction.textContent = '再来一局';
  }
}

function render() {
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  drawSnake();

  scoreEl.textContent = formatScore(game.score);
  highScoreEl.textContent = formatScore(highScore);
  stateEl.textContent = STATE_LABELS[game.state] ?? game.state;
  pauseButton.disabled = game.state !== GAME_STATE.RUNNING && game.state !== GAME_STATE.PAUSED;
  pauseButton.textContent = game.state === GAME_STATE.PAUSED ? '继续' : '暂停';
  const announcement = `状态：${STATE_LABELS[game.state] ?? game.state}，得分 ${game.score}，最高分 ${highScore}`;
  if (announcement !== lastAnnouncement) {
    liveStatus.textContent = announcement;
    lastAnnouncement = announcement;
  }
  updateOverlay();
}

function clearTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function syncTimer() {
  clearTimer();
  if (game.state === GAME_STATE.RUNNING) {
    timerId = window.setInterval(tick, game.tickMs);
  }
}

function recordHighScore() {
  if (game.score > highScore) {
    highScore = game.score;
    saveHighScore();
  }
}

function tick() {
  const previousTick = game.tickMs;
  game.step();
  recordHighScore();
  render();
  if (game.tickMs !== previousTick || game.state !== GAME_STATE.RUNNING) syncTimer();
}

function focusCanvas() {
  try {
    canvas.focus({ preventScroll: true });
  } catch {
    canvas.focus();
  }
}

function startNewGame() {
  game.start();
  render();
  syncTimer();
  focusCanvas();
}

function restartGame() {
  game.reset();
  game.start();
  render();
  syncTimer();
  focusCanvas();
}

function togglePause() {
  if (game.state !== GAME_STATE.RUNNING && game.state !== GAME_STATE.PAUSED) return;
  game.togglePause();
  render();
  syncTimer();
}

function handleDirection(direction) {
  const vectors = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  const vector = vectors[direction];
  if (!vector) return;

  if (game.state === GAME_STATE.READY) startNewGame();
  if (game.state === GAME_STATE.RUNNING) game.turn(vector[0], vector[1]);
  render();
}

overlayAction.addEventListener('click', () => {
  if (game.state === GAME_STATE.PAUSED) {
    togglePause();
  } else {
    startNewGame();
  }
});

pauseButton.addEventListener('click', () => {
  togglePause();
  focusCanvas();
});

restartButton.addEventListener('click', () => {
  restartGame();
});

for (const button of dpadButtons) {
  button.addEventListener('click', () => {
    handleDirection(button.dataset.direction);
    focusCanvas();
  });
}

const keyDirections = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const target = event.target;
  const isFormControl =
    target instanceof HTMLElement && ['button', 'a', 'input', 'textarea', 'select'].includes(target.tagName.toLowerCase());

  if (keyDirections[key]) {
    event.preventDefault();
    handleDirection(keyDirections[key]);
    return;
  }

  if (event.code === 'Space' || key === ' ') {
    if (isFormControl) return;
    event.preventDefault();
    if (game.state === GAME_STATE.RUNNING || game.state === GAME_STATE.PAUSED) {
      togglePause();
    } else {
      startNewGame();
    }
    return;
  }

  if (key === 'enter' && !isFormControl) {
    if (game.state === GAME_STATE.OVER || game.state === GAME_STATE.WON) restartGame();
  }
});

canvas.addEventListener('pointerdown', (event) => {
  swipeStart = { x: event.clientX, y: event.clientY };
  if (typeof canvas.setPointerCapture === 'function') {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on older engines.
    }
  }
});

canvas.addEventListener('pointerup', (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    handleDirection(dx > 0 ? 'right' : 'left');
  } else {
    handleDirection(dy > 0 ? 'down' : 'up');
  }
});

canvas.addEventListener('pointercancel', () => {
  swipeStart = null;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === GAME_STATE.RUNNING) {
    game.togglePause();
    render();
    syncTimer();
  }
});

render();

if (new URLSearchParams(window.location.search).has('e2e')) {
  window.__snakeGame = {
    game,
    snapshot: () => game.snapshot(),
    start: startNewGame,
    restart: restartGame,
    pause: togglePause,
    turn: (dx, dy) => {
      const accepted = game.turn(dx, dy);
      render();
      return accepted;
    },
    render,
    getHighScore: () => highScore,
  };
}
