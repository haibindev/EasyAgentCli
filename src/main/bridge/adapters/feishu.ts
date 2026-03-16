import type { MessageAdapter, OnMessageCallback } from '../message-router'

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

  constructor(private config: FeishuConfig, onMessage: OnMessageCallback) {
    this.onMessage = onMessage
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

    // Set up event dispatcher for receiving messages
    const dispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data: Record<string, unknown>) => {
        try {
          const msg = data.message as Record<string, unknown>
          const chatId = msg.chat_id as string
          const msgType = msg.message_type as string
          const content = msg.content as string

          // Auto-learn chat ID from first received message
          if (!this.chatId && chatId) {
            this.chatId = chatId
            console.log(`[Feishu] Auto-learned chat_id: ${chatId}`)
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
      }
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
