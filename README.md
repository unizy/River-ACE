# River ACE

River ACE 是一款浏览器端无限注德州扑克游戏，支持 2～10 人单机牌桌，以及由服务器权威控制的在线好友房。项目已完成规则原型、完整单机版和在线多人版三个阶段。

> 仅使用虚拟筹码，不涉及真实货币、充值或提现。

## 在线体验

- 公网测试地址：<http://101.200.80.154>（域名与 HTTPS 切换完成后改为 `https://unizy.online`）
- 可直接注册账号并创建好友房。
- 当前为 HTTP 测试环境；正式运营前建议绑定域名并启用 HTTPS/WSS。

## 主要功能

### 德州扑克规则

- 2～10 人牌桌，完整实现翻牌前、翻牌、转牌和河牌四轮下注。
- 支持过牌、跟注、下注、加注、全下和弃牌。
- 正确处理最低加注、短码全下、主池、多个边池、平分和零头筹码。
- 七选五牌型判断，并从七张牌中选出最佳五张牌。
- 结算时高亮赢家最佳五张牌，并解释获胜牌型和比较依据。

### 单机版

- 谨慎、激进、跟注、均衡四类电脑玩家。
- 电脑只读取公开信息和自己的底牌，并结合牌力、底池赔率、位置和下注尺度行动。
- 完整底牌与公共牌发牌动画、筹码动画和可关闭音效。
- 本地设置、生涯统计、最近 50 局记录和文本导出。
- 响应式桌面/手机布局、PWA 清单和离线缓存。

### 在线多人版

- 用户账号、密码好友房、邀请链接、2～10 人实时对战和行动倒计时。
- 服务端安全洗牌、隐藏信息隔离、合法动作校验和异常操作记录。
- 房主可自由增删四种性格的服务器托管机器人。
- 30 秒断线重连宽限；超时后自动离桌并将房主转移给其他在线真人。
- 全体真人超时断线后自动解散房间并清理机器人和计时器。
- 同一账号的多个标签页保持在同一个房间，关闭单个标签页不会误判为断线。
- 观战、断开自动清理、服务器牌局回放、排行榜和举报功能。
- 每个好友房支持独立实时语音，真人玩家可选择按住 `V` 发言或自由发言，观战者只能收听。
- 支持麦克风静音、关闭收听、输入设备切换、弱网重连和正在发言的座位高亮。
- 玩家主动离房或断线超时后会被移出语音；游戏房解散时同步关闭对应语音房间。
- 账号、统计、回放和举报数据由服务端持久化保存。

## 技术栈

- React + TypeScript
- Vite + `vite-plugin-singlefile`
- Node.js HTTP + WebSocket (`ws`)
- LiveKit WebRTC SFU
- Vitest
- pnpm

## 快速开始

建议使用 Node.js 20 或更高版本，并通过 Corepack 启用 pnpm。

```bash
corepack enable
pnpm install
```

### 前端开发

```bash
pnpm dev
```

### 在线版开发

分别启动服务端和前端开发服务器：

```bash
pnpm server
pnpm dev
```

Vite 会把 `/api` 和 `/ws` 代理到 `http://127.0.0.1:8787`。

### 生产运行

```bash
pnpm build
pnpm start
```

访问 <http://localhost:8787>，服务端会同时提供网页、HTTP API 和 WebSocket 服务。

可通过环境变量调整运行配置：

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `PORT` | `8787` | 服务监听端口 |
| `TURN_MS` | `25000` | 真人每次行动时限（毫秒） |
| `NEXT_HAND_MS` | `8000` | 下一手牌等待时间（毫秒） |
| `DISCONNECT_GRACE_MS` | `30000` | 断线重连宽限时间（毫秒） |
| `RIVER_ACE_DATA` | `server/data/store.json` | 服务端数据文件路径 |
| `LIVEKIT_URL` | — | 浏览器连接的语音地址，如 `wss://voice.unizy.online` |
| `LIVEKIT_API_URL` | 由 `LIVEKIT_URL` 转换 | 游戏服务访问 LiveKit API 的地址，如 `http://127.0.0.1:7880` |
| `LIVEKIT_API_KEY` | — | LiveKit API Key，仅保存在服务器 |
| `LIVEKIT_API_SECRET` | — | LiveKit API Secret，仅保存在服务器 |

仓库中的 `deploy/river-ace.service` 可作为 Linux systemd 部署模板。

## 语音服务与域名部署

浏览器麦克风要求安全上下文，因此公网语音必须使用 HTTPS。推荐使用：

- `unizy.online`：游戏网页、HTTP API 和游戏 WebSocket。
- `voice.unizy.online`：LiveKit 信令和 WebRTC 语音服务。

阿里云需要完成以下设置：

1. 在 DNS 解析中为根域名 `@` 和子域名 `voice` 各增加一条 A 记录，记录值均为服务器公网 IP `101.200.80.154`。
2. 在 ECS 安全组入方向开放 `80/TCP`、`443/TCP`、`7881/TCP` 和 `7882/UDP`。SSH 的 `22/TCP` 建议只允许管理员 IP。
3. 如果服务器位于中国大陆，按阿里云要求完成域名备案；备案生效前可完成本地开发，但域名公网访问和证书签发可能受影响。
4. 安装 Caddy，将 `deploy/Caddyfile` 放到 `/etc/caddy/Caddyfile`。Caddy 会为两个域名申请证书并把请求转发给游戏服务和 LiveKit。
5. 安装 LiveKit Server，将 `deploy/livekit.yaml.example` 复制为 `/etc/livekit.yaml`，替换其中的 API Key 与 Secret；相同值写入 `/etc/river-ace/river-ace.env`。
6. 安装并启用 `deploy/river-ace.service`、`deploy/river-ace-livekit.service` 和 `deploy/river-ace-caddy.service`，最后访问 `https://unizy.online` 验证麦克风授权。后两个服务使用 Docker 运行固定版本的 LiveKit 与 Caddy。

可从 `.env.example` 复制游戏服务所需配置。API Secret 绝不能写入前端环境变量或提交到仓库。LiveKit 未配置时，游戏仍可正常运行，玩家点击“加入语音”时会看到明确提示。

当前模板使用 `7882/UDP` 传输音频，并用 `7881/TCP` 作为 UDP 不可用时的回退。若还要兼容只允许常见端口的严格网络，可再将 `turn.unizy.online` 解析到同一服务器，开放 `3478/UDP` 与 `5349/TCP`，为该子域名准备证书，并启用 `livekit.yaml.example` 中的 TURN 配置。

### 直接打开单机版

执行一次 `pnpm build` 后，可以双击根目录的 `index.html`。它会加载 `dist/index.html` 单文件版本，不需要本地服务器，也不会触发 `file://` 模块跨域问题。

在线多人版必须通过 `pnpm start` 或已部署的在线服务访问，不能直接从 `file://` 建立联机连接。

## 测试

```bash
pnpm test
pnpm test:online
pnpm build
```

- 39 个规则、牌型、边池、电脑策略、动画与本地存储单元测试。
- 随机运行一万局，检查重复牌、筹码守恒、负筹码和卡局等问题。
- 在线端到端测试覆盖账号、密码房、机器人、隐藏信息、语音令牌与玩家/观战权限、观战、断线重连、房主转移、超时离桌、自动解散、结算、回放、排行榜和举报。

## 项目结构

```text
src/game/       德州扑克规则引擎
src/ai/         电脑玩家策略与胜率估算
src/components/ 动画和界面组件
src/online/     在线大厅与牌桌客户端
src/voice/      房间语音连接、按下发言与自由发言控件
src/storage/    单机设置、统计和牌局记录
server/         HTTP、WebSocket、房间与持久化服务
deploy/         Linux systemd 服务模板
docs/           完整开发方案
```

## 注意事项

- PWA 安装和浏览器安全能力需要 HTTPS 或本地开发环境。
- 生产部署应使用 HTTPS/WSS、反向代理、登录限流和定期数据备份。
- `server/data/`、环境变量、日志、依赖和构建产物已从 Git 提交中排除。
