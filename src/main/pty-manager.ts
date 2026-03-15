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
  lastEvent?: { type: string; content: string; time: number }
}

interface PaneInternal extends PaneInfo {
  pty: pty.IPty
  ptyGeneration: number  // incremented on restart to ignore stale onExit
  shellVariant: string   // for shell type: 'cmd' | 'powershell' | 'gitbash' | 'wsl'
  ring: string[]
  quietTimer: ReturnType<typeof setTimeout> | null
  sessionId: string | null  // Claude Code session UUID for resume
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

  /**
   * Create a new pane.
   * @param opts.resumeSessionId — if set, resume this Claude session instead of starting fresh
   */
  create(typeStr: string, cwd: string, opts?: { resumeSessionId?: string }): PaneInfo {
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

    // For agent panes: track session ID for resume on restart
    let sessionId: string | null = null
    if (type === 'claude') {
      // Claude Code supports --session-id to assign UUID at launch
      sessionId = opts?.resumeSessionId ?? randomUUID()
    } else if (type === 'codex' && opts?.resumeSessionId) {
      // Codex: we have a saved session ID to resume
      sessionId = opts.resumeSessionId
    }

    // For Codex fresh start: snapshot session_index.jsonl line count before spawn
    let codexIndexLinesBefore = 0
    if (type === 'codex' && !opts?.resumeSessionId) {
      codexIndexLinesBefore = this.countCodexSessions()
    }

    const { cmd, args } = this.resolveCmd(type, shellVariant, sessionId, !!opts?.resumeSessionId)

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
      quietTimer: null,
      sessionId
    }

    this.panes.set(id, pane)
    this.attachPtyHandlers(pane, p, pane.ptyGeneration)

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

    // Bump generation so old onExit/onData handlers become no-ops
    pane.ptyGeneration++
    const gen = pane.ptyGeneration

    // Kill old PTY
    if (pane.quietTimer) clearTimeout(pane.quietTimer)
    try { pane.pty.kill() } catch { /* ignore */ }

    // Respawn with same config — for Claude, resume the same session
    const { cmd, args } = this.resolveCmd(pane.type, pane.shellVariant, pane.sessionId, !!pane.sessionId)
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

    // Reset pane state, keep id/title/cwd/yoloLevel/sessionId
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

  /**
   * Resolve the command and args for a pane type.
   * For Claude: uses --session-id on fresh start, --resume on restore.
   */
  private resolveCmd(
    type: PaneType,
    shellVariant: string,
    sessionId?: string | null,
    isResume?: boolean
  ): { cmd: string; args: string[] } {
    const isWin = process.platform === 'win32'
    switch (type) {
      case 'claude': {
        const claudeArgs: string[] = []
        if (sessionId) {
          if (isResume) {
            // Restoring from saved session — resume that exact conversation
            claudeArgs.push('--resume', sessionId)
          } else {
            // Fresh launch — assign a UUID so we can resume it later
            claudeArgs.push('--session-id', sessionId)
          }
        }
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'claude', ...claudeArgs] }
        }
        return { cmd: 'claude', args: claudeArgs }
      }
      case 'codex': {
        if (sessionId && isResume) {
          // Resume a specific Codex session
          const codexArgs = ['resume', sessionId]
          if (isWin) {
            return { cmd: 'cmd.exe', args: ['/c', 'codex', ...codexArgs] }
          }
          return { cmd: 'codex', args: codexArgs }
        }
        // Fresh start
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'codex'] }
        }
        return { cmd: 'codex', args: [] }
      }
      case 'shell':
        return this.resolveShell(shellVariant, isWin)
    }
  }

  /** Path to Codex session index file */
  private get codexIndexPath(): string {
    return join(homedir(), '.codex', 'session_index.jsonl')
  }

  /** Count lines in Codex session_index.jsonl */
  private countCodexSessions(): number {
    try {
      const content = readFileSync(this.codexIndexPath, 'utf-8')
      return content.trim().split('\n').length
    } catch {
      return 0
    }
  }

  /**
   * After Codex starts, poll session_index.jsonl for the new session entry.
   * Codex writes a new line when the session is created.
   */
  private captureCodexSessionId(pane: PaneInternal, linesBefore: number): void {
    let attempts = 0
    const maxAttempts = 30  // try for up to 30 seconds

    const check = (): void => {
      attempts++
      if (!this.panes.has(pane.id)) return  // pane was closed

      try {
        const content = readFileSync(this.codexIndexPath, 'utf-8')
        const lines = content.trim().split('\n')
        if (lines.length > linesBefore) {
          // New session(s) appeared — take the latest one
          const lastLine = lines[lines.length - 1]
          const entry = JSON.parse(lastLine) as { id: string; thread_name?: string }
          if (entry.id) {
            pane.sessionId = entry.id
            console.log(`[PTY] Captured Codex session ID for ${pane.id}: ${entry.id}`)
            return
          }
        }
      } catch { /* file not found or parse error */ }

      if (attempts < maxAttempts) {
        setTimeout(check, 1000)
      }
    }

    // Start checking after a short delay (Codex needs time to initialize)
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
  getSessionConfig(): Array<{ type: string; cwd: string; yoloLevel: string; sessionId?: string }> {
    return Array.from(this.panes.values()).map(p => ({
      type: p.shellVariant ? `shell:${p.shellVariant}` : p.type,
      cwd: p.cwd,
      yoloLevel: p.yoloLevel,
      ...(p.sessionId ? { sessionId: p.sessionId } : {})
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
