import type { PtyManager, PaneInfo } from '../pty-manager'
import { callAgentOnce, type AiConfig, DEFAULT_AI_CONFIG } from '../ai-service'

/** Structured event for IM adapters (cards / rich messages) */
export type PaneEventType = 'confirm' | 'done' | 'error' | 'idle' | 'heartbeat' | 'exit'

export interface PaneEvent {
  type: PaneEventType
  paneId: string
  paneIndex: number      // 1-based
  paneTitle: string
  content: string
  time: number
  exitCode?: number      // only for 'exit'
}

/** Command parsed from user input */
export interface ParsedCommand {
  type: 'panes' | 'use' | 'screen' | 'log' | 'yolo' | 'yes' | 'no' | 'input' | 'help' | 'unknown'
  args: string[]
  targetPane?: string  // pane ID for indexed replies like "1y"
}

/** Adapter interface for IM platforms */
export interface MessageAdapter {
  readonly name: string
  sendText(text: string): Promise<void>
  sendEvent?(event: PaneEvent): Promise<void>
  /** Send a status overview when leave mode is toggled (card format preferred) */
  sendStatusSummary?(panes: PaneInfo[], entering: boolean): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  isConnected(): boolean
}

export type OnMessageCallback = (adapterName: string, text: string) => void

export class MessageRouter {
  private adapters = new Map<string, MessageAdapter>()
  private activePane: string | null = null
  private lastConfirmPane: string | null = null  // most recent pane that requested confirmation
  private leaveMode = false
  private aiConfig: AiConfig = { ...DEFAULT_AI_CONFIG }

  constructor(private ptyManager: PtyManager) {}

  setAiConfig(config: AiConfig): void {
    this.aiConfig = config
  }

  addAdapter(adapter: MessageAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  removeAdapter(name: string): void {
    this.adapters.delete(name)
  }

  setLeaveMode(enabled: boolean): void {
    this.leaveMode = enabled
    if (enabled) this.broadcastLeaveStatus(true)
  }

  /** Called when a terminal event occurs (confirm/done/error/idle/heartbeat) */
  async dispatchEvent(paneId: string, event: { type: string; content: string; time: number }): Promise<void> {
    if (!this.leaveMode) return

    const pane = this.ptyManager.list().find(p => p.id === paneId)
    const idx = this.ptyManager.paneIndex(paneId)
    const title = pane?.title ?? paneId

    if (event.type === 'confirm') {
      this.lastConfirmPane = paneId
    }

    // Optionally replace raw content with AI-generated summary
    let content = event.content
    if (
      this.aiConfig.summaryEnabled &&
      (event.type === 'heartbeat' || event.type === 'done' || event.type === 'idle')
    ) {
      const snapshot = this.ptyManager.snapshot(paneId).slice(-20).join('\n')
      if (snapshot) {
        const prompt =
          `请用1-3句话简洁总结以下AI终端的工作进展（不超过150字）。` +
          `只输出摘要文字，不要额外解释：\n\n${snapshot}`
        const summary = await callAgentOnce(this.aiConfig.agent, prompt)
        if (summary) content = summary
      }
    }

    await this.broadcastEvent({
      type: event.type as PaneEventType,
      paneId,
      paneIndex: idx,
      paneTitle: title,
      content,
      time: event.time,
    })
  }

  /** Called when a PTY process exits */
  async dispatchExit(paneId: string, exitCode: number): Promise<void> {
    if (!this.leaveMode) return

    const pane = this.ptyManager.list().find(p => p.id === paneId)
    const idx = this.ptyManager.paneIndex(paneId)
    const title = pane?.title ?? paneId

    await this.broadcastEvent({
      type: 'exit',
      paneId,
      paneIndex: idx,
      paneTitle: title,
      content: `进程退出 (code: ${exitCode})`,
      time: Date.now(),
      exitCode,
    })
  }

  /** Handle incoming user message from any adapter */
  async handleMessage(adapterName: string, text: string): Promise<void> {
    const adapter = this.adapters.get(adapterName)
    const cmd = this.parseCommand(text.trim())

    // Terminal input (# prefix) requires leave mode; slash commands always work
    if (!this.leaveMode && (cmd.type === 'input' || cmd.type === 'yes' || cmd.type === 'no')) {
      if (adapter) {
        await adapter.sendText('💡 当前未开启离开模式，终端输入不会被处理。请在 EasyAgentCli 中开启「离开模式」后重试。\n📖 输入 /help 查看可用命令')
      }
      return
    }

    // Plain message (no # or / prefix) → AI chat if enabled
    if (cmd.type === 'unknown') {
      const trimmed = text.trim()
      if (this.aiConfig.chatEnabled && trimmed.length > 0 && adapter) {
        const prompt = this.buildAiChatPrompt(trimmed)
        const reply = await callAgentOnce(this.aiConfig.agent, prompt)
        if (reply) await adapter.sendText(reply)
      }
      return
    }

    const response = await this.executeCommand(cmd)
    if (adapter && response) {
      await adapter.sendText(response)
    }
  }

  /** Build a context-aware prompt for AI chat replies */
  private buildAiChatPrompt(userMessage: string): string {
    const panes = this.ptyManager.list()
    const paneLines = panes.length > 0
      ? panes.map((p, i) => {
          const statusLabel =
            p.status === 'running' ? '运行中' :
            p.status === 'confirm' ? '等待确认' :
            p.status === 'done' ? '已完成' :
            p.status === 'error' ? '错误' : '空闲'
          const snapshot = this.ptyManager.snapshot(p.id).slice(-8).join('\n')
          return `#${i + 1} ${p.title} (${p.type}) - ${statusLabel}` +
            (snapshot ? `\n最近输出:\n${snapshot}` : '')
        }).join('\n\n')
      : '(当前无终端)'

    return [
      '你是一个 AI 终端管理助手。你在监控以下 AI Agent 终端。',
      '请用简洁中文回答用户的问题，聚焦于终端状态和任务进展。',
      '',
      '【当前终端状态】',
      paneLines,
      '',
      `【用户】${userMessage}`,
    ].join('\n')
  }

  /** Parse user text into a command.
   *  - /cmd  → slash commands
   *  - #N text → send to pane N  (#1 hello, #2y, #2 n)
   *  - # text  → send to active pane
   *  - anything else → ignored (returns 'unknown')
   */
  parseCommand(text: string): ParsedCommand {
    // Slash commands: /panes, /help, etc.
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/)
      const name = parts[0].toLowerCase()
      const args = parts.slice(1)
      switch (name) {
        case 'panes': case 'list': return { type: 'panes', args }
        case 'use': case 'switch': return { type: 'use', args }
        case 'screen': case 'snapshot': return { type: 'screen', args }
        case 'log': return { type: 'log', args }
        case 'yolo': return { type: 'yolo', args }
        case 'help': case 'h': return { type: 'help', args }
        default: return { type: 'unknown', args: [name, ...args] }
      }
    }

    // # prefix: terminal input
    if (text.startsWith('#')) {
      const body = text.slice(1).trimStart()

      // #N y/n — quick confirm/reject for pane N
      const qrMatch = body.match(/^(\d+)\s*([yn])$/i)
      if (qrMatch) {
        const paneIdx = parseInt(qrMatch[1], 10)
        const answer = qrMatch[2].toLowerCase()
        const panes = this.ptyManager.list()
        if (paneIdx >= 1 && paneIdx <= panes.length) {
          return {
            type: answer === 'y' ? 'yes' : 'no',
            args: [],
            targetPane: panes[paneIdx - 1].id,
          }
        }
      }

      // #N <text> — send text to pane N
      const paneMatch = body.match(/^(\d+)\s+(.+)$/s)
      if (paneMatch) {
        const paneIdx = parseInt(paneMatch[1], 10)
        const panes = this.ptyManager.list()
        if (paneIdx >= 1 && paneIdx <= panes.length) {
          return { type: 'input', args: [paneMatch[2]], targetPane: panes[paneIdx - 1].id }
        }
      }

      // # <text> — send to active pane
      if (body.length > 0) {
        return { type: 'input', args: [body] }
      }
    }

    // No # or / prefix → ignore (don't send to terminal)
    return { type: 'unknown', args: [] }
  }

  private async executeCommand(cmd: ParsedCommand): Promise<string> {
    switch (cmd.type) {
      case 'panes':
        return this.cmdPanes()
      case 'use':
        return this.cmdUse(cmd.args[0])
      case 'screen':
        return this.cmdScreen()
      case 'log':
        return this.cmdLog(cmd.args[0])
      case 'yolo':
        return this.cmdYolo(cmd.args[0])
      case 'yes':
        return this.cmdInput('y', cmd.targetPane)
      case 'no':
        return this.cmdInput('n', cmd.targetPane)
      case 'input':
        return this.cmdInput(cmd.args[0], cmd.targetPane)
      case 'help':
        return this.cmdHelp()
      case 'unknown':
        if (cmd.args.length > 0 && cmd.args[0]) {
          return `未知命令: /${cmd.args[0]}\n输入 /help 查看可用命令`
        }
        return ''  // ignored message, no response
    }
  }

  private cmdPanes(): string {
    const panes = this.ptyManager.list()
    if (panes.length === 0) return '当前没有终端'

    const lines = panes.map((p, i) => {
      const idx = i + 1
      const active = p.id === this.activePane ? ' 👈' : ''
      const status = p.status === 'running' ? '▶' :
                     p.status === 'confirm' ? '⚠' :
                     p.status === 'error' ? '✗' :
                     p.status === 'done' ? '✓' : '○'
      const bypass = p.bypassPermissions ? ' 🔓' : ''
      return `${status} #${idx} ${p.title} (${p.type})${bypass}${active}`
    })

    return `📋 终端列表:\n${lines.join('\n')}`
  }

  private cmdUse(idOrIndex?: string): string {
    if (!idOrIndex) return '用法: /use <序号>'

    const panes = this.ptyManager.list()
    let target: PaneInfo | undefined

    // Try by index (1-based)
    const idx = parseInt(idOrIndex, 10)
    if (!isNaN(idx) && idx >= 1 && idx <= panes.length) {
      target = panes[idx - 1]
    }
    // Try by ID
    if (!target) {
      target = panes.find(p => p.id === idOrIndex)
    }

    if (!target) return `找不到终端: ${idOrIndex}`

    this.activePane = target.id
    return `已切换到: #${panes.indexOf(target) + 1} ${target.title}`
  }

  private cmdScreen(): string {
    const id = this.getActivePaneId()
    if (!id) return '请先用 /use 选择一个终端'

    const lines = this.ptyManager.snapshot(id)
    if (lines.length === 0) return '(终端为空)'

    const display = lines.slice(-60).join('\n')
    return `📺 屏幕快照:\n\`\`\`\n${display}\n\`\`\``
  }

  private cmdLog(nStr?: string): string {
    const id = this.getActivePaneId()
    if (!id) return '请先用 /use 选择一个终端'

    const n = nStr ? parseInt(nStr, 10) : 20
    const lines = this.ptyManager.snapshot(id)
    const display = lines.slice(-n).join('\n')
    return `📜 最近 ${n} 行:\n\`\`\`\n${display}\n\`\`\``
  }

  private cmdYolo(level?: string): string {
    const id = this.getActivePaneId()
    if (!id) return '请先用 /use 选择一个终端'

    const pane = this.ptyManager.list().find(p => p.id === id)
    if (pane?.bypassPermissions) {
      return '🔓 当前终端已启用 bypass 模式，无需设置 YOLO'
    }

    if (!level) {
      return `当前自动化级别: ${pane?.yoloLevel ?? 'unknown'}`
    }

    const validLevels = ['off', 'safe', 'full']
    if (!validLevels.includes(level)) {
      return `无效级别。可选: ${validLevels.join(', ')}`
    }

    this.ptyManager.setYolo(id, level as 'off' | 'safe' | 'full')
    return `已设置 ${level} 模式`
  }

  private cmdInput(text: string, targetPaneId?: string): string {
    const id = targetPaneId ?? this.getActivePaneId()
    if (!id) return '请先用 /use 选择一个终端'

    const pane = this.ptyManager.list().find(p => p.id === id)
    const idx = this.ptyManager.paneIndex(id)

    this.ptyManager.write(id, text + '\r')
    return `✏️ 已发送到 #${idx} ${pane?.title ?? id}`
  }

  private cmdHelp(): string {
    return [
      '📖 可用命令:',
      '/panes — 列出所有终端',
      '/use <序号> — 切换当前终端',
      '/screen — 查看屏幕快照 (60行)',
      '/log [n] — 查看最近 n 行 (默认20)',
      '/yolo [off|safe|full] — 查看/设置自动化级别',
      '',
      '终端输入 (# 前缀):',
      '#1 你好 — 发送到终端 #1',
      '#2y / #2n — 对终端 #2 确认/拒绝',
      '# 文字 — 发送到当前活动终端',
      '',
      '⚠️ 不带 # 或 / 的消息会被忽略',
    ].join('\n')
  }

  private getActivePaneId(): string | null {
    if (this.activePane) {
      const panes = this.ptyManager.list()
      if (panes.find(p => p.id === this.activePane)) {
        return this.activePane
      }
    }
    const panes = this.ptyManager.list()
    if (panes.length > 0) {
      this.activePane = panes[0].id
      return this.activePane
    }
    return null
  }

  private async broadcastEvent(event: PaneEvent): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.isConnected()) {
        try {
          if (adapter.sendEvent) {
            await adapter.sendEvent(event)
          } else {
            await adapter.sendText(this.eventToText(event))
          }
        } catch (err) {
          console.error(`[MessageRouter] Failed to send to ${adapter.name}:`, err)
        }
      }
    }
  }

  /** Broadcast leave mode status to all connected adapters */
  private async broadcastLeaveStatus(entering: boolean): Promise<void> {
    const panes = this.ptyManager.list()
    for (const adapter of this.adapters.values()) {
      if (!adapter.isConnected()) continue
      try {
        if (adapter.sendStatusSummary) {
          await adapter.sendStatusSummary(panes, entering)
        } else {
          // Fallback to text
          if (entering) {
            const statusIcon = (p: PaneInfo) =>
              p.status === 'running' ? '▶' :
              p.status === 'confirm' ? '⚠' :
              p.status === 'error' ? '✗' :
              p.status === 'done' ? '✓' : '○'
            const lines = panes.map((p, i) =>
              `${statusIcon(p)} #${i + 1} ${p.title} (${p.type})`
            )
            const msg = panes.length > 0
              ? `🚶 离开模式已开启\n\n📋 终端状态:\n${lines.join('\n')}\n\n💡 /help 查看可用命令`
              : '🚶 离开模式已开启（当前无终端）'
            await adapter.sendText(msg)
          } else {
            await adapter.sendText('🏠 离开模式已关闭')
          }
        }
      } catch (err) {
        console.error(`[MessageRouter] Failed to send leave status to ${adapter.name}:`, err)
      }
    }
  }

  private eventToText(event: PaneEvent): string {
    const emojiMap: Record<string, string> = {
      confirm: '⚠️', done: '✅', error: '❌',
      idle: '💤', heartbeat: '📊', exit: '🛑',
    }
    const emoji = emojiMap[event.type] ?? ''
    let msg = `${emoji} [#${event.paneIndex} ${event.paneTitle}] ${event.content}`
    if (event.type === 'confirm') {
      msg += `\n💡 回复 "#${event.paneIndex}y" 同意 / "#${event.paneIndex}n" 拒绝`
    }
    return msg
  }

  getStatus(): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    for (const [name, adapter] of this.adapters) {
      result[name] = adapter.isConnected()
    }
    return result
  }
}
