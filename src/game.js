export const GAME_STATE = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  OVER: 'over',
  WON: 'won',
});

export class SnakeGame {
  constructor({ cols = 20, rows = 20, rng = Math.random, initialLength = 3 } = {}) {
    if (!Number.isInteger(cols) || cols < 4) throw new Error('cols must be an integer >= 4');
    if (!Number.isInteger(rows) || rows < 4) throw new Error('rows must be an integer >= 4');
    if (typeof rng !== 'function') throw new Error('rng must be a function');
    this.cols = cols;
    this.rows = rows;
    this.rng = rng;
    const requestedLength = Number.isInteger(initialLength) ? initialLength : 3;
    const maxLength = Math.floor(cols / 2) + 1;
    this.initialLength = Math.max(3, Math.min(requestedLength, maxLength));
    this.reset();
  }

  reset() {
    const centerX = Math.floor(this.cols / 2);
    const centerY = Math.floor(this.rows / 2);
    this.snake = [];
    for (let i = 0; i < this.initialLength; i += 1) {
      this.snake.push({ x: centerX - i, y: centerY });
    }
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.score = 0;
    this.state = GAME_STATE.READY;
    this.tickMs = 140;
    this.food = this.randomFreeCell();
    this.lastEvent = 'reset';
    return this.snapshot();
  }

  start() {
    if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.RUNNING;
      this.lastEvent = 'resume';
    } else if (this.state !== GAME_STATE.RUNNING) {
      this.reset();
      this.state = GAME_STATE.RUNNING;
      this.lastEvent = 'start';
    }
    return this.snapshot();
  }

  togglePause() {
    if (this.state === GAME_STATE.RUNNING) {
      this.state = GAME_STATE.PAUSED;
      this.lastEvent = 'pause';
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.RUNNING;
      this.lastEvent = 'resume';
    }
    return this.snapshot();
  }

  turn(dx, dy) {
    if (this.state !== GAME_STATE.RUNNING) return false;
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const isReverse = dx === -this.direction.x && dy === -this.direction.y;
    const isSame = dx === this.direction.x && dy === this.direction.y;
    if (isReverse || isSame) return false;
    this.nextDirection = { x: dx, y: dy };
    return true;
  }

  step() {
    if (this.state !== GAME_STATE.RUNNING) return this.snapshot();

    this.direction = { ...this.nextDirection };
    const head = {
      x: this.snake[0].x + this.direction.x,
      y: this.snake[0].y + this.direction.y,
    };

    if (this.isOutside(head)) {
      this.state = GAME_STATE.OVER;
      this.lastEvent = 'wall';
      return this.snapshot();
    }

    const ate = Boolean(this.food) && head.x === this.food.x && head.y === this.food.y;
    const bodyToCheck = ate ? this.snake : this.snake.slice(0, -1);
    if (bodyToCheck.some((segment) => segment.x === head.x && segment.y === head.y)) {
      this.state = GAME_STATE.OVER;
      this.lastEvent = 'self';
      return this.snapshot();
    }

    this.snake.unshift(head);
    if (ate) {
      this.score += 10;
      this.tickMs = Math.max(70, 140 - Math.floor(this.score / 50) * 10);
      this.food = this.randomFreeCell();
      this.lastEvent = 'eat';
      if (!this.food) {
        this.state = GAME_STATE.WON;
        this.lastEvent = 'win';
      }
    } else {
      this.snake.pop();
      this.lastEvent = 'move';
    }
    return this.snapshot();
  }

  isOutside({ x, y }) {
    return x < 0 || y < 0 || x >= this.cols || y >= this.rows;
  }

  randomFreeCell() {
    const occupied = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
    const free = [];
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    const raw = Number(this.rng());
    const normalized = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999999) : 0;
    return free[Math.floor(normalized * free.length)];
  }

  snapshot() {
    return {
      state: this.state,
      score: this.score,
      tickMs: this.tickMs,
      snake: this.snake.map((segment) => ({ ...segment })),
      food: this.food ? { ...this.food } : null,
      direction: { ...this.direction },
      lastEvent: this.lastEvent,
    };
  }
}
