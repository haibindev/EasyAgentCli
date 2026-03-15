import type { MessageAdapter, OnMessageCallback } from '../message-router'

export interface TelegramConfig {
  token: string
  /** Chat ID to send messages to (auto-learned from first message if not set) */
  chatId?: string
}

/**
 * Telegram Bot adapter using HTTP long-polling (no webhooks / no public URL needed).
 * Uses the official Bot API directly — no heavy SDK dependency.
 */
export class TelegramAdapter implements MessageAdapter {
  readonly name = 'telegram'
  private connected = false
  private chatId: string | null = null
  private onMessage: OnMessageCallback
  private polling = false
  private offset = 0
  private abortController: AbortController | null = null

  constructor(private config: TelegramConfig, onMessage: OnMessageCallback) {
    this.onMessage = onMessage
    this.chatId = config.chatId ?? null
  }

  async start(): Promise<void> {
    // Verify token by calling getMe
    try {
      const me = await this.apiCall('getMe')
      if (!me.ok) {
        console.error('[Telegram] Invalid token:', me.description)
        return
      }
      console.log(`[Telegram] Logged in as @${me.result.username}`)
      this.connected = true
      this.polling = true
      this.pollLoop()
    } catch (err) {
      console.error('[Telegram] Failed to start:', err)
      this.connected = false
    }
  }

  async stop(): Promise<void> {
    this.polling = false
    this.connected = false
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    console.log('[Telegram] Stopped')
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendText(text: string): Promise<void> {
    if (!this.chatId) return

    try {
      // Telegram message limit is 4096 chars
      const fragments = this.fragment(text, 4000)
      for (const frag of fragments) {
        await this.apiCall('sendMessage', {
          chat_id: this.chatId,
          text: frag,
        })
      }
    } catch (err) {
      console.error('[Telegram] Failed to send message:', err)
    }
  }

  /** Update config at runtime */
  updateConfig(config: Partial<TelegramConfig>): void {
    if (config.chatId) this.chatId = config.chatId
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        this.abortController = new AbortController()
        const data = await this.apiCall('getUpdates', {
          offset: this.offset,
          timeout: 30,
        }, this.abortController.signal)

        if (!data.ok || !Array.isArray(data.result)) continue

        for (const update of data.result) {
          this.offset = update.update_id + 1
          const msg = update.message
          if (!msg || !msg.text) continue

          // Auto-learn chat ID from first message
          if (!this.chatId) {
            this.chatId = String(msg.chat.id)
            console.log(`[Telegram] Auto-learned chat_id: ${this.chatId}`)
          }

          // Only respond in the configured chat
          if (String(msg.chat.id) !== this.chatId) continue

          this.onMessage(this.name, msg.text.trim())
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') break
        console.error('[Telegram] Polling error:', err)
        // Back off on error
        if (this.polling) {
          await new Promise(r => setTimeout(r, 5000))
        }
      }
    }
  }

  private async apiCall(
    method: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; result?: any; description?: string }> {
    const url = `https://api.telegram.org/bot${this.config.token}/${method}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
      signal,
    })
    return res.json()
  }

  private fragment(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text]
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining)
        break
      }
      let breakAt = remaining.lastIndexOf('\n', maxLen)
      if (breakAt < maxLen * 0.5) breakAt = maxLen
      chunks.push(remaining.slice(0, breakAt))
      remaining = remaining.slice(breakAt)
    }
    return chunks
  }
}
