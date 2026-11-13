# 知音 · AI 私人助理

React + Vite 手机网页第一版。建议 Node.js 22.12+ 或 24。

## 本地预览

```bash
npm ci
npm run dev
```

电脑浏览器打开 http://localhost:5173。手机与电脑在同一 Wi-Fi 下，打开 `http://电脑的局域网IP:5173`。云环境需要平台提供的端口转发才能在外部打开，localhost 不是公网地址。

```bash
npm run build
npm run preview
```

生产预览默认端口为 4173；`dist/` 可部署到静态托管平台。当前未自动部署公网网站。

## 当前功能

- 适配手机的首页与原创 AI 生成的成年女性虚拟秘书静态形象。
- 中文文字输入、演示回复、聊天记录本地保存；没有连接真实大模型。
- 本地任务添加、完成与删除，刷新后保留。
- 实时语音和人物口型同步的界面入口；当前未调用麦克风，未实现语音或动画。

对话和任务只保存在当前浏览器 localStorage，不跨设备同步。清除网站数据会删除记录。

## 后续接入

真实 AI 聊天应通过独立后端代理调用模型，密钥只保存在服务端，不放入 Vite 前端变量。后续可在消息发送流程接入流式文本响应，在语音入口接入实时音频会话，再使用音素/时间戳驱动动态人物口型。任务目前为本地功能，可扩展服务端存储及模型工具调用。

## 验证

```bash
npx playwright install chromium
npm test
npm run build
```

浏览器测试覆盖手机首页图片、窄屏溢出、中文聊天、演示提示、记录持久化以及任务生命周期。

云环境已提供 Chromium 时，无需下载浏览器，可执行：

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

若 npm 默认缓存目录不可写，可为 `npm ci` 添加 `--cache /tmp/ai-assistant-npm`。
