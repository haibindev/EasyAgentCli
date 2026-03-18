<p align="center">
  <img src="build/icon-128.png" alt="EasyAgentCli" width="100" />
</p>

<h1 align="center">EasyAgentCli</h1>

<p align="center">
  多窗格 AI Agent 终端管理器
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

在多窗格网格中运行 AI Agent（Claude Code、Codex 等），通过飞书、Discord、Telegram 在手机上远程监控和操作终端。

![截图](assets/screenshot-zh.png)

## 功能特性

- **多窗格终端网格** — 多个 AI Agent 会话并排运行，窗格可调整大小，支持 1-9 格灵活布局
- **多种 Agent 支持** — 每个窗格可启动 Claude Code、Codex、PowerShell 或任意 Shell
- **离开模式** — 离开电脑后，通过即时通讯应用远程监控和操作所有终端
- **远程适配器** — 支持飞书、Discord、Telegram、Openclaw 中继
- **智能通知** — 可配置心跳摘要和静默提醒，随时掌握终端状态
- **终端功能** — 完整的复制粘贴支持、自动适配大小、链接检测、滚动历史
- **会话持久化** — 重启后可恢复 Claude Code 会话
- **双语界面** — 中文和英文切换

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 安装与运行

```bash
git clone https://github.com/haibindev/EasyAgentCli.git
cd EasyAgentCli
npm install
npm run rebuild   # 编译原生 node-pty 模块
npm run dev
```

### 打包

```bash
npm run build
npx electron-builder --win --dir
```

输出目录：`dist-electron/win-unpacked/`

## 远程适配器配置

点击工具栏齿轮图标进入适配器配置。

![设置](assets/screenshot-settings-zh.png)

| 适配器 | 所需配置 |
|--------|---------|
| 飞书 Bot | App ID、App Secret |
| Discord | Bot Token、Channel ID（自动学习） |
| Telegram | Bot Token、Chat ID（自动学习） |
| Openclaw | 中继 URL |

开启工具栏的**离开模式**后，终端事件将转发到已配置的通道。

## 远程指令

离开模式下，向机器人发送消息：

| 指令 | 说明 |
|------|------|
| `#1 你的消息` | 发送输入到终端窗格 #1 |
| `#2 同意执行` | 发送输入到终端窗格 #2 |
| 任意文本 | 发送到当前焦点 / 第一个窗格 |

## 技术栈

- **Electron** + **React** + **TypeScript**
- **xterm.js** — 终端模拟
- **node-pty** — 原生 PTY 后端
- **electron-vite** — 构建工具

## 许可证

[MIT](LICENSE)

## 作者

**haibindev** — [https://haibindev.github.io/](https://haibindev.github.io/)

### 关注公众号

关注「**海滨code**」公众号，获取更多 AI 开发工具和技术分享。

<img src="build/wechat-qrcode.jpg" alt="海滨code 公众号" width="100" />
