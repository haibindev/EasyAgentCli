import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
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
  bypassPermissions: boolean
  lastEvent?: { type: string; content: string; time: number }
}

export interface CreatePaneOpts {
  resumeSessionId?: string
  bypassPermissions?: boolean
}

interface PaneInternal extends PaneInfo {
  pty: pty.IPty
  ptyGeneration: number
  shellVariant: string
  ring: string[]
  quietTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimer: ReturnType<typeof setInterval> | null
  lastOutputTime: number  // track active vs quiet
  sessionId: string | null
}

const RISK_HIGH = /rm\s+-|drop\s+|git\s+push|sudo|format|truncate|delete/i
const RISK_MED = /bash|shell|execute|run\s+command/i
let QUIET_THRESHOLD = 15 * 60 * 1000   // 15 min — idle notification (configurable)
let HEARTBEAT_INTERVAL = 10 * 60 * 1000 // 10 min — progress heartbeat (configurable)

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

  create(typeStr: string, cwd: string, opts?: CreatePaneOpts): PaneInfo {
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

    const bypass = opts?.bypassPermissions ?? false

    // For agent panes: track session ID for resume on restart
    let sessionId: string | null = null
    if (type === 'claude') {
      sessionId = opts?.resumeSessionId ?? randomUUID()
    } else if (type === 'codex' && opts?.resumeSessionId) {
      sessionId = opts.resumeSessionId
    }

    // For Codex fresh start: snapshot session_index.jsonl line count before spawn
    let codexIndexLinesBefore = 0
    if (type === 'codex' && !opts?.resumeSessionId) {
      codexIndexLinesBefore = this.countCodexSessions()
    }

    const { cmd, args } = this.resolveCmd(type, shellVariant, sessionId, !!opts?.resumeSessionId, bypass)

    let p: pty.IPty
    try {
      p = pty.spawn(cmd, args, {
        cols: 120, rows: 30, cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    } catch (err) {
      console.error(`[PTY] Failed to spawn ${cmd}:`, err)
      p = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
        cols: 120, rows: 30, cwd,
        env: { ...cleanEnv(), TERM: 'xterm-256color' }
      })
    }

    const pane: PaneInternal = {
      id, title, type, cwd,
      status: 'running',
      yoloLevel: 'off',
      bypassPermissions: bypass,
      pty: p,
      ptyGeneration: 0,
      shellVariant,
      ring: [],
      quietTimer: null,
      heartbeatTimer: null,
      lastOutputTime: Date.now(),
      sessionId
    }

    this.panes.set(id, pane)
    this.attachPtyHandlers(pane, p, pane.ptyGeneration)
    this.startHeartbeat(pane)

    // For Codex fresh start: detect the new session ID after Codex creates it
    if (type === 'codex' && !opts?.resumeSessionId) {
      this.captureCodexSessionId(pane, codexIndexLinesBefore)
    }

    this.emitListUpdate()
    return this.toInfo(pane)
  }

  restart(id: string): PaneInfo | null {
    const pane = this.panes.get(id)
    if (!pane) return null

    pane.ptyGeneration++
    const gen = pane.ptyGeneration

    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    if (pane.heartbeatTimer) clearInterval(pane.heartbeatTimer)
    try { pane.pty.kill() } catch { /* ignore */ }

    // On in-app restart: use --continue (safe fallback) instead of --resume <uuid>
    // which fails with "No conversation found" if the session was never created
    const { cmd, args } = this.resolveCmd(pane.type, pane.shellVariant, pane.sessionId, false, pane.bypassPermissions)
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

    pane.pty = p
    pane.ring = []
    pane.status = 'running'
    pane.lastEvent = undefined
    pane.lastOutputTime = Date.now()

    this.emit('pane:clear', { id })
    this.attachPtyHandlers(pane, p, gen)
    this.startHeartbeat(pane)
    this.emitListUpdate()
    return this.toInfo(pane)
  }

  close(id: string): void {
    const pane = this.panes.get(id)
    if (!pane) return
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    if (pane.heartbeatTimer) clearInterval(pane.heartbeatTimer)
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

  /** Update notification intervals (in minutes) and restart timers */
  setNotifyIntervals(heartbeatMin: number, idleMin: number): void {
    HEARTBEAT_INTERVAL = heartbeatMin * 60 * 1000
    QUIET_THRESHOLD = idleMin * 60 * 1000
    // Restart timers on all running panes
    for (const pane of this.panes.values()) {
      if (pane.status === 'running') {
        if (pane.heartbeatTimer) clearInterval(pane.heartbeatTimer)
        this.startHeartbeat(pane)
        this.resetQuietTimer(pane)
      }
    }
  }

  /** Get pane index (1-based) for IM display */
  paneIndex(id: string): number {
    const ids = Array.from(this.panes.keys())
    return ids.indexOf(id) + 1
  }

  private attachPtyHandlers(pane: PaneInternal, p: pty.IPty, gen: number): void {
    const id = pane.id

    p.onData((data: string) => {
      if (pane.ptyGeneration !== gen) return

      this.emit('pane:output', { id, data })

      const stripped = stripAnsi(data)
      const lines = stripped.split('\n')
      pane.ring.push(...lines)
      if (pane.ring.length > 2000) pane.ring.splice(0, pane.ring.length - 2000)

      pane.lastOutputTime = Date.now()
      this.resetQuietTimer(pane)

      const event = this.analyzer.feed(pane.ring, stripped)
      if (event) this.handleEvent(pane, event, stripped)
    })

    p.onExit(({ exitCode }) => {
      if (pane.ptyGeneration !== gen) return
      if (this.panes.has(id)) {
        pane.status = 'idle'
        if (pane.quietTimer) clearTimeout(pane.quietTimer)
        if (pane.heartbeatTimer) clearInterval(pane.heartbeatTimer)
        this.emit('pane:exit', { id, exitCode })
        this.emitListUpdate()
      }
    })
  }

  /** Periodic heartbeat: emit progress summary if pane is actively producing output */
  private startHeartbeat(pane: PaneInternal): void {
    pane.heartbeatTimer = setInterval(() => {
      // Only send heartbeat if pane has had output recently (active, not idle)
      const sinceLastOutput = Date.now() - pane.lastOutputTime
      if (sinceLastOutput < HEARTBEAT_INTERVAL && pane.status === 'running') {
        const summary = pane.ring.slice(-5).join('\n').trim()
        if (summary) {
          this.emit('pane:event', {
            id: pane.id,
            event: { type: 'heartbeat', content: summary, time: Date.now() }
          })
        }
      }
    }, HEARTBEAT_INTERVAL)
  }

  cleanup(): void {
    for (const pane of this.panes.values()) {
      if (pane.quietTimer) clearTimeout(pane.quietTimer)
      if (pane.heartbeatTimer) clearInterval(pane.heartbeatTimer)
      try { pane.pty.kill() } catch { /* ignore */ }
    }
    this.panes.clear()
  }

  private resolveCmd(
    type: PaneType,
    shellVariant: string,
    sessionId?: string | null,
    isResume?: boolean,
    bypass?: boolean
  ): { cmd: string; args: string[] } {
    const isWin = process.platform === 'win32'
    switch (type) {
      case 'claude': {
        const claudeArgs: string[] = []
        if (bypass) {
          claudeArgs.push('--dangerously-skip-permissions')
        }
        if (isResume && sessionId) {
          // App-level session restore: resume specific session
          claudeArgs.push('--resume', sessionId)
        } else if (sessionId) {
          // Fresh start or in-app restart: use --continue to pick up where left off
          claudeArgs.push('--continue')
        }
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'claude', ...claudeArgs] }
        }
        return { cmd: 'claude', args: claudeArgs }
      }
      case 'codex': {
        if (sessionId && isResume) {
          const codexArgs = ['resume', sessionId]
          if (isWin) {
            return { cmd: 'cmd.exe', args: ['/c', 'codex', ...codexArgs] }
          }
          return { cmd: 'codex', args: codexArgs }
        }
        const codexArgs: string[] = []
        if (bypass) {
          codexArgs.push('--dangerously-bypass-approvals-and-sandbox')
        }
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'codex', ...codexArgs] }
        }
        return { cmd: 'codex', args: codexArgs }
      }
      case 'shell':
        return this.resolveShell(shellVariant, isWin)
    }
  }

  /** Path to Codex session index file */
  private get codexIndexPath(): string {
    return join(homedir(), '.codex', 'session_index.jsonl')
  }

  private countCodexSessions(): number {
    try {
      const content = readFileSync(this.codexIndexPath, 'utf-8')
      return content.trim().split('\n').length
    } catch {
      return 0
    }
  }

  private captureCodexSessionId(pane: PaneInternal, linesBefore: number): void {
    let attempts = 0
    const maxAttempts = 30

    const check = (): void => {
      attempts++
      if (!this.panes.has(pane.id)) return

      try {
        const content = readFileSync(this.codexIndexPath, 'utf-8')
        const lines = content.trim().split('\n')
        if (lines.length > linesBefore) {
          const lastLine = lines[lines.length - 1]
          const entry = JSON.parse(lastLine) as { id: string }
          if (entry.id) {
            pane.sessionId = entry.id
            console.log(`[PTY] Captured Codex session ID for ${pane.id}: ${entry.id}`)
            return
          }
        }
      } catch { /* ignore */ }

      if (attempts < maxAttempts) {
        setTimeout(check, 1000)
      }
    }

    setTimeout(check, 2000)
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
    // bypass mode: agent never asks for confirmation, so skip confirm events
    if (event.type === 'confirm' && pane.bypassPermissions) return

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
    if (RISK_HIGH.test(text) || RISK_MED.test(text)) return null
    return 'y'
  }

  private resetQuietTimer(pane: PaneInternal): void {
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    pane.quietTimer = setTimeout(() => {
      const mins = Math.round(QUIET_THRESHOLD / 60000)
      pane.lastEvent = { type: 'idle', content: `已静默 ${mins} 分钟`, time: Date.now() }
      this.emit('pane:event', { id: pane.id, event: pane.lastEvent })
    }, QUIET_THRESHOLD)
  }

  private emitListUpdate(): void {
    this.emit('pane:listUpdate', this.list())
  }

  getSessionConfig(): Array<{ type: string; cwd: string; yoloLevel: string; sessionId?: string; bypassPermissions?: boolean }> {
    return Array.from(this.panes.values()).map(p => ({
      type: p.shellVariant ? `shell:${p.shellVariant}` : p.type,
      cwd: p.cwd,
      yoloLevel: p.yoloLevel,
      ...(p.sessionId ? { sessionId: p.sessionId } : {}),
      ...(p.bypassPermissions ? { bypassPermissions: true } : {})
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
      bypassPermissions: pane.bypassPermissions,
      lastEvent: pane.lastEvent
    }
  }
}
