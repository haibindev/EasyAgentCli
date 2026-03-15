# EasyAgentCli 设计文档

## 项目定位

一个**自定义终端应用**，像 Windows Terminal 一样平铺多个终端面板，但内置远程接管能力。
平时坐在 Win11 前正常使用，离开时一键开启"离开模式"，通过飞书（经 Win10 Openclaw）远程控制。

---

## 核心理念

- **终端即 Bridge**：终端本身持有所有 PTY 句柄，天然可以注入输入，不需要额外代理层
- **飞书是应急通道**：不是实时终端，只发三类消息（需要确认 / 任务完成 / 卡住超时）
- **自动发现连接**：同局域网或 Tailscale 下，两端自动发现，无需配置 IP

---

## 整体架构

```
Win11：EasyAgentCli（Electron 桌面应用）
├── 多 PTY 会话管理（node-pty）
├── 终端 UI（xterm.js 平铺面板）
├── Bridge 服务（离开模式时启动）
│   ├── WebSocket Server (:18765/sync)
│   └── mDNS 广播（UDP multicast）
└── OutputAnalyzer（关键事件提取）

        ↕ Tailscale / 局域网（自动发现）

Win10 WSL：Openclaw + agent-bridge plugin（TypeScript）
├── mDNS 监听（自动发现 Win11）
├── WebSocket Client（自动重连）
└── 飞书消息路由（挂载在 Openclaw 现有飞书 Bot 上）

        ↕ 飞书

手机
```

---

## 技术栈

| 层 | 技术 | 原因 |
|---|---|---|
| 桌面框架 | **Electron** | node-pty 原生模块直接用，无需 IPC 绕行 |
| 终端渲染 | **xterm.js** | VS Code 同款，完整支持 256色/ink/动画 |
| PTY 管理 | **node-pty** | Windows 调 conpty，和 Windows Terminal 同一底层 |
| Agent SDK | **@anthropic-ai/claude-code** | Claude Code 官方 SDK，结构化事件流 |
| Codex 控制 | node-pty（PTY）| Codex 无 SDK，只能 PTY |
| 语言 | **TypeScript** | 全栈统一，SDK/node-pty/xterm.js 全在 JS 生态 |
| Openclaw 插件 | TypeScript | Openclaw 本身是 TS，插件同语言 |

---

## 文件结构

```
EasyAgentCli/
├── DESIGN.md                  # 本文件
├── package.json
├── electron/
│   ├── main.ts                # Electron 主进程入口
│   ├── pty-manager.ts         # 多 PTY 会话管理
│   ├── bridge/
│   │   ├── server.ts          # WebSocket 服务端 + HTTP API
│   │   ├── discovery.ts       # mDNS UDP multicast 广播
│   │   └── analyzer.ts        # 输出事件提取（极保守模式）
│   └── preload.ts             # Electron preload
├── renderer/
│   ├── index.html
│   ├── app.tsx                # 根组件，平铺布局
│   ├── Pane.tsx               # 单个终端面板（xterm.js）
│   ├── Toolbar.tsx            # 顶部工具栏
│   └── StatusBar.tsx          # 状态栏（连接状态、pane 状态）
└── openclaw-plugin/           # Win10 侧 Openclaw 插件
    ├── package.json
    ├── src/
    │   ├── index.ts           # 插件入口，注册到 Openclaw
    │   ├── discovery.ts       # mDNS 监听，发现 Win11 bridge
    │   ├── bridge-client.ts   # WebSocket 客户端，自动重连
    │   └── commands.ts        # 飞书指令处理
    └── README.md
```

---

## PTY 管理（pty-manager.ts）

```typescript
import * as pty from 'node-pty';

interface Pane {
  id: string;
  pty: pty.IPty;
  ring: string[];        // 最近 2000 行纯文本
  type: 'claude' | 'codex' | 'shell';
  yoloLevel: 'off' | 'safe' | 'full';
  wsSubscribers: Set<WebSocket>;
}

class PtyManager {
  panes = new Map<string, Pane>();

  create(id: string, type: Pane['type'], cwd: string): Pane {
    const { cmd, args } = this.resolveCmd(type);
    const p = pty.spawn(cmd, args, {
      cols: 220, rows: 50, cwd,
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    const pane: Pane = { id, pty: p, ring: [], type, yoloLevel: 'off', wsSubscribers: new Set() };
    this.panes.set(id, pane);

    p.onData(data => {
      // 1. 原始数据 → 所有本地 xterm.js（保留颜色）
      pane.wsSubscribers.forEach(ws => ws.send(data));

      // 2. 清洗后存入 ring
      const lines = stripAnsi(data).split('\n');
      pane.ring.push(...lines);
      if (pane.ring.length > 2000)
        pane.ring.splice(0, pane.ring.length - 2000);

      // 3. 分析关键事件
      analyzer.feed(pane, stripAnsi(data));
    });

    return pane;
  }

  private resolveCmd(type: Pane['type']) {
    switch (type) {
      case 'claude': return { cmd: 'claude', args: [] };
      case 'codex':  return { cmd: 'codex',  args: [] };
      case 'shell':  return { cmd: 'cmd.exe', args: [] };
    }
  }

  inject(id: string, text: string) {
    this.panes.get(id)?.pty.write(text);
  }

  snapshot(id: string): string[] {
    return this.panes.get(id)?.ring.slice(-60) ?? [];
  }

  setYolo(id: string, level: Pane['yoloLevel']) {
    const pane = this.panes.get(id);
    if (!pane) return;

    if (level === 'full' && pane.yoloLevel !== 'full') {
      // full 模式需要重启进程带参数
      this.restart(id, { fullAuto: true });
      return;
    }
    pane.yoloLevel = level;
  }

  private restart(id: string, opts: { fullAuto: boolean }) {
    const pane = this.panes.get(id)!;
    const cwd = pane.pty.process;  // 记录 cwd
    pane.pty.kill();

    const args = opts.fullAuto
      ? pane.type === 'claude' ? ['--dangerously-skip-permissions'] : ['--approval-mode', 'full-auto']
      : [];

    // 重建 pane，保留 id
    // 注意：会丢失当前对话上下文
    this.create(id, pane.type, cwd);
  }
}
```

---

## OutputAnalyzer（极保守模式）

只推三类事件，其余全部静默：

```typescript
const PATTERNS = {
  confirm: /Run \d+ shell command|Allow|Continue\?|>\s*Yes\s*\/\s*No|\(y\/n\)/i,
  done:    /✓\s+.+|^Task complete|^Done\b/m,
  error:   /^Error:|^Failed:|✗\s+/m,
};

const RISK = {
  high:   /rm\s+-|drop\s+|git\s+push|sudo|format|truncate|delete/i,
  medium: /bash|shell|execute|run\s+command/i,
};

class OutputAnalyzer {
  private quietTimer: NodeJS.Timeout | null = null;
  private notifiedIdle = false;
  private QUIET_THRESHOLD = 15 * 60 * 1000;  // 15 分钟

  feed(pane: Pane, text: string) {
    // 重置静默计时器
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.notifiedIdle = false;

    // 确认提示
    if (PATTERNS.confirm.test(text)) {
      const answer = this.autoAnswer(pane, text);
      if (answer !== null) {
        setTimeout(() => pane.pty.write(answer + '\r'), 300);
      } else {
        this.pushEvent(pane, 'confirm', text);
      }
      return;
    }

    // 任务完成 / 报错
    if (PATTERNS.done.test(text)) {
      this.pushEvent(pane, 'done', this.buildSummary(pane));
      return;
    }
    if (PATTERNS.error.test(text)) {
      this.pushEvent(pane, 'error', text);
      return;
    }

    // 静默超时（只推一次）
    this.quietTimer = setTimeout(() => {
      if (!this.notifiedIdle) {
        this.pushEvent(pane, 'idle', '已静默 15 分钟，回复 /screen 查看状态');
        this.notifiedIdle = true;
      }
    }, this.QUIET_THRESHOLD);
  }

  private autoAnswer(pane: Pane, text: string): string | null {
    if (pane.yoloLevel === 'off') return null;
    if (pane.yoloLevel === 'full') return 'y';
    // safe 模式：高危/中危仍推飞书
    if (RISK.high.test(text) || RISK.medium.test(text)) return null;
    return 'y';
  }

  private pushEvent(pane: Pane, type: string, content: string) {
    // 推给所有监听的 WebSocket 客户端（Win10 Openclaw）
    pane.pendingEvent = { type, content, time: Date.now() };
  }

  private buildSummary(pane: Pane): string {
    const key = pane.ring.slice(-200).filter(l =>
      /✓|✗|Created|Updated|Wrote|Error|Failed|Test/.test(l)
    );
    return key.slice(-10).join('\n') || pane.ring.slice(-5).join('\n');
  }
}
```

---

## 自动发现连接（Discovery）

基于 UDP multicast，局域网和 Tailscale 网络均适用（Tailscale 支持 multicast）。

```
MULTICAST_ADDR = 239.255.42.99
DISCOVERY_PORT = 18766
WS_PORT        = 18765
```

**Win11 bridge 广播：**
```typescript
// 每 5 秒发一次
const msg = { role: 'bridge', id: uuid, name: 'EasyAgentCli', wsPort: 18765 };
socket.send(JSON.stringify(msg), DISCOVERY_PORT, MULTICAST_ADDR);
```

**Win10 Openclaw 插件监听：**
```typescript
// 收到 bridge 广播 → 建立 WebSocket 连接
socket.on('message', (data, rinfo) => {
  const info = JSON.parse(data);
  if (info.role === 'bridge' && !seen.has(info.id)) {
    seen.add(info.id);
    bridgeClient.connect(`ws://${rinfo.address}:${info.wsPort}/sync`);
  }
});
```

**连接可靠性：**
- 断线自动重连，指数退避（2s → 4s → 8s → 最多 30s）
- WebSocket ping/pong 心跳，30 秒一次
- Win11 重启后重新广播，Win10 检测到新 id 重连

---

## WebSocket 协议

```typescript
// Bridge → Client（Win11 推 Win10）
{ type: 'event',    paneId, event: { type: 'confirm'|'done'|'error'|'idle', content } }
{ type: 'panes',    panes: [{ id, type, yoloLevel, status }] }
{ type: 'snapshot', paneId, lines: string[] }
{ type: 'output',   paneId, lines: string[], cursor: number }

// Client → Bridge（Win10 发 Win11）
{ type: 'input',    paneId, text }
{ type: 'yolo',     paneId, level: 'off'|'safe'|'full' }
{ type: 'leave',    paneId, enabled: boolean }
{ type: 'snapshot', paneId }
{ type: 'output',   paneId, cursor: number }
```

---

## 飞书指令（Openclaw 插件侧）

```
/panes           列出所有 pane 和状态
/use <id>        切换当前操作的 pane
/screen          当前屏幕快照（最近 60 行）
/log [n]         最近 n 行（默认 50）
/yolo on         safe 模式（低危自动通过）
/yolo full       全自动（重启进程带参数）
/yolo off        关闭

同意 / y         发送确认
拒绝 / n         发送拒绝

其他文字         直接发给当前 pane 的 PTY
```

**飞书消息频率设计（极保守）：**
- 出门时只发一条："🚶 离开模式已开启"
- 途中：需要确认 / 任务完成 / 卡住超时 才发消息
- 静默超时只推一次，不重复打扰
- 用户主动发 /screen /log 才返回内容

---

## GUI 规划

```
┌─────────────────────────────────────────┐
│  [+ Claude] [+ Codex] [+ Shell]  [🚶离开模式]  │  ← Toolbar
├──────────────────┬──────────────────────┤
│                  │                      │
│  Claude Code     │  Codex               │  ← 平铺终端面板
│  (xterm.js)      │  (xterm.js)          │
│                  │                      │
├──────────────────┴──────────────────────┤
│  claude-1: 运行中  codex-1: 等待确认  🔗已连接  │  ← StatusBar
└─────────────────────────────────────────┘
```

- 平铺布局，可调整比例，可新增/关闭面板
- Toolbar：新建 pane 按钮 + 离开模式开关
- StatusBar：每个 pane 状态 + Win10 连接状态（🔗已连接 / ⚠️未连接）
- 离开模式开启时顶部显示橙色提示条

---

## Claude Code vs Codex 控制方式

| | Claude Code | Codex |
|---|---|---|
| 控制方式 | **SDK**（`@anthropic-ai/claude-code`） | **PTY**（node-pty） |
| 结构化输出 | ✅ 有（事件流） | ❌ 无（终端字符流） |
| 全自动参数 | `--dangerously-skip-permissions` | `--approval-mode full-auto` |
| 多 Agent 能力 | ✅ SDK 完整保留 | — |
| 嵌套交互 | SDK 层处理，外部透明 | PTY 层无法处理，靠 full-auto 规避 |

---

## 实现顺序

1. **Electron 壳 + 单个 xterm.js + node-pty**：跑通一个终端面板，验证体验
2. **多 pane 平铺布局**：左右/上下分割，可调整
3. **PtyManager**：统一管理多个 PTY 实例
4. **Bridge WebSocket 服务端**：`/sync` 端点，接受连接
5. **Discovery UDP multicast**：广播自己
6. **Openclaw 插件**：发现 + 连接 + 飞书指令路由
7. **OutputAnalyzer**：极保守模式，只推三类事件
8. **离开模式 UI**：Toolbar 开关 + 顶部提示条
9. **Yolo 模式**：safe（PTY 层自动 y）+ full（重启进程带参数）

---

## 参考项目

| 项目 | 用途 |
|---|---|
| [Hyper](https://github.com/vercel/hyper) | Electron + xterm.js + node-pty 终端，同技术栈参考 |
| [CodePilot](https://github.com/op7418/CodePilot) | Claude Code 桌面 wrapper，架构参考 |
| [Claude-to-IM](https://github.com/op7418/Claude-to-IM) | 飞书桥接库，消息分片/去重/重试 |
| [cc-connect](https://github.com/chenhg5/cc-connect) | PTY 层实现参考（Go） |
| [xzq-xu/openclaw-plugin-feishu](https://github.com/xzq-xu/openclaw-plugin-feishu) | Openclaw 插件写法参考 |
