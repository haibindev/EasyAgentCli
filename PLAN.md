# EasyAgentCli 实现计划

## 设计研判与优化

### 原始设计评估
DESIGN.md 设计整体合理，以下几点需优化：

### 优化决策

1. **GUI 布局增强**
   - 原设计：简单左右分栏
   - 优化：使用 `react-resizable-panels` 实现动态可拖拽分栏，支持任意数量 pane
   - 每个 pane 头部显示：类型图标 + 标题 + 工作目录 + Yolo 模式选择 + 关闭按钮
   - pane 头部以颜色条区分类型（Claude=绿色, Codex=蓝色, Shell=灰色）

2. **多实例场景**
   - 不同终端可能运行相同或不同的 agent CLI（Claude Code / Codex / Shell）
   - 工作目录可能相同或不同
   - 新建 pane 时弹出对话框让用户选择类型和工作目录
   - pane 头部始终显示 cwd（缩短显示），便于区分

3. **空状态引导**
   - 首次启动无 pane 时显示欢迎页，引导用户创建第一个 pane

4. **Windows 兼容**
   - node-pty 在 Windows 上使用 conpty
   - Claude Code CLI 在 Windows 上为 `claude` 命令
   - Shell 默认使用 `cmd.exe`（可配置 PowerShell/Git Bash）
   - spawn PTY 时清除 `CLAUDECODE` 等环境变量，避免嵌套检测

5. **Bridge 始终监听**
   - WebSocket 服务端始终运行在 18765 端口
   - 离开模式只控制是否通过 mDNS 广播和转发事件
   - 便于调试和远程连接

---

## 技术架构

```
Electron Main Process (Node.js)
├── index.ts          → 窗口创建、IPC handler 注册
├── pty-manager.ts    → PTY 生命周期、EventEmitter 推送事件
└── bridge/
    ├── analyzer.ts   → 终端输出事件检测（confirm/done/error/idle）
    ├── server.ts     → WebSocket 服务端(:18765)
    └── discovery.ts  → UDP multicast 广播(:18766)

Preload (contextBridge)
└── index.ts          → 暴露 window.api（IPC 桥接）

Renderer (React + Vite)
├── App.tsx           → 根组件，全局状态管理
├── components/
│   ├── Toolbar.tsx       → 顶部工具栏
│   ├── TerminalPane.tsx  → xterm.js 终端面板
│   ├── StatusBar.tsx     → 底部状态栏
│   ├── LeaveBanner.tsx   → 离开模式横幅
│   └── NewPaneDialog.tsx → 新建 pane 对话框
└── types.ts / env.d.ts
```

### IPC API

**请求-响应（ipcMain.handle）：**
| Channel | 参数 | 返回 |
|---|---|---|
| `pane:create` | `{ type, cwd }` | `PaneInfo` |
| `pane:close` | `id` | void |
| `pane:write` | `{ id, text }` | void |
| `pane:resize` | `{ id, cols, rows }` | void |
| `pane:list` | - | `PaneInfo[]` |
| `pane:setYolo` | `{ id, level }` | void |
| `pane:rename` | `{ id, title }` | void |
| `pane:restart` | `id` | `PaneInfo` |
| `bridge:setLeaveMode` | `boolean` | void |
| `bridge:getStatus` | - | `BridgeStatus` |

**推送事件（webContents.send）：**
| Channel | 数据 |
|---|---|
| `pane:output` | `{ id, data }` |
| `pane:event` | `{ id, event: { type, content, time } }` |
| `pane:listUpdate` | `PaneInfo[]` |
| `bridge:status` | `BridgeStatus` |

---

## 文件清单与进度

### 阶段 1：项目配置 ✅
- [x] `package.json` — 依赖定义
- [x] `electron.vite.config.ts` — 构建配置
- [x] `tsconfig.json` — 根配置
- [x] `tsconfig.node.json` — Main/Preload TS 配置
- [x] `src/renderer/tsconfig.json` — Renderer TS 配置
- [x] `.gitignore`

### 阶段 2：Main 进程 + Preload ✅
- [x] `src/main/index.ts` — Electron 主入口
- [x] `src/main/pty-manager.ts` — PTY 管理器
- [x] `src/preload/index.ts` — IPC 桥接

### 阶段 3：Bridge 模块 ✅
- [x] `src/main/bridge/analyzer.ts` — 输出事件分析
- [x] `src/main/bridge/server.ts` — WebSocket 服务端
- [x] `src/main/bridge/discovery.ts` — mDNS 发现

### 阶段 4：Renderer GUI ✅
- [x] `src/renderer/index.html` — HTML 入口
- [x] `src/renderer/main.tsx` — React 入口
- [x] `src/renderer/types.ts` — 类型定义
- [x] `src/renderer/env.d.ts` — window.api 声明
- [x] `src/renderer/App.tsx` — 根组件
- [x] `src/renderer/App.css` — 全局样式
- [x] `src/renderer/components/Toolbar.tsx`
- [x] `src/renderer/components/TerminalPane.tsx`
- [x] `src/renderer/components/StatusBar.tsx`
- [x] `src/renderer/components/LeaveBanner.tsx`
- [x] `src/renderer/components/NewPaneDialog.tsx`

### 阶段 5：安装与测试 ✅
- [x] `npm install`
- [x] node-pty 使用预编译二进制，无需 electron-rebuild
- [x] `npm run dev` 启动测试
- [x] 修复 process.cwd() renderer 崩溃
- [x] 修复 CLAUDECODE 环境变量导致 Claude Code 拒绝启动

### 阶段 6：功能完善 ✅
- [x] **Pane 内重启** — 在 pane header 添加重启按钮，重启 claude/codex/shell 进程
- [x] **UI 细节优化**
  - [x] Pane header 标题字体调大
  - [x] 新建对话框工作目录输入框字体统一
  - [x] 终端滚动条样式适配深色主题
- [x] **Shell 类型扩展** — 支持 PowerShell / Git Bash / WSL
- [x] **记住上次工作目录** — localStorage 持久化
- [x] **键盘快捷键增强** — Ctrl+Tab 切换 pane、Ctrl+W 关闭
- [x] **ErrorBoundary** — React ErrorBoundary 防止单 pane 崩溃影响全局
- [x] **safeSend 防护** — 窗口关闭后不再向已销毁 BrowserWindow 发送消息
- [x] **PTY 重启修复** — ptyGeneration 计数器防止旧 onExit 覆盖新状态
- [x] **ID 碰撞修复** — 全局 nextId 计数器防止不同 shell 类型 ID 冲突

### 阶段 7：稳定性 ✅
- [x] PTY 进程退出后 pane 状态正确更新
- [x] 窗口关闭时保存/恢复 pane 配置（session persistence）
- [x] 错误边界（React ErrorBoundary）防止单 pane 崩溃影响全局

### 阶段 8：UX 增强 ✅
- [x] **内联重命名** — 双击 pane 标题即可重命名
- [x] **关闭确认** — 运行中的 pane 关闭前弹出确认对话框
- [x] **StatusBar 交互** — 点击底部状态栏切换 pane，显示标题而非 ID
- [x] **事件徽章** — pane 头部显示 confirm/done/error/idle 状态标签
- [x] **自动聚焦** — 激活 pane 时自动聚焦终端
- [x] **关闭后自动切换** — 关闭 pane 后自动激活相邻 pane

### 阶段 9：远程桥接 🔧（当前）
- [ ] Openclaw 插件实现（Win10 侧飞书指令路由）
- [x] Bridge 连接状态实时更新（WebSocket client connect/disconnect 推送到 renderer）
- [ ] 飞书消息分片/去重

---

## GUI 最终布局设计

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠ 离开模式已开启 — 事件将通过飞书转发                        │  ← LeaveBanner（仅离开模式显示，琥珀色）
├─────────────────────────────────────────────────────────────┤
│  [+ Claude] [+ Codex] [+ Shell]            [🚶 离开模式]    │  ← Toolbar（深色背景）
├────────────────────────┬────────────────────────────────────┤
│ ▌Claude #1       ~/prj │ ▌Codex #1    ~/other  [↻] [×]    │  ← Pane 头（类型色条 + 标题 + cwd + 重启 + 关闭）
│ 手动 ▾                 │ Safe ▾                            │  ← Yolo 选择器
├────────────────────────┤────────────────────────────────────┤
│                        │                                    │
│  $ claude              │  $ codex                           │  ← xterm.js 终端区
│  ...                   │  ...                               │
│                        │                                    │
│                        │                                    │
├────────────────────────┴────────────────────────────────────┤
│ claude-1: ▶运行中  codex-1: ⚠等待确认     🔗 1 个远程连接   │  ← StatusBar
└─────────────────────────────────────────────────────────────┘
```

**配色方案（深色终端主题）：**
- 背景：`#0d1117`
- 面板头：`#161b22`
- 边框：`#30363d`
- 文字：`#c9d1d9`
- Claude 色条：`#2ea043`（绿）
- Codex 色条：`#388bfd`（蓝）
- Shell 色条：`#6e7681`（灰）
- 离开模式横幅：`#e3b341`（琥珀）
- 错误：`#f85149`（红）
