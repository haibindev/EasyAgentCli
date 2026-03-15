import * as dgram from 'dgram'

const MULTICAST_ADDR = '239.255.42.99'
const DISCOVERY_PORT = 18766
const WS_PORT = 18765

export class Discovery {
  private socket: dgram.Socket | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private id: string

  constructor() {
    this.id = crypto.randomUUID()
  }

  start(): void {
    if (this.socket) return

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = socket

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
        socket.setMulticastTTL(32)
      } catch {
        // Some environments don't support multicast
      }

      const msg = JSON.stringify({
        role: 'bridge',
        id: this.id,
        name: 'EasyAgentCli',
        wsPort: WS_PORT
      })
      const buf = Buffer.from(msg)

      const broadcast = (): void => {
        try {
          socket.send(buf, 0, buf.length, DISCOVERY_PORT, MULTICAST_ADDR)
        } catch {
          // Silently ignore send errors
        }
      }

      broadcast()
      this.interval = setInterval(broadcast, 5000)
    })

    socket.on('error', () => {
      // Silently handle socket errors
      this.stop()
    })
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    if (this.socket) {
      try { this.socket.close() } catch { /* ignore */ }
      this.socket = null
    }
  }
}
