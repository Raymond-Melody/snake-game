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
npm run lint      # 静态检查：文件、外链、语法、可访问性标记
npm run typecheck # 全部 JS/MJS 的 Node 语法门禁
npm test          # 16 个纯逻辑单测
npm run build     # 生成 dist/ 静态产物
npm run test:http # 真实服务器：CSP、安全头、白名单、404/405、目录穿越
npm run test:e2e  # 零依赖 CDP 浏览器 E2E + HTTP 安全检查
```

E2E 使用本机 Edge/Chrome 的 CDP（Node 内置 WebSocket，不引入 Playwright 依赖），覆盖主路径、吃食物、碰撞、暂停、重开/焦点、最高分、控制台/网络，以及 1280/768/360 视口。结果见 `.team/verification/VER-002.md`、`.team/evidence/e2e-summary.json` 和 `e2e-360.png`。

团队验证器：

```bash
node ../web-fullstack-team/skills/web-fullstack-team/scripts/run-verification.mjs \
  --root . --require lint,typecheck,test,build,e2e
```

## 结构

```text
index.html          页面骨架与状态层
styles.css          霓虹街机风、响应式、减少动效
src/game.js         SnakeGame 纯逻辑（状态机、碰撞、食物、计分）
src/main.js         Canvas 渲染、键盘/触摸、计时器、最高分
tests/game.test.mjs 逻辑单测
scripts/check.mjs   静态检查
scripts/typecheck.mjs JS/MJS 语法门禁
scripts/http-check.mjs 服务器安全与白名单检查
scripts/e2e.mjs     零依赖 CDP 浏览器 E2E
scripts/build.mjs   生成 dist/
scripts/serve.mjs   本地静态服务器（防目录穿越）
```

## 测试钩子

仅当 URL 带 `?e2e`（如 `/?e2e=1`）时，页面才暴露 `window.__snakeGame`（`game`、`snapshot()`、`start()`、`restart()`、`pause()`、`turn(dx,dy)`、`getHighScore()`），用于本地自动化验证；正常游玩页面不暴露该对象。

## 安全说明

- 本地服务器默认绑定 `127.0.0.1`，只提供 `index.html`、`styles.css` 与 `src/`，并设置 CSP、`X-Frame-Options: DENY`、`nosniff`；不会提供 `.team/`、测试或脚本目录。
- 若设置 `HOST=0.0.0.0`，请自行确认网络暴露范围。
