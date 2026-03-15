<div align="center">

# EasyAgentCli

**Run Claude Code, Codex, and Shell sessions side by side.**

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A multi-pane terminal manager built for AI-powered development workflows.
Manage multiple agent sessions in a configurable grid layout, with remote control via Feishu, Discord, Telegram, or Openclaw.

[中文说明](README_CN.md)

</div>

---

## Why EasyAgentCli?

Modern AI coding assistants run in terminals — but juggling multiple sessions across tabs gets messy fast. EasyAgentCli gives you a **single window** where all your agents live side by side, with smart automation and remote monitoring built in.

- Launch **Claude Code**, **Codex**, or plain **Shell** sessions in one click
- Arrange them in a **matrix grid** (1×1 up to 4×4) — no manual resizing needed
- Let **YOLO auto-answer** handle confirmations while you focus on what matters
- Walk away and monitor everything from **Feishu / Discord / Telegram / Openclaw** on your phone

## Preview

```
┌─────────────────────────────────────────────────────────────┐
│  [+Claude] [+Codex] [+Shell]   ⚙  Layout[2×2]  🚶Leave    │
├──────────────────────┬──────────────────────────────────────┤
│ ▌Claude #1     ~/prj │ ▌Codex #2    ~/other   [↻] [×]     │
│  $ claude            │  $ codex                            │
│  > Working on...     │  > Analyzing...                     │
├──────────────────────┼──────────────────────────────────────┤
│ ▌Shell #3    ~/work  │           Empty Slot                 │
│  $ git status        │   [● Claude] [● Codex] [● Shell]    │
│  On branch main...   │                                     │
├──────────────────────┴──────────────────────────────────────┤
│ Claude #1: running  Codex #2: waiting   🔌 Bridge  3 panes │
└─────────────────────────────────────────────────────────────┘
```

## Features

<table>
<tr>
<td width="50%">

### 🖥️ Multi-Pane Grid
Configurable matrix layout from 1×1 to 4×4. CSS Grid ensures stable rendering — no flashing when adding or removing panes. Overflow auto-expands rows.

### 🤖 AI Agent Support
First-class support for Claude Code and Codex. Also spawns any shell variant: CMD, PowerShell, Git Bash, or WSL.

### ⚡ YOLO Auto-Answer
Three automation levels:
- **Manual** — you confirm everything
- **Safe** — auto-approve, block risky ops
- **Full-Auto** — approve everything automatically

</td>
<td width="50%">

### 📡 Remote Control
Walk away from your desk. Terminal events (confirmations, completions, errors) are forwarded to your IM. Reply to approve, reject, or send commands.

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

## License

MIT © [haibindev](https://github.com/haibindev)
