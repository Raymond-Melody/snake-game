import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirs = new Set(['.git', '.team', 'node_modules', 'dist']);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) files.push(fullPath);
  }
}

walk(root);
let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (result.status === 0) {
    console.log(`PASS  syntax ${relative}`);
  } else {
    failed += 1;
    console.log(`FAIL  syntax ${relative}${result.stderr ? `\n${result.stderr.trim()}` : ''}`);
  }
}

console.log(`\n[typecheck] ${failed === 0 ? `${files.length} 个 JS/MJS 文件语法通过` : `${failed} 个文件语法失败`}`);
process.exit(failed === 0 ? 0 : 1);
