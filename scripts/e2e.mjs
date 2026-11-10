import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, '.team', 'evidence');
const port = 44000 + Math.floor(Math.random() * 1000);
const cdpPort = port + 1000;
const base = `http://127.0.0.1:${port}`;
const browserCandidates = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const browserPath = browserCandidates.find((candidate) => existsSync(candidate));
const failures = [];
const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail && !condition ? ` — ${detail}` : ''}`);
  if (!condition) failures.push({ name, detail });
}

function stopProcess(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Process may already have exited.
    }
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // Process may already have exited.
  }
}

class CdpClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  return response.json();
}

async function waitFor(fn, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(message);
}

async function waitForServer() {
  await waitFor(async () => {
    try {
      return (await fetch(`${base}/`)).ok;
    } catch {
      return false;
    }
  }, 5000, 'serve.mjs 未在 5 秒内启动');
}

let server;
let browser;
let profile;
let client;

try {
  if (!browserPath) throw new Error('未找到 Edge/Chrome；设置 BROWSER_PATH 后重试');
  await mkdir(evidenceDir, { recursive: true });
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();

  profile = await mkdtemp(path.join(tmpdir(), 'snake-e2e-'));
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  await waitFor(async () => {
    try {
      await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
      return true;
    } catch {
      return false;
    }
  }, 10000, '浏览器 CDP 未在 10 秒内就绪');

  let targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  if (!targets.some((target) => target.type === 'page')) {
    await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
    targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  }
  const pageTarget = targets.find((target) => target.type === 'page');
  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.open();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  const evaluate = async (expression) => {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || '页面执行异常');
    }
    return result.result?.value;
  };
  const waitForPage = () => waitFor(async () => {
    try {
      return (await evaluate('document.readyState')) === 'complete' && Boolean(await evaluate('Boolean(window.__snakeGame)'));
    } catch {
      return false;
    }
  }, 8000, '测试页面未在 8 秒内就绪');
  const navigate = async (width, height, mobile = false) => {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await client.send('Page.navigate', { url: `${base}/?e2e=1` });
    await waitForPage();
  };

  await navigate(1280, 900);
  const initial = await evaluate('window.__snakeGame.snapshot()');
  check('初始状态 ready', initial.state === 'ready', initial.state);
  check('初始 overlay kicker', (await evaluate('document.querySelector("#overlay-kicker").textContent')) === 'INSERT COIN');

  await evaluate('window.__snakeGame.start()');
  await sleep(260);
  const running = await evaluate('window.__snakeGame.snapshot()');
  check('开始后 running', running.state === 'running', running.state);
  check('开始后 overlay 隐藏', (await evaluate('document.querySelector("#overlay").hidden')) === true);

  const beforeTurn = await evaluate('JSON.stringify(window.__snakeGame.snapshot().snake[0])');
  const turnAccepted = await evaluate('window.__snakeGame.turn(0, -1)');
  await sleep(240);
  const turnState = await evaluate('window.__snakeGame.snapshot()');
  check('方向改变被接受并生效', turnAccepted === true && turnState.direction.x === 0 && turnState.direction.y === -1, JSON.stringify(turnState.direction));
  check('转向后蛇头位置变化', JSON.stringify(turnState.snake[0]) !== beforeTurn, `${beforeTurn} -> ${JSON.stringify(turnState.snake[0])}`);

  await evaluate(`(() => {
    const game = window.__snakeGame.game;
    const head = game.snake[0];
    const direction = game.direction;
    game.food = { x: head.x + direction.x, y: head.y + direction.y };
    return true;
  })()`);
  await sleep(240);
  const foodState = await evaluate(`(() => {
    const game = window.__snakeGame.game;
    return {
      score: game.score,
      length: game.snake.length,
      food: game.food,
      onSnake: game.snake.some((segment) => segment.x === game.food.x && segment.y === game.food.y),
    };
  })()`);
  check('吃食物得分 +10 且蛇身增长', foodState.score === 10 && foodState.length === 4, JSON.stringify(foodState));
  check('食物不落在蛇身', foodState.onSnake === false, JSON.stringify(foodState));
  check('最高分同步更新', (await evaluate('window.__snakeGame.getHighScore()')) === 10);
  check('最高分写入 localStorage', (await evaluate('localStorage.getItem("snake.highScore")')) === '10');

  await evaluate('window.__snakeGame.pause()');
  const paused = await evaluate('window.__snakeGame.snapshot()');
  const pausedView = await evaluate('({hidden:document.querySelector("#overlay").hidden,kicker:document.querySelector("#overlay-kicker").textContent,title:document.querySelector("#overlay-title").textContent,action:document.querySelector("#overlay-action").textContent})');
  check('暂停后 paused', paused.state === 'paused', paused.state);
  check('暂停 overlay 文案', pausedView.hidden === false && pausedView.kicker === 'PAUSED' && pausedView.title === '已暂停' && pausedView.action === '继续', JSON.stringify(pausedView));
  const headBefore = await evaluate('JSON.stringify(window.__snakeGame.snapshot().snake[0])');
  await sleep(260);
  const headAfter = await evaluate('JSON.stringify(window.__snakeGame.snapshot().snake[0])');
  check('暂停期间蛇头冻结', headBefore === headAfter, `${headBefore} -> ${headAfter}`);

  await evaluate('window.__snakeGame.pause()');
  check('继续后 running', (await evaluate('window.__snakeGame.snapshot().state')) === 'running');

  await evaluate('window.__snakeGame.restart()');
  check('重开后分数归零', (await evaluate('window.__snakeGame.snapshot().score')) === 0);
  check('重开后最高分保留', (await evaluate('window.__snakeGame.getHighScore()')) === 10);
  check('重开后焦点在 canvas', (await evaluate('document.activeElement?.id')) === 'game-canvas');

  const overState = await evaluate(`(() => {
    window.__snakeGame.start();
    const game = window.__snakeGame.game;
    game.snake = [{x:19,y:10},{x:18,y:10},{x:17,y:10}];
    game.food = {x:0,y:0};
    game.direction = {x:1,y:0};
    game.nextDirection = {x:1,y:0};
    game.step();
    window.__snakeGame.render();
    return game.state;
  })()`);
  const overView = await evaluate('({kicker:document.querySelector("#overlay-kicker").textContent,action:document.querySelector("#overlay-action").textContent})');
  check('撞墙后 over', overState === 'over', overState);
  check('结束 overlay 文案', overView.kicker === 'GAME OVER' && overView.action === '再来一局', JSON.stringify(overView));

  const screenshots = [];
  for (const [width, height, mobile] of [[1280, 900, false], [768, 900, false], [360, 800, true]]) {
    await navigate(width, height, mobile);
    const layout = await evaluate('({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,dpad:getComputedStyle(document.querySelector(".dpad")).display,actionHeight:document.querySelector("#overlay-action").getBoundingClientRect().height,buttonWidths:[...document.querySelectorAll(".dpad-btn")].map((node)=>node.getBoundingClientRect().width)})');
    check(`${width}px 无横向溢出`, layout.scrollWidth <= width + 1, JSON.stringify(layout));
    if (width === 360) {
      check('360px D-pad 可见', layout.dpad === 'grid', layout.dpad);
      check('360px 触控目标 >=44px', layout.actionHeight >= 44 && layout.buttonWidths.every((value) => value >= 44), JSON.stringify(layout));
    }
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    const filename = `e2e-${width}.png`;
    await writeFile(path.join(evidenceDir, filename), Buffer.from(screenshot.data, 'base64'));
    screenshots.push(filename);
  }

  const consoleErrors = client.events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'));
  check('无控制台错误', consoleErrors.length === 0, JSON.stringify(consoleErrors).slice(0, 1000));

  const requests = client.events
    .filter((event) => event.method === 'Network.requestWillBeSent')
    .map((event) => event.params.request.url);
  const external = requests.filter((url) => !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('about:'));
  check('无外部网络请求', external.length === 0, external.join(', '));

  const summary = {
    generatedAt: new Date().toISOString(),
    base,
    browser: browserPath,
    checks,
    failures,
    consoleErrors,
    requests,
    external,
    screenshots,
  };
  await writeFile(path.join(evidenceDir, 'e2e-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`\n[e2e] ${failures.length === 0 ? '全部通过' : `${failures.length} 项失败`}`);
} catch (error) {
  failures.push({ name: 'runtime', detail: error.message });
  console.error(`[e2e] ${error.message}`);
} finally {
  if (client) client.close();
  stopProcess(browser);
  stopProcess(server);
  if (profile) await rm(profile, { recursive: true, force: true });
}

process.exit(failures.length === 0 ? 0 : 1);
