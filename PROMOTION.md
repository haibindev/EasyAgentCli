# AgentTerm 推广与优化计划

## 0. 核心定位（最重要）

**AgentTerm 的核心价值不是"多窗格终端"，而是：**

> **让 AI Agent 在你离开电脑后继续工作，通过飞书/Discord/Telegram/Openclaw 远程监控和操控。**

这是市场上其他终端管理器（tmux、Warp、Tabby）完全没有的能力。多窗格只是基础设施，**IM 远程控制才是杀手级功能。**

### 核心场景叙事

1. 你同时跑着 3 个 Claude Code 在改不同的仓库
2. 其中一个遇到了需要确认的操作，你不想一直盯着屏幕
3. **开启离开模式** → 起身去开会 / 吃饭 / 回家
4. Claude 遇到确认提示 → 飞书/Telegram 立刻推送通知到你手机
5. 你在手机上回复 `y` → 终端继续执行
6. 任务完成 → 手机收到 ✅ 通知
7. 你还可以随时发 `/screen` 查看终端画面，`/log 50` 看最近日志

**一句话：把 AI Agent 终端变成你手机上的聊天对话。**

---

## 1. 项目命名

当前名称：**AgentTerm**

**优点：**
- 含义直观：Easy + Agent + Cli
- 容易搜索，没有同名项目冲突

**潜在问题：**
- "Cli" 暗示命令行工具，但实际是 GUI 桌面应用，可能造成误解
- 没有体现"远程控制"这个核心卖点

**备选名称参考：**
| 名称 | 特点 |
|------|------|
| AgentPad | 简短，"Pad" 暗示多面板工作区 |
| AgentBridge | 突出"桥接到 IM"的核心功能 |
| AgentRelay | 强调远程中继能力 |
| AgentGrid | 直接体现网格布局 |
| AgentDesk | 桌面 + Agent |

> 决策：如果当前名字已有一定辨识度或已分享过，保持不变也可以。改名越早越好。

---

## 2. Logo 设计

**为什么需要：**
- 有 logo 的项目在 GitHub 上点击率和信任感明显更高
- README 顶部放 logo 是开源项目的标准做法

**设计方向建议：**
- 终端窗口 + 消息气泡/手机的组合（体现终端到 IM 的桥接）
- 或：网格（Grid）+ 无线信号图标的组合
- 颜色可用项目中已有的三色系：绿色(Claude) + 蓝色(Codex) + 灰色(Shell)
- 风格：扁平化、简洁、深色背景友好

**制作方式：**
- AI 生成初稿（Midjourney / DALL-E / 国内 AI 绘图），再用 Figma 微调
- 或直接用 Figma / Illustrator 手工制作简洁图标
- 导出为 SVG（README 用）+ PNG 多尺寸（应用图标用）

**放置位置：**
```
assets/
  logo.svg          # README 顶部展示
  logo-256.png      # 应用图标
  logo-512.png      # 社交媒体分享
```

---

## 3. 录制 Demo GIF / 视频

**这是最高优先级的推广素材。** 一个好的 GIF 比任何文字描述都有效。

### 录制内容（建议录两段）

**GIF 1：核心卖点 — 远程 IM 控制（30s）**
1. 屏幕上跑着 Claude Code，正在工作
2. 点击"离开模式"
3. Claude 弹出确认提示 → 飞书/Telegram 收到通知（画中画或分屏展示手机）
4. 手机上回复 `y` → 终端继续
5. 发送 `/screen` → 手机上看到终端截屏
6. 任务完成 → 手机收到 ✅

**GIF 2：多窗格管理（20s）**
1. 快速创建 Claude + Codex + Shell 窗格
2. 切换布局（1×2 → 2×2）
3. 展示 YOLO 模式切换
4. 中英文切换

### 推荐录制工具

| 工具 | 平台 | 特点 |
|------|------|------|
| [ScreenToGif](https://www.screentogif.com/) | Windows | 免费，直接导出 GIF，可编辑帧 |
| [LICEcap](https://www.cockos.com/licecap/) | Windows/Mac | 极轻量，直接录制 GIF |
| [OBS Studio](https://obsproject.com/) | 全平台 | 录制视频后用 ffmpeg 转 GIF |
| ShareX | Windows | 支持 GIF 和视频 |

### GIF 优化
```bash
# 用 ffmpeg 压缩 GIF（控制在 5MB 以内，GitHub 限制 10MB）
ffmpeg -i demo.mp4 -vf "fps=15,scale=800:-1" -gifflags +transdiff demo.gif
```

### 放置
```markdown
<!-- README.md 顶部，badges 下方 -->
<div align="center">
  <img src="assets/demo-remote.gif" alt="Remote Control Demo" width="800">
</div>
```

---

## 4. README 叙事重构建议

当前 README 的 "Why" 部分侧重多窗格管理，建议调整为以远程控制为核心：

```markdown
## Why AgentTerm?

AI coding agents like Claude Code and Codex run long tasks — but they constantly
need your confirmation. You can't walk away without missing a prompt.

**AgentTerm bridges your terminal to your phone.** Enable "Leave Mode", and every
confirmation, completion, or error is forwarded to Feishu, Discord, Telegram, or
Openclaw. Reply from your phone to approve, reject, or send commands.

- 🚶 **Leave Mode** — walk away, stay in control from your IM
- 📱 **4 IM channels** — Feishu Bot, Discord Bot, Telegram Bot, Openclaw relay
- 📺 **Remote commands** — `/screen`, `/log`, `/yolo`, and more
- 🖥️ **Multi-pane grid** — run agents side by side (1×1 to 4×4)
- ⚡ **YOLO auto-answer** — 3 automation levels for unattended work
```

### Feature 表格建议重排序

| 顺序 | 功能 | 原因 |
|------|------|------|
| 1 | 📡 远程 IM 控制 | **核心差异化** |
| 2 | 🚶 离开模式 | 核心使用场景 |
| 3 | ⚡ YOLO 自动应答 | 与远程控制配合使用 |
| 4 | 🖥️ 多窗格网格 | 基础设施 |
| 5 | 🤖 Agent 支持 | 基础设施 |
| 6 | 💾 会话持久化 | 锦上添花 |

---

## 5. GitHub 项目优化

### 5.1 添加 Topics

在 GitHub 仓库页面 → About → Topics，添加：

```
electron, terminal, ai-agent, claude-code, codex,
feishu, discord, telegram, remote-control,
multi-pane, terminal-manager, xterm, react, typescript,
developer-tools, leave-mode
```

### 5.2 完善 About 描述

```
Run AI agents (Claude Code, Codex) in multi-pane grid. Leave your desk — monitor and control terminals from Feishu, Discord, Telegram, or Openclaw on your phone.
```

### 5.3 添加 Release

发布可下载的安装包，降低用户试用门槛：

```bash
# 构建 Windows 安装包
npm run build
npx electron-builder --win
```

发布到 GitHub Releases，附上：
- `AgentTerm-Setup-x.x.x.exe`（安装版）
- `AgentTerm-x.x.x-portable.exe`（便携版）
- 简要更新日志

### 5.4 添加 LICENSE 文件

```bash
# 确保根目录有 LICENSE 文件
```

### 5.5 添加 .github 模板（可选）

```
.github/
  ISSUE_TEMPLATE/
    bug_report.md
    feature_request.md
  FUNDING.yml          # 如果接受赞助
```

---

## 6. 推广渠道

### 核心推广策略：强调"远程控制 AI Agent"

所有推广文案的标题和首段，都应该以远程 IM 控制为切入点，而非多窗格布局。

### 第一波（发布当天）

| 渠道 | 操作 | 要点 |
|------|------|------|
| **Twitter/X** | 发推 + GIF demo | 首句讲远程控制，不讲多窗格 |
| **Reddit** | r/ClaudeAI, r/programming, r/electronjs | 讲"离开电脑后如何控制 Claude" |
| **Hacker News** | Show HN 帖子 | 标题突出 IM bridge 概念 |
| **V2EX** | /t/share 或 /t/programmer | 讲痛点：Agent 等你确认你却不在电脑前 |
| **即刻** | 发动态 + GIF | 面向中文技术社区 |

### 第二波（发布后一周）

| 渠道 | 操作 |
|------|------|
| **掘金 / SegmentFault** | 文章标题：「让 Claude Code 在你离开后继续工作 — 通过飞书远程操控 AI Agent」 |
| **知乎** | 回答：如何高效使用 Claude Code / 如何同时管理多个 AI 编程助手 |
| **微信公众号 / 技术群** | 分享到 AI 编程、Claude 相关群 |
| **Discord 社区** | Anthropic Discord、各 AI 开发者社区 |
| **飞书社区** | 飞书开发者论坛，展示飞书 Bot 集成能力 |
| **Telegram 群组** | 开发者群组、Bot 开发相关频道 |

### 持续维护

| 渠道 | 操作 |
|------|------|
| **Awesome 列表** | 提 PR 到 awesome-electron、awesome-ai-tools、awesome-chatgpt |
| **Product Hunt** | 提交产品页面，标语强调 remote control |
| **博客文章** | 「我为什么要把 AI 终端连到飞书 — 一个远程工作者的工具」 |

---

## 7. 推文/帖子模板

### Twitter/X (English)

```
🚶 I leave my desk while Claude Code is running.

When it needs confirmation → my phone buzzes (Feishu/Discord/Telegram).
I reply "y" → it continues.
Task done → I get ✅.

Built AgentTerm: bridge AI agent terminals to your IM.
Multi-pane grid + YOLO auto-answer + remote commands.

⭐ github.com/haibindev/AgentTerm

#ClaudeCode #AI #DevTools #OpenSource
```

### Reddit

```
Title: I built a tool that forwards Claude Code/Codex terminal events to your phone via Feishu/Discord/Telegram

The problem: I run 2-3 Claude Code sessions simultaneously. They constantly need
confirmations. I can't leave my desk without missing a prompt and blocking progress.

My solution: AgentTerm — an Electron app that:

1. Runs multiple AI agents in a grid layout (side by side)
2. Has a "Leave Mode" — when enabled, ALL terminal events (confirmations,
   completions, errors) are forwarded to your IM
3. You reply from your phone: "y" to approve, "/screen" to see what's happening,
   "/log 50" to check recent output
4. Supports 4 channels: Feishu Bot, Discord Bot, Telegram Bot, Openclaw relay
5. YOLO auto-answer with 3 safety levels

The remote control part is the killer feature. The multi-pane layout is just a bonus.

Tech: Electron 41, React 18, xterm.js, node-pty
No webhook needed — Feishu uses WebSocket, Telegram uses long-polling.

GitHub: [link]
```

### Hacker News

```
Title: Show HN: Bridge AI agent terminals to Feishu/Discord/Telegram for remote control

I built AgentTerm because I got tired of being chained to my desk while Claude Code
runs. Enable "Leave Mode" and terminal events are forwarded to your IM. Reply from
your phone to approve, reject, or inspect.

Also: multi-pane grid layout, YOLO auto-answer, session persistence, i18n.

github.com/haibindev/AgentTerm
```

### V2EX (中文)

```
标题：让 Claude Code 在你离开后继续干活 — 通过飞书/Telegram 远程操控 AI Agent

痛点：
同时跑 3 个 Claude Code，它们动不动就弹确认提示。
去开个会回来，发现 Agent 等了你 40 分钟什么都没干。

做了个工具解决这个问题：

核心功能 — 离开模式：
- 开启后，所有终端事件（确认、完成、报错）自动转发到飞书/Discord/Telegram
- 手机上回复 y/n 就能操控
- 发 /screen 看终端画面，/log 查日志，/yolo 切自动化级别
- 支持飞书 Bot（WebSocket，不需要公网）、Discord Bot、Telegram Bot、Openclaw 中继

附带功能：
- 多窗格网格布局（1×1 到 4×4）
- YOLO 自动应答（手动/安全/全自动）
- 中英文切换
- 会话持久化

技术栈：Electron + React + xterm.js + node-pty
飞书接入用的 WebSocket 模式，不需要公网 IP 和域名。

GitHub: [link]

做这个的初衷就是想让 Agent 在后台安心干活，自己该干嘛干嘛，手机上看一眼就行。
```

---

## 8. GitHub 加星增长策略

### 8.1 项目页面优化（基础功课）

- **Star History 徽章**：在 README 底部添加 star-history.com 的动态图表，展示增长趋势，形成正反馈
  ```markdown
  [![Star History Chart](https://api.star-history.com/svg?repos=haibindev/AgentTerm&type=Date)](https://star-history.com/#haibindev/AgentTerm&Date)
  ```
- **Social Preview 图**：在 Settings → Social preview 上传一张 1280×640 的封面图（含 Logo + 一句话卖点 + 截图），分享到社交媒体时自动展示
- **Pinned Repo**：把 AgentTerm pin 到你的 GitHub Profile 页面顶部
- **README 顶部 CTA**：加一行醒目的 `⭐ Star this repo to stay updated` 引导

### 8.2 发布节奏（制造曝光窗口）

| 策略 | 做法 |
|------|------|
| **首发冲量** | 选择北京时间周二~周四上午 10 点发布（对应美国西海岸周一~周三下午），同时发 HN + Reddit + Twitter |
| **版本驱动** | 每隔 1-2 周发一个有实质内容的 Release（哪怕是小功能），每次 Release 都是一次推广机会 |
| **Changelog 营销** | Release Notes 不要只列技术改动，要用场景化语言：「现在你可以在地铁上通过 Telegram 控制 Claude Code 了」 |
| **GitHub Trending** | 在 24 小时内集中获得 30+ stars 就有可能上 Trending，集中推广窗口很重要 |

### 8.3 社区互动（长期增长引擎）

- **回答相关问题**：在 Reddit、V2EX、知乎、Stack Overflow 搜索「Claude Code terminal」「multiple AI agents」「remote control terminal」等关键词，用回答附带项目链接
- **参与竞品讨论**：在 tmux、Warp、Tabby、Zellij 等项目的 Issue/Discussion 中，当有人提到远程控制需求时，礼貌推荐
- **给相关项目提 PR**：给 awesome-electron、awesome-ai-tools、awesome-developer-tools 提 PR 添加你的项目
- **Issue 互动**：快速响应 Issue 和 PR，活跃的维护者 = 更高的信任 = 更多 star

### 8.4 内容营销（把功能变成故事）

| 平台 | 内容角度 |
|------|----------|
| **Dev.to / Medium** | 「How I Monitor 3 Claude Code Sessions from My Phone」 |
| **掘金 / SegmentFault** | 「离开电脑后，我用飞书远程操控 AI Agent 的工作流」 |
| **知乎** | 回答「如何高效使用 Claude Code」类问题，附项目链接 |
| **B 站 / YouTube** | 录一个 3-5 分钟的场景演示视频（比 GIF 更有深度） |
| **Twitter/X threads** | 发 thread 讲构建过程和技术决策，开发者喜欢看 behind the scenes |

### 8.5 借力打力（蹭热度但有价值）

- **Claude Code 更新时**：每次 Anthropic 发布 Claude Code 新版本，第一时间发推「AgentTerm now supports the latest Claude Code X.X — run 4 sessions side by side and control them from Telegram」
- **竞品发布时**：Cursor / Windsurf / Codex 有大版本更新时，参与讨论并提供差异化视角
- **AI 热点事件**：有 AI 编程相关热点时，把自己的工具作为解决方案植入讨论

### 8.6 用户激励

- **Contributors 墙**：在 README 中展示贡献者头像（使用 `contrib.rocks` 或 `all-contributors`）
- **Good First Issues**：创建简单的入门 Issue，降低贡献门槛，贡献者往往会 star
- **Feature Request 投票**：用 GitHub Discussion 让用户投票功能需求，参与感带来 star
- **感谢 star**：可以在 README 写「感谢所有 stargazers」并链接到 stargazers 页面

### 8.7 跨项目联动

- **做 Claude Code 的插件/扩展生态**：让 Claude Code 官方知道你的项目，争取被官方推荐或提及
- **与飞书开发者社区合作**：在飞书开放平台的案例展示中提交你的项目
- **Telegram Bot 生态**：在 Telegram Bot 相关的资源列表中添加你的项目

---

## 9. 优先级排序

| 优先级 | 任务 | 预计耗时 |
|--------|------|---------|
| ⭐⭐⭐ | 录制远程控制 Demo GIF（核心卖点） | 30 分钟 |
| ⭐⭐⭐ | 重构 README 叙事（远程控制优先） | 15 分钟 |
| ⭐⭐⭐ | 添加 GitHub Topics + About | 5 分钟 |
| ⭐⭐⭐ | 发 Twitter + Reddit + V2EX | 30 分钟 |
| ⭐⭐ | 设计 Logo（终端+消息气泡） | 1-2 小时 |
| ⭐⭐ | 发布 Release 安装包 | 30 分钟 |
| ⭐⭐ | 写推广博客（讲远程控制场景） | 1-2 小时 |
| ⭐⭐ | 在飞书/Telegram 开发者社区推广 | 30 分钟 |
| ⭐ | 添加 LICENSE 文件 | 5 分钟 |
| ⭐ | 提交 Awesome 列表 PR | 30 分钟 |
| ⭐ | Product Hunt 提交 | 1 小时 |
