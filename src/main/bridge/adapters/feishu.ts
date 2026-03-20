import type { MessageAdapter, OnMessageCallback, PaneEvent } from '../message-router'
import type { PaneInfo } from '../../pty-manager'

// Dynamic import to avoid crashes if SDK not installed
let lark: typeof import('@larksuiteoapi/node-sdk') | null = null

export interface FeishuConfig {
  appId: string
  appSecret: string
  /** Chat ID to send messages to (group or individual) */
  chatId?: string
}

export class FeishuAdapter implements MessageAdapter {
  readonly name = 'feishu'
  private client: InstanceType<typeof import('@larksuiteoapi/node-sdk').Client> | null = null
  private wsClient: unknown = null
  private connected = false
  private chatId: string | null = null
  private onMessage: OnMessageCallback
  private onLearnedChatId?: (chatId: string) => void

  constructor(
    private config: FeishuConfig,
    onMessage: OnMessageCallback,
    onLearnedChatId?: (chatId: string) => void
  ) {
    this.onMessage = onMessage
    this.onLearnedChatId = onLearnedChatId
    this.chatId = config.chatId ?? null
  }

  async start(): Promise<void> {
    try {
      lark = await import('@larksuiteoapi/node-sdk')
    } catch {
      console.error('[Feishu] @larksuiteoapi/node-sdk not installed')
      return
    }

    this.client = new lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    })

    // Set up event dispatcher for receiving messages and card actions
    const dispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data: Record<string, unknown>) => {
        try {
          const msg = data.message as Record<string, unknown>
          const chatId = msg.chat_id as string
          const msgType = msg.message_type as string
          const content = msg.content as string

          // Auto-learn chat ID from first received message and persist it
          if (!this.chatId && chatId) {
            this.chatId = chatId
            console.log(`[Feishu] Auto-learned chat_id: ${chatId}`)
            this.onLearnedChatId?.(chatId)
          }

          if (msgType === 'text') {
            const parsed = JSON.parse(content)
            const text = parsed.text as string
            if (text) {
              this.onMessage(this.name, text)
            }
          }
        } catch (err) {
          console.error('[Feishu] Error processing message:', err)
        }
        return {} // acknowledge
      },
      'card.action.trigger': (data: Record<string, unknown>) => {
        try {
          const action = data.action as Record<string, unknown> | undefined
          const value = action?.value as Record<string, unknown> | undefined
          if (!value) return {}

          const actionType = value.action as string
          const paneIndex = value.paneIndex as number
          if (actionType === 'approve') {
            this.onMessage(this.name, `${paneIndex}y`)
          } else if (actionType === 'reject') {
            this.onMessage(this.name, `${paneIndex}n`)
          }
        } catch (err) {
          console.error('[Feishu] Error processing card action:', err)
        }
        return {} // acknowledge
      },
    })

    // Use WebSocket mode (no public URL needed)
    try {
      this.wsClient = new lark.WSClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        loggerLevel: lark.LoggerLevel.WARN,
      })
      await (this.wsClient as { start: (p: { eventDispatcher: unknown }) => Promise<void> }).start({ eventDispatcher: dispatcher })
      this.connected = true
      console.log('[Feishu] WebSocket connected')
    } catch (err) {
      console.error('[Feishu] Failed to start WebSocket:', err)
      this.connected = false
    }
  }

  async stop(): Promise<void> {
    this.connected = false
    this.wsClient = null
    this.client = null
    console.log('[Feishu] Stopped')
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendText(text: string): Promise<void> {
    if (!this.client || !this.chatId) return

    try {
      // Fragment long messages (Feishu limit ~30KB, but keep readable)
      const fragments = this.fragment(text, 4000)
      for (const frag of fragments) {
        await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: this.chatId,
            content: JSON.stringify({ text: frag }),
            msg_type: 'text',
          },
        })
      }
    } catch (err) {
      console.error('[Feishu] Failed to send message:', err)
    }
  }

  /** Send structured event as interactive card */
  async sendEvent(event: PaneEvent): Promise<void> {
    if (!this.client || !this.chatId) return

    try {
      const card = this.buildCard(event)
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: this.chatId,
          content: JSON.stringify(card),
          msg_type: 'interactive',
        },
      })
    } catch (err) {
      console.error('[Feishu] Failed to send card, falling back to text:', err)
      // Fallback to plain text
      const emoji: Record<string, string> = {
        confirm: '⚠️', done: '✅', error: '❌',
        idle: '💤', heartbeat: '📊', exit: '🛑',
      }
      await this.sendText(`${emoji[event.type] ?? ''} [#${event.paneIndex} ${event.paneTitle}] ${event.content}`)
    }
  }

  /** Send leave mode status as an interactive card */
  async sendStatusSummary(panes: PaneInfo[], entering: boolean): Promise<void> {
    if (!this.client || !this.chatId) return

    try {
      const card = entering ? this.buildLeaveCard(panes) : this.buildReturnCard()
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: this.chatId,
          content: JSON.stringify(card),
          msg_type: 'interactive',
        },
      })
    } catch (err) {
      console.error('[Feishu] Failed to send status card:', err)
      try {
        await this.sendText(entering ? '🚶 离开模式已开启' : '🏠 离开模式已关闭')
      } catch { /* ignore double failure */ }
    }
  }

  private buildLeaveCard(panes: PaneInfo[]): Record<string, unknown> {
    const statusIcon = (p: PaneInfo) =>
      p.status === 'running' ? '▶️ 运行中' :
      p.status === 'confirm' ? '⚠️ 等待确认' :
      p.status === 'error' ? '❌ 错误' :
      p.status === 'done' ? '✅ 已完成' : '⏸️ 空闲'

    const statusColor = (p: PaneInfo) =>
      p.status === 'running' ? 'green' :
      p.status === 'confirm' ? 'orange' :
      p.status === 'error' ? 'red' : 'grey'

    const elements: Record<string, unknown>[] = []

    if (panes.length === 0) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '当前没有运行中的终端' },
      })
    } else {
      // Pane status table
      const paneLines = panes.map((p, i) => {
        const bypass = p.bypassPermissions ? ' 🔓' : ''
        const yolo = p.yoloLevel !== 'off' ? ` [${p.yoloLevel}]` : ''
        return `**#${i + 1} ${p.title}** (${p.type})${bypass}${yolo}\n${statusIcon(p)}`
      })

      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '📋 **终端状态**' },
      })

      // Each pane as a column set for clean layout
      for (const line of paneLines) {
        elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: line },
        })
      }

      elements.push({ tag: 'hr' })

      // Quick action buttons for panes needing confirmation
      const confirmPanes = panes
        .map((p, i) => ({ pane: p, idx: i + 1 }))
        .filter(({ pane }) => pane.status === 'confirm')

      if (confirmPanes.length > 0) {
        const actions: Record<string, unknown>[] = []
        for (const { pane, idx } of confirmPanes) {
          actions.push({
            tag: 'button',
            text: { tag: 'plain_text', content: `✅ #${idx} 同意` },
            type: 'primary',
            value: { action: 'approve', paneId: pane.id, paneIndex: idx },
          })
          actions.push({
            tag: 'button',
            text: { tag: 'plain_text', content: `❌ #${idx} 拒绝` },
            type: 'danger',
            value: { action: 'reject', paneId: pane.id, paneIndex: idx },
          })
        }
        elements.push({ tag: 'action', actions })
        elements.push({ tag: 'hr' })
      }
    }

    // Command hints
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: [
          '💡 **可用命令**',
          '`/panes` 终端列表　`/screen` 屏幕快照',
          '`#1 文字` 发送到终端　`#1y` / `#1n` 确认/拒绝',
          '`/yolo safe|full` 设置自动化　`/help` 帮助',
        ].join('\n'),
      },
    })

    elements.push({
      tag: 'note',
      elements: [
        { tag: 'plain_text', content: '事件将实时推送到此对话，可直接回复指令操控终端' },
      ],
    })

    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '🚶 离开模式已开启' },
        template: 'blue',
      },
      elements,
    }
  }

  private buildReturnCard(): Record<string, unknown> {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '🏠 已回到工位' },
        template: 'green',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: '离开模式已关闭，事件推送已停止。终端输入指令不再被处理。' },
        },
      ],
    }
  }

  private buildCard(event: PaneEvent): Record<string, unknown> {
    const colorMap: Record<string, string> = {
      confirm: 'orange', done: 'green', error: 'red',
      idle: 'grey', heartbeat: 'turquoise', exit: 'carmine',
    }
    const titleMap: Record<string, string> = {
      confirm: '⚠️ 需要确认', done: '✅ 任务完成', error: '❌ 错误',
      idle: '💤 终端静默', heartbeat: '📊 进度报告', exit: '🛑 进程退出',
    }

    const content = event.content.length > 2000
      ? event.content.slice(0, 2000) + '...'
      : event.content

    const elements: Record<string, unknown>[] = [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**#${event.paneIndex} ${event.paneTitle}**` },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'plain_text', content },
      },
    ]

    if (event.type === 'confirm') {
      elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ 同意' },
            type: 'primary',
            value: { action: 'approve', paneId: event.paneId, paneIndex: event.paneIndex },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ 拒绝' },
            type: 'danger',
            value: { action: 'reject', paneId: event.paneId, paneIndex: event.paneIndex },
          },
        ],
      })
      // Text fallback hint in case card callbacks don't work
      elements.push({
        tag: 'note',
        elements: [
          { tag: 'plain_text', content: `💡 或回复 "#${event.paneIndex}y" 同意 / "#${event.paneIndex}n" 拒绝` },
        ],
      })
    }

    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: titleMap[event.type] ?? event.type },
        template: colorMap[event.type] ?? 'blue',
      },
      elements,
    }
  }

  /** Update config at runtime */
  updateConfig(config: Partial<FeishuConfig>): void {
    if (config.chatId) this.chatId = config.chatId
  }

  /** Fragment long text into chunks */
  private fragment(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text]
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining)
        break
      }
      // Try to break at newline
      let breakAt = remaining.lastIndexOf('\n', maxLen)
      if (breakAt < maxLen * 0.5) breakAt = maxLen
      chunks.push(remaining.slice(0, breakAt))
      remaining = remaining.slice(breakAt)
    }
    return chunks
  }
}
