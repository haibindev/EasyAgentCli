<div align="center">

<img src="assets/logo.svg" alt="EasyAgentCli Logo" width="180">

# EasyAgentCli

**Let AI agents keep working after you leave your desk.**
**Monitor and control terminals from your phone via Feishu, Discord, Telegram, or Openclaw.**

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/haibindev/EasyAgentCli?style=social)](https://github.com/haibindev/EasyAgentCli)

[中文说明](README_CN.md) · [Report Bug](.github/ISSUE_TEMPLATE/bug_report.md) · [Request Feature](.github/ISSUE_TEMPLATE/feature_request.md)

**If you find this useful, please consider giving it a ⭐ Star — it helps a lot!**

</div>

---

## Why EasyAgentCli?

AI coding agents like Claude Code and Codex run long tasks — but they constantly need your confirmation. **You can't walk away without missing a prompt and blocking progress.**

EasyAgentCli bridges your terminal to your phone:

1. You're running 3 Claude Code sessions, working on different repos
2. One hits a confirmation prompt — you don't want to stare at the screen
3. **Enable Leave Mode** → go to a meeting, grab lunch, head home
4. Claude needs confirmation → instant notification on your phone (Feishu / Discord / Telegram)
5. Reply `y` from your phone → terminal continues
6. Task complete → you get a ✅ notification
7. Anytime: send `/screen` to see the terminal, `/log 50` for recent output

**One line: turn your AI agent terminal into a chat conversation on your phone.**

## Screenshot

![EasyAgentCli](assets/screenshot-en.png)

<details>
<summary>Adapter Settings</summary>

![Adapter Settings](assets/screenshot-settings-en.png)

</details>

## Features

<table>
<tr>
<td width="50%">

### 📡 Remote Control via IM
The killer feature. Enable **Leave Mode** and terminal events (confirmations, completions, errors) are forwarded to your IM. Reply from your phone to approve, reject, or send commands. Supports **4 channels**: Feishu Bot, Discord Bot, Telegram Bot, and Openclaw relay.

### 🚶 Leave Mode
One click to activate. Walk away with confidence — every confirmation prompt, task completion, and error is pushed to your phone in real-time.

### ⚡ YOLO Auto-Answer
Three automation levels:
- **Manual** — you confirm everything
- **Safe** — auto-approve, block risky ops
- **Full-Auto** — approve everything automatically

</td>
<td width="50%">

### 🖥️ Multi-Pane Grid
Configurable matrix layout from 1×1 to 4×4. CSS Grid ensures stable rendering — no flashing when adding or removing panes. Overflow auto-expands rows.

### 🤖 AI Agent Support
First-class support for Claude Code and Codex. Also spawns any shell variant: CMD, PowerShell, Git Bash, or WSL.

### 🔍 Smart Detection
Detects confirm prompts, task completion, errors, and idle timeouts. Status badges update in real-time.

### 💾 Session Persistence
Pane configurations survive app restarts. Adapter credentials are stored locally.

</td>
</tr>
</table>

## Quick Start

```bash
# Clone and install
git clone https://github.com/haibindev/EasyAgentCli.git
cd EasyAgentCli
npm install

# Development
npm run dev

# Production build
npm run build
```

> **Requirements:** Node.js 18+, npm. Electron binary is downloaded automatically.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | New Claude Code pane |
| `Ctrl+Shift+X` | New Codex pane |
| `Ctrl+Shift+S` | New Shell pane |
| `Ctrl+Shift+R` | Restart active pane |
| `Ctrl+Tab` | Next pane |
| `Ctrl+Shift+Tab` | Previous pane |
| `Ctrl+W` | Close active pane |

## Remote Control

### Leave Mode

Click **"🚶 Leave Mode"** in the toolbar. Terminal events are forwarded to all connected IM adapters. You can approve, reject, or send commands from your phone.

### Supported Adapters

| Adapter | Connection | Auth |
|---------|------------|------|
| **Feishu** | WebSocket (no public URL needed) | App ID + App Secret |
| **Discord** | Gateway connection | Bot Token |
| **Telegram** | Long-polling (no webhook needed) | Bot Token (@BotFather) |
| **Openclaw** | WebSocket client → relay server | Relay URL |

Configure adapters via the ⚙ button in the toolbar.

### Remote Commands

| Command | Description |
|---------|-------------|
| `/panes` | List all terminals |
| `/use <id>` | Switch active terminal |
| `/screen` | 60-line screen snapshot |
| `/log [n]` | Last n lines (default 20) |
| `/yolo [off\|safe\|full]` | View/set automation level |
| `y` or `同意` | Confirm current action |
| `n` or `拒绝` | Reject current action |
| *other text* | Send directly to terminal |

## Architecture

```
Electron Main Process
├── index.ts              → Window, IPC, adapter lifecycle
├── pty-manager.ts        → PTY spawn/restart/kill, event detection
└── bridge/
    ├── analyzer.ts       → Terminal output pattern matching
    ├── server.ts         → WebSocket server (:18765)
    ├── discovery.ts      → UDP multicast (:18766)
    ├── message-router.ts → Command parsing, event routing
    └── adapters/
        ├── feishu.ts     → Feishu Bot (@larksuiteoapi/node-sdk)
        ├── discord.ts    → Discord Bot (discord.js)
        ├── telegram.ts   → Telegram Bot (HTTP long-polling)
        └── openclaw.ts   → Openclaw WebSocket relay

Renderer (React + xterm.js)
├── App.tsx               → Grid layout, state management
├── components/
│   ├── Toolbar.tsx       → Add pane, layout selector, settings
│   ├── TerminalPane.tsx  → xterm.js terminal wrapper
│   ├── StatusBar.tsx     → Pane status, bridge info
│   ├── NewPaneDialog.tsx → Pane creation dialog
│   └── AdapterSettings.tsx → IM adapter configuration
└── types.ts
```

## Tech Stack

| Category | Technology |
|----------|-----------|
| Desktop | Electron 41 |
| UI | React 18 + TypeScript |
| Terminal | xterm.js |
| PTY | node-pty (prebuilt binaries) |
| Build | electron-vite |
| WebSocket | ws |
| Feishu | @larksuiteoapi/node-sdk |
| Discord | discord.js |
| Telegram | Bot API (zero dependencies) |

## Contributing

Contributions are welcome! Feel free to:

- Open an [issue](https://github.com/haibindev/EasyAgentCli/issues) to report bugs or suggest features
- Submit a pull request
- Star the project to show your support

## License

MIT © [haibindev](https://github.com/haibindev)

---

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=haibindev/EasyAgentCli&type=Date)](https://star-history.com/#haibindev/EasyAgentCli&Date)

</div>
