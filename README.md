# 贪食蛇 · SNAKE

一个零依赖、纯前端的经典贪食蛇小游戏。方向键 / WASD 移动，空格暂停，移动端支持方向键与滑动。

## 运行

```bash
npm start
# http://127.0.0.1:4173
```

不需要安装依赖。

## 操作

- 方向键 / WASD：转向
- 空格：开始 / 暂停 / 继续
- Enter：结束后重开
- 移动端：点击方向键，或在棋盘上滑动
- 吃到食物 +10 分并增长；撞墙或撞到自己结束；最高分保存在 localStorage。

## 验证

```bash
npm run lint    # 静态检查：文件、外链、语法、可访问性标记
npm test        # 16 个纯逻辑单测
npm run build   # 生成 dist/ 静态产物
```

浏览器 E2E 使用 Playwright 验证主路径、暂停、吃食物、碰撞、重开、移动端与无控制台错误，结果见 `.team/verification/VER-001.md`。

## 结构

```text
index.html          页面骨架与状态层
styles.css          霓虹街机风、响应式、减少动效
src/game.js         SnakeGame 纯逻辑（状态机、碰撞、食物、计分）
src/main.js         Canvas 渲染、键盘/触摸、计时器、最高分
tests/game.test.mjs 逻辑单测
scripts/check.mjs   静态检查
scripts/build.mjs   生成 dist/
scripts/serve.mjs   本地静态服务器（防目录穿越）
```

## 测试钩子

仅当 URL 带 `?e2e`（如 `/?e2e=1`）时，页面才暴露 `window.__snakeGame`（`game`、`snapshot()`、`start()`、`restart()`、`pause()`、`turn(dx,dy)`、`getHighScore()`），用于本地自动化验证；正常游玩页面不暴露该对象。

## 安全说明

- 本地服务器默认绑定 `127.0.0.1`，只提供 `index.html`、`styles.css` 与 `src/`，并设置 CSP、`X-Frame-Options: DENY`、`nosniff`；不会提供 `.team/`、测试或脚本目录。
- 若设置 `HOST=0.0.0.0`，请自行确认网络暴露范围。
