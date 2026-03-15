import { EventEmitter } from 'events'
import * as pty from 'node-pty'
import { Analyzer, type AnalyzerEvent } from './bridge/analyzer'

export type PaneType = 'claude' | 'codex' | 'shell'
export type YoloLevel = 'off' | 'safe' | 'full'
export type PaneStatus = 'running' | 'idle' | 'confirm' | 'done' | 'error'

export interface PaneInfo {
  id: string
  title: string
  type: PaneType
  cwd: string
  status: PaneStatus
  yoloLevel: YoloLevel
  lastEvent?: { type: string; content: string; time: number }
}

interface PaneInternal extends PaneInfo {
  pty: pty.IPty
  ptyGeneration: number  // incremented on restart to ignore stale onExit
  shellVariant: string   // for shell type: 'cmd' | 'powershell' | 'gitbash' | 'wsl'
  ring: string[]
  quietTimer: ReturnType<typeof setTimeout> | null
}

const RISK_HIGH = /rm\s+-|drop\s+|git\s+push|sudo|format|truncate|delete/i
const RISK_MED = /bash|shell|execute|run\s+command/i
const QUIET_THRESHOLD = 15 * 60 * 1000 // 15 min

// Remove env vars that prevent Claude Code from launching inside our PTY
function cleanEnv(): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) }
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_ENTRYPOINT']
  delete env['CLAUDE_CODE_SESSION_ID']
  return env
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

export class PtyManager extends EventEmitter {
  private panes = new Map<string, PaneInternal>()
  private analyzer = new Analyzer()
  private nextId = 0

  create(typeStr: string, cwd: string): PaneInfo {
    // typeStr can be 'claude', 'codex', 'shell', or 'shell:variant'
    let type: PaneType
    let shellVariant = ''
    if (typeStr.startsWith('shell:')) {
      type = 'shell'
      shellVariant = typeStr.slice(6)
    } else {
      type = typeStr as PaneType
    }

    this.nextId++
    const num = this.nextId
    const displayName = shellVariant || type
    const id = `pane-${num}`
    const title = `${displayName} #${num}`

    const { cmd, args } = this.resolveCmd(type, shellVariant)

    let p: pty.IPty
    try {
      p = pty.spawn(cmd, args, {
        cols: 120,
        rows: 30,
        cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    } catch (err) {
      // If spawn fails, try falling back to shell
      console.error(`[PTY] Failed to spawn ${cmd}:`, err)
      p = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
        cols: 120,
        rows: 30,
        cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    }

    const pane: PaneInternal = {
      id, title, type, cwd,
      status: 'running',
      yoloLevel: 'off',
      pty: p,
      ptyGeneration: 0,
      shellVariant,
      ring: [],
      quietTimer: null
    }

    this.panes.set(id, pane)
    this.attachPtyHandlers(pane, p, pane.ptyGeneration)

    this.emitListUpdate()
    return this.toInfo(pane)
  }

  restart(id: string): PaneInfo | null {
    const pane = this.panes.get(id)
    if (!pane) return null

    // Bump generation so old onExit/onData handlers become no-ops
    pane.ptyGeneration++
    const gen = pane.ptyGeneration

    // Kill old PTY
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    try { pane.pty.kill() } catch { /* ignore */ }

    // Respawn with same config
    const { cmd, args } = this.resolveCmd(pane.type, pane.shellVariant)
    let p: pty.IPty
    try {
      p = pty.spawn(cmd, args, {
        cols: 120, rows: 30, cwd: pane.cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    } catch {
      p = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
        cols: 120, rows: 30, cwd: pane.cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    }

    // Reset pane state, keep id/title/cwd/yoloLevel
    pane.pty = p
    pane.ring = []
    pane.status = 'running'
    pane.lastEvent = undefined

    // Tell renderer to clear terminal
    this.emit('pane:clear', { id })

    // Attach handlers with new generation
    this.attachPtyHandlers(pane, p, gen)
    this.emitListUpdate()
    return this.toInfo(pane)
  }

  close(id: string): void {
    const pane = this.panes.get(id)
    if (!pane) return
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    try { pane.pty.kill() } catch { /* ignore */ }
    this.panes.delete(id)
    this.emitListUpdate()
  }

  write(id: string, text: string): void {
    this.panes.get(id)?.pty.write(text)
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.panes.get(id)?.pty.resize(cols, rows)
    } catch { /* ignore resize errors */ }
  }

  setYolo(id: string, level: YoloLevel): void {
    const pane = this.panes.get(id)
    if (!pane) return
    pane.yoloLevel = level
    this.emitListUpdate()
  }

  rename(id: string, title: string): void {
    const pane = this.panes.get(id)
    if (!pane) return
    pane.title = title
    this.emitListUpdate()
  }

  snapshot(id: string): string[] {
    return this.panes.get(id)?.ring.slice(-60) ?? []
  }

  list(): PaneInfo[] {
    return Array.from(this.panes.values()).map(p => this.toInfo(p))
  }

  private attachPtyHandlers(pane: PaneInternal, p: pty.IPty, gen: number): void {
    const id = pane.id

    p.onData((data: string) => {
      // Ignore if this PTY is from a stale generation
      if (pane.ptyGeneration !== gen) return

      this.emit('pane:output', { id, data })

      const stripped = stripAnsi(data)
      const lines = stripped.split('\n')
      pane.ring.push(...lines)
      if (pane.ring.length > 2000) pane.ring.splice(0, pane.ring.length - 2000)

      this.resetQuietTimer(pane)

      const event = this.analyzer.feed(pane.ring, stripped)
      if (event) this.handleEvent(pane, event, stripped)
    })

    p.onExit(({ exitCode }) => {
      // Ignore exit from old generation (killed by restart)
      if (pane.ptyGeneration !== gen) return
      if (this.panes.has(id)) {
        pane.status = 'idle'
        if (pane.quietTimer) clearTimeout(pane.quietTimer)
        // Notify renderer to show exit message
        this.emit('pane:exit', { id, exitCode })
        this.emitListUpdate()
      }
    })
  }

  cleanup(): void {
    for (const pane of this.panes.values()) {
      if (pane.quietTimer) clearTimeout(pane.quietTimer)
      try { pane.pty.kill() } catch { /* ignore */ }
    }
    this.panes.clear()
  }

  private resolveCmd(type: PaneType, shellVariant = ''): { cmd: string; args: string[] } {
    const isWin = process.platform === 'win32'
    switch (type) {
      case 'claude':
        return { cmd: isWin ? 'cmd.exe' : 'claude', args: isWin ? ['/c', 'claude'] : [] }
      case 'codex':
        return { cmd: isWin ? 'cmd.exe' : 'codex', args: isWin ? ['/c', 'codex'] : [] }
      case 'shell':
        return this.resolveShell(shellVariant, isWin)
    }
  }

  private resolveShell(variant: string, isWin: boolean): { cmd: string; args: string[] } {
    switch (variant) {
      case 'powershell':
        return { cmd: isWin ? 'powershell.exe' : 'pwsh', args: [] }
      case 'gitbash':
        return {
          cmd: 'C:\\Program Files\\Git\\bin\\bash.exe',
          args: ['--login', '-i']
        }
      case 'wsl':
        return { cmd: 'wsl.exe', args: [] }
      case 'cmd':
      default:
        return { cmd: isWin ? 'cmd.exe' : (process.env.SHELL || 'bash'), args: [] }
    }
  }

  private handleEvent(pane: PaneInternal, event: AnalyzerEvent, rawText: string): void {
    // Try auto-answer in yolo mode
    if (event.type === 'confirm') {
      const answer = this.autoAnswer(pane, rawText)
      if (answer !== null) {
        setTimeout(() => {
          try { pane.pty.write(answer + '\r') } catch { /* ignore */ }
        }, 300)
        return
      }
    }

    pane.lastEvent = { ...event, time: Date.now() }
    pane.status =
      event.type === 'confirm' ? 'confirm' :
      event.type === 'error' ? 'error' :
      event.type === 'done' ? 'done' : 'idle'

    this.emit('pane:event', { id: pane.id, event: pane.lastEvent })
    this.emitListUpdate()
  }

  private autoAnswer(pane: PaneInternal, text: string): string | null {
    if (pane.yoloLevel === 'off') return null
    if (pane.yoloLevel === 'full') return 'y'
    // safe: block high/medium risk
    if (RISK_HIGH.test(text) || RISK_MED.test(text)) return null
    return 'y'
  }

  private resetQuietTimer(pane: PaneInternal): void {
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    pane.quietTimer = setTimeout(() => {
      pane.lastEvent = { type: 'idle', content: '已静默 15 分钟', time: Date.now() }
      this.emit('pane:event', { id: pane.id, event: pane.lastEvent })
    }, QUIET_THRESHOLD)
  }

  private emitListUpdate(): void {
    this.emit('pane:listUpdate', this.list())
  }

  /** Returns serializable session config for persistence */
  getSessionConfig(): Array<{ type: string; cwd: string; yoloLevel: string }> {
    return Array.from(this.panes.values()).map(p => ({
      type: p.shellVariant ? `shell:${p.shellVariant}` : p.type,
      cwd: p.cwd,
      yoloLevel: p.yoloLevel
    }))
  }

  private toInfo(pane: PaneInternal): PaneInfo {
    return {
      id: pane.id,
      title: pane.title,
      type: pane.type,
      cwd: pane.cwd,
      status: pane.status,
      yoloLevel: pane.yoloLevel,
      lastEvent: pane.lastEvent
    }
  }
}
