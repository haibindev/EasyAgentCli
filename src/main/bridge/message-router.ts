import type { PtyManager, PaneInfo } from '../pty-manager'

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

  constructor(private ptyManager: PtyManager) {}

  addAdapter(adapter: MessageAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  removeAdapter(name: string): void {
    this.adapters.delete(name)
  }

  setLeaveMode(enabled: boolean): void {
    this.leaveMode = enabled
  }

  /** Called when a terminal event occurs (confirm/done/error/idle/heartbeat) */
  async dispatchEvent(paneId: string, event: { type: string; content: string; time: number }): Promise<void> {
    if (!this.leaveMode) return

    const pane = this.ptyManager.list().find(p => p.id === paneId)
    const idx = this.ptyManager.paneIndex(paneId)
    const title = pane?.title ?? paneId

    let emoji = ''
    switch (event.type) {
      case 'confirm': emoji = '⚠️'; break
      case 'done': emoji = '✅'; break
      case 'error': emoji = '❌'; break
      case 'idle': emoji = '💤'; break
      case 'heartbeat': emoji = '📊'; break
      case 'exit': emoji = '🛑'; break
    }

    // Track which pane last requested confirmation
    if (event.type === 'confirm') {
      this.lastConfirmPane = paneId
    }

    let msg = `${emoji} [#${idx} ${title}] ${event.content}`

    // For confirm events, add quick-reply hint
    if (event.type === 'confirm') {
      msg += `\n💡 回复 "${idx}y" 同意 / "${idx}n" 拒绝`
    }

    await this.broadcast(msg)
  }

  /** Called when a PTY process exits */
  async dispatchExit(paneId: string, exitCode: number): Promise<void> {
    if (!this.leaveMode) return

    const pane = this.ptyManager.list().find(p => p.id === paneId)
    const idx = this.ptyManager.paneIndex(paneId)
    const title = pane?.title ?? paneId

    const msg = `🛑 [#${idx} ${title}] 进程退出 (code: ${exitCode})`
    await this.broadcast(msg)
  }

  /** Handle incoming user message from any adapter */
  async handleMessage(adapterName: string, text: string): Promise<void> {
    const adapter = this.adapters.get(adapterName)

    // Not in leave mode: don't process commands, just hint
    if (!this.leaveMode) {
      if (adapter) {
        await adapter.sendText('💡 当前未开启离开模式，消息不会被处理。请在 EasyAgentCli 中开启「离开模式」后重试。')
      }
      return
    }

    const cmd = this.parseCommand(text.trim())
    const response = await this.executeCommand(cmd)
    if (adapter && response) {
      await adapter.sendText(response)
    }
  }

  /** Parse user text into a command, supporting indexed replies like "1y", "2n" */
  parseCommand(text: string): ParsedCommand {
    // Indexed quick replies: "1y", "2n", "3y", "#1 y", "#2 n"
    const indexedMatch = text.match(/^#?(\d+)\s*([yn])$/i)
    if (indexedMatch) {
      const paneIdx = parseInt(indexedMatch[1], 10)
      const answer = indexedMatch[2].toLowerCase()
      const panes = this.ptyManager.list()
      if (paneIdx >= 1 && paneIdx <= panes.length) {
        const targetId = panes[paneIdx - 1].id
        return {
          type: answer === 'y' ? 'yes' : 'no',
          args: [],
          targetPane: targetId
        }
      }
    }

    // Slash commands
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

    // Quick shortcuts (bare y/n → targets last confirming pane)
    const lower = text.toLowerCase()
    if (lower === 'y' || lower === '同意' || lower === 'yes' || lower === '确认') {
      return { type: 'yes', args: [], targetPane: this.lastConfirmPane ?? undefined }
    }
    if (lower === 'n' || lower === '拒绝' || lower === 'no' || lower === '取消') {
      return { type: 'no', args: [], targetPane: this.lastConfirmPane ?? undefined }
    }

    // Plain text → input to active pane
    return { type: 'input', args: [text] }
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
        return this.cmdInput(cmd.args[0])
      case 'help':
        return this.cmdHelp()
      case 'unknown':
        return `未知命令: /${cmd.args[0]}\n输入 /help 查看可用命令`
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
      '快捷回复:',
      'y / 同意 — 确认（发送到最近请求确认的终端）',
      'n / 拒绝 — 拒绝',
      '1y / 2n — 对指定编号终端确认/拒绝',
      '其他文字 — 直接输入到当前终端',
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

  private async broadcast(text: string): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.isConnected()) {
        try {
          await adapter.sendText(text)
        } catch (err) {
          console.error(`[MessageRouter] Failed to send to ${adapter.name}:`, err)
        }
      }
    }
  }

  getStatus(): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    for (const [name, adapter] of this.adapters) {
      result[name] = adapter.isConnected()
    }
    return result
  }
}
