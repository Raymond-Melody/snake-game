import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of ['index.html', 'styles.css', 'README.md']) {
  const source = path.join(root, file);
  if (existsSync(source)) cpSync(source, path.join(dist, file));
}
cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });

const expected = ['index.html', 'styles.css', 'src/game.js', 'src/main.js'];
for (const file of expected) {
  const fullPath = path.join(dist, file);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    console.error(`[build] 缺少产物: dist/${file}`);
    process.exit(1);
  }
}

console.log(`[build] 静态产物已生成: ${dist}`);
console.log(`[build] 文件: ${expected.join(', ')}`);
