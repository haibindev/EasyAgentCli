const LANG_KEY = 'at:lang'

export type Lang = 'zh' | 'en'

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'zh') return saved
  } catch { /* ignore */ }
  // Default: detect from system
  const nav = navigator.language.toLowerCase()
  return nav.startsWith('zh') ? 'zh' : 'en'
}

export function setLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang)
}

// ── Translation strings ──

const zh = {
  // App
  appSubtitle: '多窗格 AI Agent 终端管理器',
  confirmClose: (title: string) => `"${title}" 正在运行中，确定关闭？`,
  emptySlot: '空位',
  overflowHint: (rows: number, cols: number) => `超出 ${rows}×${cols} 布局，已自动扩展`,

  // Toolbar
  leaveModeHint: '离开模式已开启 — 事件将通过远程通道转发',
  layoutLabel: '布局',
  layoutSlots: (n: number) => `${n}格`,
  settingsTitle: '设置',
  settingsLabel: '设置',
  leaveModeActive: '🚶 离开中',
  leaveModeInactive: '🚶 离开模式',

  // StatusBar
  statusRunning: '运行中',
  statusIdle: '空闲',
  statusConfirm: '等待确认',
  statusDone: '已完成',
  statusError: '错误',
  remoteConnections: (n: number) => `${n} 个远程连接`,
  adapterConnected: (names: string) => `${names} 已连接`,
  noRemoteConnection: '无远程连接',
  bridgeReady: 'Bridge 就绪',
  terminalCount: (n: number) => `${n} 个终端`,

  // TerminalPane
  processExited: (code: number) => `[进程已退出，代码: ${code}。按 ↻ 重启]`,
  doubleClickRename: '双击重命名',
  badgeConfirm: '需确认',
  badgeDone: '已完成',
  badgeError: '错误',
  badgeIdle: '空闲',
  yoloManual: '手动',
  restartTitle: '重启进程',
  closeTitle: '关闭',

  // NewPaneDialog
  newPaneTitle: (type: string) => `新建 ${type} 终端`,
  shellType: 'Shell 类型',
  workDir: '工作目录',
  workDirPlaceholder: '选择工作目录...',
  browse: '浏览...',
  cancel: '取消',
  create: '创建',
  bypassPermissions: '跳过权限确认',
  bypassHint: '启用后 Agent 将自动执行所有操作，无需确认',
  extraArgs: '额外参数',
  extraArgsHint: '附加到 CLI 命令的额外参数，例如 --model claude-opus-4-5',
  extraArgsPlaceholder: '例如：--model claude-opus-4-5',

  // AdapterSettings
  adapterDialogTitle: '远程适配器配置',
  feishuBot: '飞书 Bot',
  openclawRelay: 'Openclaw 中继',
  autoReconnect: '自动重连',
  configured: '已配置',
  connected: '已连接',
  connecting: '连接中',
  notConnected: '未连接',
  saving: '保存中...',
  saveConfig: '保存配置',
  close: '关闭',
  clickToEnable: '点击启用',
  clickToDisable: '点击停用',
  chatIdHint: 'Chat ID (可选，自动学习)',
  channelIdHint: 'Channel ID (可选，自动学习)',
  telegramTokenHint: 'Bot Token (从 @BotFather 获取)',
  fillConfigFirst: '请先填写配置',
  tabChannels: '通道配置',
  tabNotify: '通知策略',
  tabAutomation: '自动化',
  tabInterface: '界面',
  notifySettingsTitle: '通知策略',
  heartbeatInterval: '心跳间隔',
  idleInterval: '静默提醒',
  minutes: '分钟',
  notifyHint: '心跳：定时汇报终端最近输出摘要。静默：终端无输出超过此时长后发送提醒。',
  reorderOnClose: '关闭终端后自动重新编排',
  reorderOnCloseHint: '关闭后剩余终端自动填补空位，否则保持原来的位置',

  // AI Assist
  aiAssistTitle: 'AI 助手',
  aiSummary: '智能摘要',
  aiSummaryHint: '心跳/完成事件由 AI 生成摘要，替代原始终端输出',
  aiChat: 'AI 对话',
  aiChatHint: '无 # 前缀的普通消息将由 AI 回复（非指令对话）',
  aiAgent: '使用 Agent',
  tabShortcuts: '快捷键',
  tabAgents: 'Agent',
  agentsHint: '检测系统中已安装的 AI Agent CLI',
  agentsRefresh: '刷新',
  agentInstalled: '已安装',
  agentNotFound: '未检测到',
  shortcutRestart: '重启当前终端',
  shortcutNextPane: '切换到下一个终端',
  shortcutPrevPane: '切换到上一个终端',
  shortcutClosePane: '关闭当前终端',
  shortcutCopy: '复制选中文本',
  shortcutPaste: '粘贴（右键）',
  shortcutRename: '双击标签重命名',

  // Sidebar
  sidebarTitle: '终端',
  sidebarAdd: '新建终端',
  sidebarExpand: '展开侧边栏',
  sidebarCollapse: '收起',
  sidebarEmpty: '暂无终端',

  // ErrorBoundary
  componentError: '组件出错',
  retry: '重试',

  // LeaveBanner
  leaveBannerText: '离开模式已开启 — 事件将通过远程桥接转发',

  // Language
  langLabel: '界面语言',

  // Navigation
  back: '返回',
}

const en: typeof zh = {
  // App
  appSubtitle: 'Multi-Pane AI Agent Terminal Manager',
  confirmClose: (title: string) => `"${title}" is running. Close anyway?`,
  emptySlot: 'Empty',
  overflowHint: (rows: number, cols: number) => `Exceeds ${rows}×${cols} layout, auto-expanded`,

  // Toolbar
  leaveModeHint: 'Leave mode active — events forwarded to remote channels',
  layoutLabel: 'Layout',
  layoutSlots: (n: number) => `${n} slots`,
  settingsTitle: 'Settings',
  settingsLabel: 'Settings',
  leaveModeActive: '🚶 Leaving',
  leaveModeInactive: '🚶 Leave Mode',

  // StatusBar
  statusRunning: 'Running',
  statusIdle: 'Idle',
  statusConfirm: 'Waiting',
  statusDone: 'Done',
  statusError: 'Error',
  remoteConnections: (n: number) => `${n} remote conn.`,
  adapterConnected: (names: string) => `${names} connected`,
  noRemoteConnection: 'No remote conn.',
  bridgeReady: 'Bridge ready',
  terminalCount: (n: number) => `${n} terminals`,

  // TerminalPane
  processExited: (code: number) => `[Process exited, code: ${code}. Press ↻ to restart]`,
  doubleClickRename: 'Double-click to rename',
  badgeConfirm: 'Confirm',
  badgeDone: 'Done',
  badgeError: 'Error',
  badgeIdle: 'Idle',
  yoloManual: 'Manual',
  restartTitle: 'Restart process',
  closeTitle: 'Close',

  // NewPaneDialog
  newPaneTitle: (type: string) => `New ${type} Terminal`,
  shellType: 'Shell Type',
  workDir: 'Working Directory',
  workDirPlaceholder: 'Select working directory...',
  browse: 'Browse...',
  cancel: 'Cancel',
  create: 'Create',
  bypassPermissions: 'Bypass Permissions',
  bypassHint: 'Agent will execute all operations automatically without confirmation',
  extraArgs: 'Extra Args',
  extraArgsHint: 'Extra flags appended to the CLI command, e.g. --model claude-opus-4-5',
  extraArgsPlaceholder: 'e.g. --model claude-opus-4-5',

  // AdapterSettings
  adapterDialogTitle: 'Remote Adapter Settings',
  feishuBot: 'Feishu Bot',
  openclawRelay: 'Openclaw Relay',
  autoReconnect: 'Auto Reconnect',
  configured: 'Configured',
  connected: 'Connected',
  connecting: 'Connecting',
  notConnected: 'Not connected',
  saving: 'Saving...',
  saveConfig: 'Save Config',
  close: 'Close',
  clickToEnable: 'Click to enable',
  clickToDisable: 'Click to disable',
  chatIdHint: 'Chat ID (optional, auto-learned)',
  channelIdHint: 'Channel ID (optional, auto-learned)',
  telegramTokenHint: 'Bot Token (from @BotFather)',
  fillConfigFirst: 'Fill in config first',
  tabChannels: 'Channels',
  tabNotify: 'Notifications',
  tabAutomation: 'Automation',
  tabInterface: 'Interface',
  notifySettingsTitle: 'Notification Strategy',
  heartbeatInterval: 'Heartbeat interval',
  idleInterval: 'Idle alert',
  minutes: 'min',
  notifyHint: 'Heartbeat: periodic summary of recent terminal output. Idle: alert after prolonged silence.',
  reorderOnClose: 'Auto-reorder after closing',
  reorderOnCloseHint: 'Remaining terminals fill gaps automatically, otherwise keep original positions',

  // AI Assist
  aiAssistTitle: 'AI Assist',
  aiSummary: 'Smart Summary',
  aiSummaryHint: 'AI generates summaries for heartbeat/done events instead of raw output',
  aiChat: 'AI Chat',
  aiChatHint: 'Plain messages (no # prefix) are answered by AI',
  aiAgent: 'Agent',
  tabShortcuts: 'Shortcuts',
  tabAgents: 'Agents',
  agentsHint: 'Detected AI Agent CLIs on this system',
  agentsRefresh: 'Refresh',
  agentInstalled: 'Installed',
  agentNotFound: 'Not found',
  shortcutRestart: 'Restart current terminal',
  shortcutNextPane: 'Next terminal',
  shortcutPrevPane: 'Previous terminal',
  shortcutClosePane: 'Close current terminal',
  shortcutCopy: 'Copy selected text',
  shortcutPaste: 'Paste (right-click)',
  shortcutRename: 'Double-click tab to rename',

  // Sidebar
  sidebarTitle: 'Terminals',
  sidebarAdd: 'New Terminal',
  sidebarExpand: 'Expand sidebar',
  sidebarCollapse: 'Collapse',
  sidebarEmpty: 'No terminals',

  // ErrorBoundary
  componentError: 'Component Error',
  retry: 'Retry',

  // LeaveBanner
  leaveBannerText: 'Leave mode active — events forwarded via remote bridge',

  // Language
  langLabel: 'Language',

  // Navigation
  back: 'Back',
}

const translations = { zh, en }

export type Translations = typeof zh

export function getTranslations(lang: Lang): Translations {
  return translations[lang]
}
