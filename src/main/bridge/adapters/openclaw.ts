import WebSocket from 'ws'
import type { MessageAdapter, OnMessageCallback } from '../message-router'

export interface OpenclawConfig {
  /** WebSocket URL of the Openclaw relay, e.g. ws://192.168.1.100:18800 */
  url: string
  /** Reconnect on disconnect */
  autoReconnect?: boolean
}

/**
 * Openclaw adapter: connects as a WebSocket client to the Win10-side
 * Openclaw relay server. The relay bridges to Feishu/other IM on that side.
 *
 * Protocol (JSON messages):
 *   Incoming: { type: 'command', text: string }
 *   Outgoing: { type: 'event', text: string }
 */
export class OpenclawAdapter implements MessageAdapter {
  readonly name = 'openclaw'
  private ws: WebSocket | null = null
  private connected = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 2000
  private maxReconnectDelay = 30000
  private onMessage: OnMessageCallback
  private stopped = false

  constructor(private config: OpenclawConfig, onMessage: OnMessageCallback) {
    this.onMessage = onMessage
  }

  async start(): Promise<void> {
    this.stopped = false
    this.connect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.connected = false
    console.log('[Openclaw] Stopped')
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    try {
      this.ws.send(JSON.stringify({ type: 'event', text }))
    } catch (err) {
      console.error('[Openclaw] Failed to send:', err)
    }
  }

  /** Update config and reconnect */
  updateConfig(config: Partial<OpenclawConfig>): void {
    if (config.url) {
      this.config.url = config.url
      // Reconnect with new URL
      if (!this.stopped) {
        this.stop().then(() => this.start())
      }
    }
  }

  private connect(): void {
    if (this.stopped) return

    try {
      this.ws = new WebSocket(this.config.url)
    } catch (err) {
      console.error('[Openclaw] Failed to create WebSocket:', err)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      this.connected = true
      this.reconnectDelay = 2000 // reset backoff
      console.log(`[Openclaw] Connected to ${this.config.url}`)
    })

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'command' && typeof msg.text === 'string') {
          this.onMessage(this.name, msg.text)
        }
      } catch { /* ignore malformed */ }
    })

    this.ws.on('close', () => {
      this.connected = false
      console.log('[Openclaw] Disconnected')
      this.scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      console.error('[Openclaw] WebSocket error:', err.message)
      this.connected = false
    })
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.config.autoReconnect === false) return

    this.reconnectTimer = setTimeout(() => {
      console.log(`[Openclaw] Reconnecting to ${this.config.url}...`)
      this.connect()
    }, this.reconnectDelay)

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }
}
