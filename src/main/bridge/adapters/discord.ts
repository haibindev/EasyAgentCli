import type { MessageAdapter, OnMessageCallback } from '../message-router'

// Dynamic import
let Discord: typeof import('discord.js') | null = null

export interface DiscordConfig {
  token: string
  /** Channel ID to send messages to */
  channelId?: string
}

export class DiscordAdapter implements MessageAdapter {
  readonly name = 'discord'
  private client: import('discord.js').Client | null = null
  private connected = false
  private channelId: string | null = null
  private onMessage: OnMessageCallback

  constructor(private config: DiscordConfig, onMessage: OnMessageCallback) {
    this.onMessage = onMessage
    this.channelId = config.channelId ?? null
  }

  async start(): Promise<void> {
    try {
      Discord = await import('discord.js')
    } catch {
      console.error('[Discord] discord.js not installed')
      return
    }

    const { Client, GatewayIntentBits, Events } = Discord

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    })

    this.client.on(Events.ClientReady, (c) => {
      this.connected = true
      console.log(`[Discord] Logged in as ${c.user.tag}`)
    })

    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bot's own messages
      if (message.author.bot) return

      // Auto-learn channel ID from first message
      if (!this.channelId) {
        this.channelId = message.channelId
        console.log(`[Discord] Auto-learned channel: ${this.channelId}`)
      }

      // Only respond in the configured channel
      if (message.channelId !== this.channelId) return

      const text = message.content.trim()
      if (text) {
        this.onMessage(this.name, text)
      }
    })

    this.client.on(Events.Error, (err) => {
      console.error('[Discord] Error:', err.message)
    })

    try {
      await this.client.login(this.config.token)
    } catch (err) {
      console.error('[Discord] Failed to login:', err)
      this.connected = false
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy()
      this.client = null
    }
    this.connected = false
    console.log('[Discord] Stopped')
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendText(text: string): Promise<void> {
    if (!this.client || !this.channelId) return

    try {
      const channel = await this.client.channels.fetch(this.channelId)
      if (!channel || !('send' in channel)) return

      // Fragment long messages (Discord limit 2000 chars)
      const fragments = this.fragment(text, 1900)
      for (const frag of fragments) {
        await (channel as import('discord.js').TextChannel).send(frag)
      }
    } catch (err) {
      console.error('[Discord] Failed to send message:', err)
    }
  }

  /** Update config at runtime */
  updateConfig(config: Partial<DiscordConfig>): void {
    if (config.channelId) this.channelId = config.channelId
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
