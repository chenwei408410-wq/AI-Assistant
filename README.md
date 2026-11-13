# 知音 · AI 私人助理

保留现有 React + Vite 手机布局和成年女性静态形象，支持 OpenAI Realtime 中文语音、原有文字聊天演示和本地任务清单。

## Cloudflare Pages 部署

必须使用 **Pages + Pages Functions**，不能仅上传 `dist/` 静态文件，也不能将此版本仅部署到不执行 Pages Functions 的托管平台。

1. 在 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git 中连接现有仓库 `chenwei408410-wq/AI-Assistant`。
2. 生产分支选 `main`，根目录保持仓库根目录，构建命令 `npm run build`，输出目录 `dist`。使用 Node.js 22.12+ 或 24（Cloudflare 构建变量可设置 `NODE_VERSION=24`）。
3. 在项目 Settings → Variables and Secrets 中设置下表。生产和预览环境分别配置；**不要把真实密钥写入代码、Git、聊天或 `VITE_*` 变量**。
4. 部署或重新部署，使配置生效。根目录 `functions/api/realtime.js` 会成为 `/api/realtime`；`public/_routes.json` 使 `/api/*` 交给 Functions，其他资源保持静态服务。
5. 通过部署生成的实际 HTTPS `*.pages.dev` 地址或自定义域名打开。未配置时，语音入口显示服务未配置错误；普通文字聊天及任务仍可用。

| 变量 | 类型 | 必需 | 用途 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Secret | 是 | 服务端调用 OpenAI；项目须有 Realtime 模型权限和可用额度 |
| `VOICE_ACCESS_TOKEN` | Secret | 是 | 自行生成的高强度语音访问口令，建议至少 32 个随机字符；仅私下交给授权使用者 |
| `OPENAI_REALTIME_MODEL` | 普通变量 | 否 | 默认 `gpt-realtime`，可改为账号支持的兼容 Realtime 模型 |
| `NODE_VERSION` | 构建变量 | 建议 | `24` |

`VOICE_ACCESS_TOKEN` 与 OpenAI 密钥不同。用户在网页输入访问口令，前端仅在请求中发送，不持久化。未配置口令时服务拒绝创建会话，避免公开的匿名付费代理。此版本不包含账号系统或分布式限流；若开放多人使用，应增加 Cloudflare Access、WAF 限流及独立用户配额，并在 OpenAI 项目设置使用预算告警。口令泄露后请在 Cloudflare 更换并重新部署。

已有 Cloudflare CLI 授权时也可执行 `npm run deploy:pages`，首次选择/创建 Pages 项目。仓库中的 `wrangler.toml` 项目名为 `zhiyin-ai-assistant`，如绑定已有不同名称的 Pages 项目，请相应调整配置。Git 自动部署更适合日常更新。

## 开始语音对话

1. 使用 HTTPS，在 iPhone Safari 或桌面现代浏览器打开网站。
2. 点击人物旁或输入框旁的语音按钮，输入管理员提供的**语音访问口令**。
3. 点击「允许麦克风并连接」，授权麦克风。状态会经历授权中、连接中、已连接。
4. 用普通话说话，服务自动检测停顿并语音回复，支持说话打断。若 Safari 限制自动播放，点击「播放知音的声音」。建议耳机以减少回声。
5. 点击「断开语音」停止音轨并关闭连接；连接中可取消。离开网页也会释放资源。

音频通过 WebRTC 发送至 OpenAI，密钥不发送给浏览器。服务端只代理 SDP 建连请求，不存储音频。语音转写追加到「对话」，仅存当前浏览器 localStorage；清除网站数据可删除。语音是独立会话，不会把旧文字演示记录或本地任务自动上传给模型。语音不能自动修改任务；任务仍由用户本地操作。文字发送按钮继续保留原有本地演示回复。

## 本地开发

```bash
npm ci
npm run build
npm run dev:pages
```

完整语音本地开发通过 Wrangler 提供静态资源及 Functions（默认 8788）。在本地 **不提交的** `.dev.vars` 文件中配置上述两个 Secret；文件已被 Git 忽略。请自行通过安全渠道配置，不在文档中放真实值。生产仍需要 HTTPS。iPhone 无法通过电脑的普通 HTTP 局域网地址获取麦克风，需使用已部署 HTTPS 地址。

仅前端开发可用 `npm run dev`（5173），但 Vite 不执行 Pages Functions，语音服务端接口不可用。`npm run preview` 也仅提供静态构建预览。

受限云环境若默认缓存目录不可写：

```bash
npm ci --cache /tmp/ai-assistant-npm
XDG_CONFIG_HOME=/tmp/zhiyin-config XDG_CACHE_HOME=/tmp/zhiyin-cache CLOUDFLARE_SEND_METRICS=false npm run dev:pages
```

## 测试

```bash
npm run test:server
npx playwright install chromium
npm test
npm run build
```

已有 Chromium 的云环境可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`。服务端测试覆盖同源验证、口令、配置缺失、SDP/大小限制、中文会话配置和上游错误脱敏。浏览器测试覆盖原有文字/任务、窄屏、语音状态、麦克风拒绝、转写、断开及取消清理；WebRTC 和 OpenAI 响应使用模拟，不产生付费请求。实际语音质量、OpenAI 账号权限及 iPhone 硬件需要配置 Secret 后通过 HTTPS 实机验收。

## 下一阶段：口型与表情

人物仍为 `/secretary.png` 静态图片。`useRealtimeVoice` 通过 `window` 的 `zhiyin:avatar` CustomEvent 提供 `detail.state`：`idle`、`listening`、`speaking`。下一阶段可以订阅这些状态并接入音频分析或音素时间轴，替换人物渲染层，不改变建连流程。WebRTC 声音经远端 MediaStream 播放，不保证数据通道包含音频 delta；精准口型需要单独处理音频分析/时间戳。目前没有实现口型同步或自然表情。

协议参考：[OpenAI WebRTC 指南](https://developers.openai.com/api/docs/guides/realtime-webrtc)、[官方 Calls 实现与类型](https://github.com/openai/openai-node/blob/master/src/resources/realtime/calls.ts)。
