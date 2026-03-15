import { EventEmitter } from 'events'
import { WebSocketServer, WebSocket } from 'ws'
import type { PtyManager } from '../pty-manager'
import type { PaneInfo } from '../pty-manager'

export class BridgeServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private leaveMode = false
  private port = 18765

  constructor(private ptyManager: PtyManager) {
    super()
  }

  start(): void {
    if (this.wss) return
    try {
      this.wss = new WebSocketServer({ port: this.port })
    } catch {
      console.error(`[Bridge] Failed to start WebSocket server on port ${this.port}`)
      return
    }

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      this.emitStatusChange()

      // Send current pane list on connect
      ws.send(JSON.stringify({
        type: 'panes',
        panes: this.ptyManager.list()
      }))

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          this.handleClientMessage(ws, msg)
        } catch { /* ignore malformed */ }
      })

      ws.on('close', () => {
        this.clients.delete(ws)
        this.emitStatusChange()
      })

      ws.on('error', () => {
        this.clients.delete(ws)
        this.emitStatusChange()
      })

      // Heartbeat every 30s
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping()
        } else {
          clearInterval(ping)
        }
      }, 30000)
    })

    this.wss.on('error', (err) => {
      console.error('[Bridge] WebSocket server error:', err.message)
    })

    console.log(`[Bridge] WebSocket server listening on port ${this.port}`)
  }

  stop(): void {
    for (const client of this.clients) {
      try { client.close() } catch { /* ignore */ }
    }
    this.clients.clear()
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
  }

  setLeaveMode(enabled: boolean): void {
    this.leaveMode = enabled
    this.emitStatusChange()
  }

  getStatus(): { serverRunning: boolean; clientCount: number; leaveMode: boolean } {
    return {
      serverRunning: this.wss !== null,
      clientCount: this.clients.size,
      leaveMode: this.leaveMode
    }
  }

  broadcastEvent(paneId: string, event: { type: string; content: string; time: number }): void {
    if (!this.leaveMode) return
    this.broadcast({ type: 'event', paneId, event })
  }

  broadcastPaneList(panes: PaneInfo[]): void {
    this.broadcast({ type: 'panes', panes })
  }

  private handleClientMessage(ws: WebSocket, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'input':
        this.ptyManager.write(msg.paneId as string, msg.text as string)
        break
      case 'yolo':
        this.ptyManager.setYolo(msg.paneId as string, msg.level as 'off' | 'safe' | 'full')
        break
      case 'snapshot':
        ws.send(JSON.stringify({
          type: 'snapshot',
          paneId: msg.paneId,
          lines: this.ptyManager.snapshot(msg.paneId as string)
        }))
        break
      case 'output': {
        const lines = this.ptyManager.snapshot(msg.paneId as string)
        ws.send(JSON.stringify({
          type: 'output',
          paneId: msg.paneId,
          lines,
          cursor: lines.length
        }))
        break
      }
    }
  }

  private emitStatusChange(): void {
    this.emit('statusChange', this.getStatus())
  }

  private broadcast(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }
}
