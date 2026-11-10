import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, GAME_STATE } from '../src/game.js';

function makeGame(overrides = {}) {
  return new SnakeGame({ cols: 10, rows: 10, rng: () => 0, ...overrides });
}

function foodAhead(game) {
  const head = game.snake[0];
  game.food = { x: head.x + 1, y: head.y };
}

test('initial state is ready with a valid snake and food', () => {
  const game = makeGame();
  assert.equal(game.state, GAME_STATE.READY);
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
  assert.ok(game.food);
  assert.equal(game.snake.some((s) => s.x === game.food.x && s.y === game.food.y), false);
});

test('start moves the snake one cell to the right', () => {
  const game = makeGame();
  game.start();
  const before = game.snake[0];
  game.step();
  assert.equal(game.state, GAME_STATE.RUNNING);
  assert.deepEqual(game.snake[0], { x: before.x + 1, y: before.y });
  assert.equal(game.snake.length, 3);
});

test('rejects direct reversal and same-direction input', () => {
  const game = makeGame();
  game.start();
  assert.equal(game.turn(-1, 0), false);
  assert.equal(game.turn(1, 0), false);
  assert.deepEqual(game.nextDirection, { x: 1, y: 0 });
});

test('rejects non-unit direction vectors', () => {
  const game = makeGame();
  game.start();
  assert.equal(game.turn(1, 1), false);
  assert.equal(game.turn(0, 0), false);
  assert.equal(game.turn(2, 0), false);
});

test('eating food adds 10 points, grows the snake, and respawns food off-body', () => {
  const game = makeGame();
  game.start();
  foodAhead(game);
  const lengthBefore = game.snake.length;
  game.step();
  assert.equal(game.score, 10);
  assert.equal(game.snake.length, lengthBefore + 1);
  assert.equal(game.state, GAME_STATE.RUNNING);
  assert.ok(game.food);
  assert.equal(game.snake.some((s) => s.x === game.food.x && s.y === game.food.y), false);
});

test('speed increases after every 50 points but never below 70ms', () => {
  const game = makeGame();
  game.start();
  game.score = 40;
  foodAhead(game);
  game.step();
  assert.equal(game.score, 50);
  assert.equal(game.tickMs, 130);
  game.score = 500;
  game.food = { x: game.snake[0].x + 1, y: game.snake[0].y };
  game.step();
  assert.equal(game.tickMs, 70);
});

test('wall collision ends the game', () => {
  const game = makeGame({ cols: 6, rows: 6 });
  game.start();
  game.snake = [
    { x: 5, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 3 },
  ];
  game.food = { x: 0, y: 0 };
  game.step();
  assert.equal(game.state, GAME_STATE.OVER);
  assert.equal(game.lastEvent, 'wall');
});

test('self collision ends the game', () => {
  const game = makeGame();
  game.start();
  game.snake = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
    { x: 5, y: 5 },
    { x: 5, y: 4 },
    { x: 5, y: 3 },
  ];
  game.food = { x: 0, y: 0 };
  game.nextDirection = { x: 0, y: 1 };
  game.step();
  assert.equal(game.state, GAME_STATE.OVER);
  assert.equal(game.lastEvent, 'self');
});

test('moving into the vacating tail cell is allowed', () => {
  const game = makeGame();
  game.start();
  game.snake = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
    { x: 5, y: 5 },
    { x: 5, y: 4 },
  ];
  game.food = { x: 0, y: 0 };
  game.nextDirection = { x: 1, y: 0 };
  game.step();
  assert.equal(game.state, GAME_STATE.RUNNING);
  assert.deepEqual(game.snake[0], { x: 5, y: 4 });
});

test('pause freezes movement, resume continues it', () => {
  const game = makeGame();
  game.start();
  game.togglePause();
  const snapshot = game.snapshot();
  game.step();
  assert.equal(game.state, GAME_STATE.PAUSED);
  assert.deepEqual(game.snapshot().snake, snapshot.snake);
  game.togglePause();
  game.step();
  assert.equal(game.state, GAME_STATE.RUNNING);
  assert.notDeepEqual(game.snapshot().snake, snapshot.snake);
});

test('starting after game over resets score and state', () => {
  const game = makeGame({ cols: 6, rows: 6 });
  game.start();
  game.snake = [
    { x: 5, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 3 },
  ];
  game.food = { x: 0, y: 0 };
  game.score = 20;
  game.step();
  assert.equal(game.state, GAME_STATE.OVER);
  game.start();
  assert.equal(game.state, GAME_STATE.RUNNING);
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
});

test('food never spawns on the snake across many resets', () => {
  let seed = 1;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const game = makeGame({ rng });
  for (let i = 0; i < 50; i += 1) {
    game.reset();
    assert.ok(game.food);
    assert.equal(game.snake.some((s) => s.x === game.food.x && s.y === game.food.y), false);
  }
});

test('initialLength is clamped so the snake stays inside the board', () => {
  const game = new SnakeGame({ cols: 5, rows: 5, initialLength: 99 });
  assert.equal(game.snake.length, 3);
  assert.ok(game.snake.every((segment) => segment.x >= 0 && segment.x < 5 && segment.y >= 0 && segment.y < 5));
});

test('randomFreeCell normalizes out-of-range rng values', () => {
  for (const value of [-5, 2, Number.NaN]) {
    const game = makeGame({ rng: () => value });
    assert.ok(game.food);
    assert.ok(game.food.x >= 0 && game.food.x < game.cols);
    assert.ok(game.food.y >= 0 && game.food.y < game.rows);
    assert.equal(game.snake.some((segment) => segment.x === game.food.x && segment.y === game.food.y), false);
  }
});

test('filling the board ends in won state with no food left', () => {
  const game = makeGame({ cols: 4, rows: 4 });
  game.start();
  game.snake = [
    { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
    { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 },
    { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 },
    { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 },
  ];
  game.direction = { x: 0, y: -1 };
  game.nextDirection = { x: 0, y: -1 };
  game.food = { x: 0, y: 0 };
  game.score = 140;
  game.step();
  assert.equal(game.state, GAME_STATE.WON);
  assert.equal(game.food, null);
  assert.equal(game.score, 150);
  assert.equal(game.snake.length, 16);
});

test('snapshot is a deep copy', () => {
  const game = makeGame();
  const snapshot = game.snapshot();
  snapshot.snake[0].x = 999;
  snapshot.direction.x = -1;
  assert.notEqual(game.snake[0].x, 999);
  assert.equal(game.direction.x, 1);
});
