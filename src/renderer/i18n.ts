const LANG_KEY = 'eac:lang'

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
  settingsTitle: '远程适配器设置',
  leaveModeActive: '🚶 离开中',
  leaveModeInactive: '🚶 离开模式',

  // StatusBar
  statusRunning: '运行中',
  statusIdle: '空闲',
  statusConfirm: '等待确认',
  statusDone: '已完成',
  statusError: '错误',
  remoteConnections: (n: number) => `${n} 个远程连接`,
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
  notifySettingsTitle: '通知策略',
  heartbeatInterval: '心跳间隔',
  idleInterval: '静默提醒',
  minutes: '分钟',

  // ErrorBoundary
  componentError: '组件出错',
  retry: '重试',

  // LeaveBanner
  leaveBannerText: '离开模式已开启 — 事件将通过远程桥接转发',

  // Language
  langLabel: '中/EN',
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
  settingsTitle: 'Remote Adapter Settings',
  leaveModeActive: '🚶 Leaving',
  leaveModeInactive: '🚶 Leave Mode',

  // StatusBar
  statusRunning: 'Running',
  statusIdle: 'Idle',
  statusConfirm: 'Waiting',
  statusDone: 'Done',
  statusError: 'Error',
  remoteConnections: (n: number) => `${n} remote conn.`,
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
  notifySettingsTitle: 'Notification Strategy',
  heartbeatInterval: 'Heartbeat interval',
  idleInterval: 'Idle alert',
  minutes: 'min',

  // ErrorBoundary
  componentError: 'Component Error',
  retry: 'Retry',

  // LeaveBanner
  leaveBannerText: 'Leave mode active — events forwarded via remote bridge',

  // Language
  langLabel: '中/EN',
}

const translations = { zh, en }

export type Translations = typeof zh

export function getTranslations(lang: Lang): Translations {
  return translations[lang]
}
