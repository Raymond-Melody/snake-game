import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pass(message) {
  console.log(`PASS  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.log(`FAIL  ${message}`);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) {
    fail(`缺少文件: ${relativePath}`);
    return '';
  }
  return readFileSync(fullPath, 'utf8');
}

const requiredFiles = [
  'index.html',
  'styles.css',
  'src/game.js',
  'src/main.js',
  'tests/game.test.mjs',
  'scripts/check.mjs',
  'scripts/build.mjs',
  'scripts/serve.mjs',
  'scripts/typecheck.mjs',
  'scripts/http-check.mjs',
  'scripts/e2e.mjs',
];

for (const file of requiredFiles) {
  if (existsSync(path.join(root, file))) pass(`文件存在: ${file}`);
  else fail(`缺少文件: ${file}`);
}

const html = read('index.html');
const css = read('styles.css');
const mainJs = read('src/main.js');
const serveJs = read('scripts/serve.mjs');
const sourceFiles = ['index.html', 'styles.css', 'src/game.js', 'src/main.js'];
const allSource = sourceFiles.map((file) => read(file)).join('\n');

if (!/(?:src|href)=["']https?:\/\//i.test(html)) pass('HTML 无外部资源引用');
else fail('HTML 含外部资源引用');
if (!/https?:\/\//i.test(allSource)) pass('源码无外部 URL');
else fail('源码含外部 URL');
if (html.includes('id="game-canvas"') && html.includes('id="overlay-action"')) pass('HTML 包含棋盘与主操作');
else fail('HTML 缺少棋盘或主操作');
if (html.includes('aria-live="polite"') && html.includes('aria-label="方向控制"') && html.includes('role="group"')) pass('包含可访问性标记');
else fail('缺少 aria-live、方向控制标签或 group 角色');
if (css.includes('@media (max-width: 640px)') && css.includes('prefers-reduced-motion')) pass('包含移动端与减少动效样式');
else fail('缺少移动端或减少动效样式');
if (mainJs.includes('prefers-reduced-motion')) pass('Canvas 动效遵循减少动效偏好');
else fail('Canvas 动效未考虑减少动效偏好');
if (mainJs.includes("has('e2e')")) pass('测试钩子仅在 e2e 模式暴露');
else fail('测试钩子未做 e2e 模式保护');
if (serveJs.includes('Content-Security-Policy') && serveJs.includes("relativePath.startsWith('src/')")) pass('本地服务器有 CSP 与静态白名单');
else fail('本地服务器缺少 CSP 或白名单');
if (/min-height:\s*44px/.test(css)) pass('触控目标最小高度 44px');
else fail('按钮缺少 44px 触控高度');
if (!/\beval\s*\(|\bFunction\s*\(/.test(allSource)) pass('无动态代码执行');
else fail('发现动态代码执行');

const filesToSyntaxCheck = [
  'src/game.js',
  'src/main.js',
  'scripts/check.mjs',
  'scripts/build.mjs',
  'scripts/serve.mjs',
  'scripts/typecheck.mjs',
  'scripts/http-check.mjs',
  'scripts/e2e.mjs',
  'tests/game.test.mjs',
];

for (const file of filesToSyntaxCheck) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status === 0) pass(`语法通过: ${file}`);
  else fail(`语法错误: ${file}${result.stderr ? ` — ${result.stderr.trim()}` : ''}`);
}

const packageText = read('package.json');
if (packageText.includes('"type": "module"')) pass('package.json 使用 ES Modules');
else fail('package.json 缺少 type: module');
if (packageText.includes('"test": "node --test tests/game.test.mjs"')) pass('package.json 声明测试脚本');
else fail('package.json 缺少测试脚本');
if (packageText.includes('"typecheck": "node scripts/typecheck.mjs"')) pass('package.json 声明 typecheck 脚本');
else fail('package.json 缺少 typecheck 脚本');
if (packageText.includes('"test:e2e": "node scripts/e2e.mjs && node scripts/http-check.mjs"')) pass('package.json 声明 E2E 脚本');
else fail('package.json 缺少 E2E 脚本');
if (packageText.includes('"test:http": "node scripts/http-check.mjs"')) pass('package.json 声明 HTTP 安全检查脚本');
else fail('package.json 缺少 HTTP 安全检查脚本');

if (failures.length > 0) {
  console.error(`\n[check] ${failures.length} 项失败`);
  process.exit(1);
}
console.log('\n[check] 静态检查全部通过');
