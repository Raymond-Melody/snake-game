import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, '.team', 'evidence');
const port = 43000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail && !condition ? ` — ${detail}` : ''}`);
  if (!condition) failures.push({ name, detail });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error('serve.mjs 未在 5 秒内启动');
}

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer();
  const home = await fetch(`${base}/`);
  const csp = home.headers.get('content-security-policy') || '';
  check('GET / 200', home.status === 200, String(home.status));
  check('CSP 存在且限制 self', csp.includes("default-src 'self'") && csp.includes("connect-src 'self'"), csp);
  check('X-Frame-Options DENY', home.headers.get('x-frame-options') === 'DENY', String(home.headers.get('x-frame-options')));
  check('X-Content-Type-Options nosniff', home.headers.get('x-content-type-options') === 'nosniff');
  check('Referrer-Policy no-referrer', home.headers.get('referrer-policy') === 'no-referrer');
  check('Cache-Control no-store', home.headers.get('cache-control') === 'no-store');
  check('主页 HTML 内容', (await home.text()).includes('id="game-canvas"'));

  const main = await fetch(`${base}/src/main.js`);
  check('GET /src/main.js 200', main.status === 200, String(main.status));
  check('JS Content-Type', (main.headers.get('content-type') || '').includes('text/javascript'));

  const head = await fetch(`${base}/`, { method: 'HEAD' });
  check('HEAD / 200', head.status === 200, String(head.status));
  check('HEAD 无响应体', (await head.text()) === '');

  const post = await fetch(`${base}/`, { method: 'POST', body: 'x' });
  check('POST / 405', post.status === 405, String(post.status));

  for (const [label, pathname] of [
    ['package.json', '/package.json'],
    ['.team/state.json', '/.team/state.json'],
    ['tests/game.test.mjs', '/tests/game.test.mjs'],
    ['scripts/serve.mjs', '/scripts/serve.mjs'],
    ['path traversal', '/src/%2e%2e/.team/state.json'],
  ]) {
    const response = await fetch(`${base}${pathname}`);
    check(`${label} 不可访问`, response.status === 404 || response.status === 403, String(response.status));
  }

  await mkdir(evidenceDir, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    base,
    checks,
    failures,
  };
  await writeFile(path.join(evidenceDir, 'http-check.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`\n[http-check] ${failures.length === 0 ? '全部通过' : `${failures.length} 项失败`}`);
} catch (error) {
  failures.push({ name: 'runtime', detail: error.message });
  console.error(`[http-check] ${error.message}`);
} finally {
  server.kill();
}

process.exit(failures.length === 0 ? 0 : 1);
