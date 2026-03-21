import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as pty from 'node-pty'
import { Analyzer, cleanTerminalOutput, extractLineContent, type AnalyzerEvent } from './bridge/analyzer'

export type PaneType = string   // dynamic: 'claude' | 'codex' | 'gemini' | 'aider' | 'shell'
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
  /** Use --continue to resume most recent conversation (session restore fallback) */
  continueSession?: boolean
  bypassPermissions?: boolean
  /** Extra CLI flags to pass verbatim when spawning/restarting the agent */
  extraArgs?: string[]
}

/** Circular buffer — O(1) push, O(1) trim, no array copies */
class RingBuffer {
  private buf: string[]
  private head = 0
  private count = 0
  constructor(private capacity: number) {
    this.buf = new Array(capacity)
  }
  push(line: string): void {
    this.buf[(this.head + this.count) % this.capacity] = line
    if (this.count < this.capacity) {
      this.count++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }
  /** Return last n items (or all if n > count) */
  last(n: number): string[] {
    const take = Math.min(n, this.count)
    const start = (this.head + this.count - take) % this.capacity
    const result: string[] = []
    for (let i = 0; i < take; i++) {
      result.push(this.buf[(start + i) % this.capacity])
    }
    return result
  }
  get length(): number { return this.count }
  clear(): void { this.head = 0; this.count = 0 }
}

interface PaneInternal extends PaneInfo {
  pty: pty.IPty
  ptyGeneration: number
  shellVariant: string
  ring: RingBuffer
  quietTimer: ReturnType<typeof setTimeout> | null
  quietTimerDirty: boolean  // debounce quiet timer resets
  heartbeatTimer: ReturnType<typeof setInterval> | null
  lastOutputTime: number  // track active vs quiet
  sessionId: string | null
  /** Lines seen during the startup chrome recording window (banner/headers/UI) */
  chromeLines: Set<string>
  /** Record output as chrome until this timestamp (0 = not recording) */
  chromeRecordUntil: number
  /** Extra CLI flags preserved through restart and session restore */
  extraArgs: string[]
}

const RISK_HIGH = /rm\s+-|drop\s+|git\s+push|sudo|format|truncate|delete/i
const RISK_MED = /bash|shell|execute|run\s+command/i
let QUIET_THRESHOLD = 15 * 60 * 1000   // 15 min — idle notification (configurable)
let HEARTBEAT_INTERVAL = 10 * 60 * 1000 // 10 min — progress heartbeat (configurable)
let HEARTBEAT_ENABLED = true
let QUIET_ENABLED = true

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
    const title = displayName

    const bypass = opts?.bypassPermissions ?? false

    // For agent panes: track session ID for resume on restart
    // Claude: --resume <id> (captured from ~/.claude/projects/)
    // Codex: codex resume <id> (captured from session_index.jsonl)
    let sessionId: string | null = null
    if ((type === 'claude' || type === 'codex') && opts?.resumeSessionId) {
      sessionId = opts.resumeSessionId
    }

    // For Codex fresh start: snapshot session_index.jsonl line count before spawn
    let codexIndexLinesBefore = 0
    if (type === 'codex' && !opts?.resumeSessionId) {
      codexIndexLinesBefore = this.countCodexSessions()
    }

    // Record spawn time so we can find session files created AFTER this moment
    const spawnTime = Date.now()

    const continueSession = !sessionId && (opts?.continueSession ?? false)
    const extraArgs = opts?.extraArgs ?? []
    const { cmd, args } = this.resolveCmd(type, shellVariant, sessionId, !!opts?.resumeSessionId, continueSession, bypass, extraArgs)

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

    // Record startup chrome only for fresh agent panes (not restore/continue).
    // Resume/continue panes replay session history which is NOT chrome.
    const isAgentFresh = (type === 'claude' || type === 'codex')
      && !opts?.resumeSessionId && !opts?.continueSession

    const pane: PaneInternal = {
      id, title, type, cwd,
      status: 'running',
      yoloLevel: 'off',
      bypassPermissions: bypass,
      pty: p,
      ptyGeneration: 0,
      shellVariant,
      ring: new RingBuffer(2000),
      quietTimer: null,
      quietTimerDirty: false,
      heartbeatTimer: null,
      lastOutputTime: Date.now(),
      sessionId,
      chromeLines: new Set(),
      chromeRecordUntil: isAgentFresh ? Date.now() + 7000 : 0,
      extraArgs,
    }

    this.panes.set(id, pane)
    this.attachPtyHandlers(pane, p, pane.ptyGeneration)
    this.startHeartbeat(pane)

    // For Codex fresh start: detect the new session ID after Codex creates it
    if (type === 'codex' && !opts?.resumeSessionId) {
      this.captureCodexSessionId(pane, codexIndexLinesBefore)
    }

    // For Claude fresh start: detect the new session ID by file creation time
    if (type === 'claude' && !opts?.resumeSessionId) {
      this.captureClaudeSessionId(pane, spawnTime)
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

    // On in-app restart: use --resume <id> if we have a session ID, else --continue
    // Restart: use --resume if we have session ID, else --continue (not fresh)
    const { cmd, args } = this.resolveCmd(pane.type, pane.shellVariant, pane.sessionId, !!pane.sessionId, !pane.sessionId, pane.bypassPermissions, pane.extraArgs)
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
    pane.ring.clear()
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
    return this.panes.get(id)?.ring.last(60) ?? []
  }

  list(): PaneInfo[] {
    return Array.from(this.panes.values()).map(p => this.toInfo(p))
  }

  /** Reorder panes by id list. Missing ids are ignored; unmentioned panes append. */
  reorder(ids: string[]): void {
    const seen = new Set<string>()
    const ordered: Array<[string, PaneInternal]> = []

    for (const id of ids) {
      if (seen.has(id)) continue
      const pane = this.panes.get(id)
      if (!pane) continue
      ordered.push([id, pane])
      seen.add(id)
    }

    for (const [id, pane] of this.panes.entries()) {
      if (seen.has(id)) continue
      ordered.push([id, pane])
    }

    const currentIds = Array.from(this.panes.keys())
    const nextIds = ordered.map(([id]) => id)
    const changed =
      currentIds.length !== nextIds.length ||
      currentIds.some((id, idx) => id !== nextIds[idx])

    if (!changed) return

    this.panes = new Map(ordered)
    this.emitListUpdate()
  }

  /** Update notification intervals/enabled flags and restart timers */
  setNotifyIntervals(heartbeatMin: number, heartbeatEnabled: boolean, idleMin: number, idleEnabled: boolean): void {
    HEARTBEAT_INTERVAL = heartbeatMin * 60 * 1000
    QUIET_THRESHOLD = idleMin * 60 * 1000
    HEARTBEAT_ENABLED = heartbeatEnabled
    QUIET_ENABLED = idleEnabled
    // Restart (or stop) timers on all running panes
    for (const pane of this.panes.values()) {
      if (pane.status === 'running') {
        if (pane.heartbeatTimer) { clearInterval(pane.heartbeatTimer); pane.heartbeatTimer = null }
        if (pane.quietTimer) { clearTimeout(pane.quietTimer); pane.quietTimer = null }
        if (HEARTBEAT_ENABLED) this.startHeartbeat(pane)
        if (QUIET_ENABLED) this.resetQuietTimer(pane)
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

      // Strip ANSI and push lines into circular buffer — O(1) per line, no splice/shift
      const stripped = stripAnsi(data)
      const recordingChrome = pane.chromeRecordUntil > 0 && Date.now() < pane.chromeRecordUntil
      let start = 0
      for (let i = 0; i < stripped.length; i++) {
        if (stripped.charCodeAt(i) === 10) { // '\n'
          const line = stripped.substring(start, i)
          pane.ring.push(line)
          // Record startup chrome fingerprint: content extracted from each line
          if (recordingChrome) {
            const content = extractLineContent(line)
            if (content.length >= 4) pane.chromeLines.add(content)
          }
          start = i + 1
        }
      }
      if (start < stripped.length) {
        const line = stripped.substring(start)
        pane.ring.push(line)
        if (recordingChrome) {
          const content = extractLineContent(line)
          if (content.length >= 4) pane.chromeLines.add(content)
        }
      }

      pane.lastOutputTime = Date.now()

      // Debounced quiet timer reset — only reschedule at most once per second
      if (!pane.quietTimerDirty) {
        pane.quietTimerDirty = true
        setTimeout(() => {
          pane.quietTimerDirty = false
          this.resetQuietTimer(pane)
        }, 1000)
      }

      // Analyzer only runs regex on the current chunk, not the whole ring
      const event = this.analyzer.feed(pane.ring, stripped, pane.chromeLines)
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
    if (!HEARTBEAT_ENABLED) return
    pane.heartbeatTimer = setInterval(() => {
      // Only send heartbeat if pane has had output recently (active, not idle)
      const sinceLastOutput = Date.now() - pane.lastOutputTime
      if (sinceLastOutput < HEARTBEAT_INTERVAL && pane.status === 'running') {
        const summary = cleanTerminalOutput(pane.ring.last(5).join('\n'), pane.chromeLines)
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
    isContinue?: boolean,
    bypass?: boolean,
    extraArgs?: string[]
  ): { cmd: string; args: string[] } {
    const isWin = process.platform === 'win32'
    const extra = extraArgs ?? []
    switch (type) {
      case 'claude': {
        // --resume <id>: exact session restore
        // --continue: resume most recent (session restore fallback / restart)
        // (none): fresh new conversation
        const claudeArgs: string[] = sessionId && isResume
          ? ['--resume', sessionId]
          : isContinue
            ? ['--continue']
            : []
        if (bypass) {
          claudeArgs.push('--dangerously-skip-permissions')
        }
        claudeArgs.push(...extra)
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'claude', ...claudeArgs] }
        }
        return { cmd: 'claude', args: claudeArgs }
      }
      case 'codex': {
        if (sessionId && isResume) {
          const codexArgs = ['resume', sessionId, ...extra]
          if (isWin) {
            return { cmd: 'cmd.exe', args: ['/c', 'codex', ...codexArgs] }
          }
          return { cmd: 'codex', args: codexArgs }
        }
        const codexArgs: string[] = []
        if (bypass) {
          codexArgs.push('--dangerously-bypass-approvals-and-sandbox')
        }
        codexArgs.push(...extra)
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', 'codex', ...codexArgs] }
        }
        return { cmd: 'codex', args: codexArgs }
      }
      case 'shell':
        return this.resolveShell(shellVariant, isWin)
      case 'gemini': {
        const geminiArgs: string[] = []
        if (bypass) geminiArgs.push('--yolo')
        geminiArgs.push(...extra)
        if (isWin) return { cmd: 'cmd.exe', args: ['/c', 'gemini', ...geminiArgs] }
        return { cmd: 'gemini', args: geminiArgs }
      }
      case 'kimi': {
        const kimiArgs: string[] = []
        if (bypass) kimiArgs.push('--yolo')
        kimiArgs.push(...extra)
        if (isWin) return { cmd: 'cmd.exe', args: ['/c', 'kimi', ...kimiArgs] }
        return { cmd: 'kimi', args: kimiArgs }
      }
      case 'aider': {
        const aiderArgs: string[] = []
        if (bypass) aiderArgs.push('--yes')
        aiderArgs.push(...extra)
        if (isWin) return { cmd: 'cmd.exe', args: ['/c', 'aider', ...aiderArgs] }
        return { cmd: 'aider', args: aiderArgs }
      }
      default: {
        // Generic agent CLI (aider, etc.)
        if (isWin) {
          return { cmd: 'cmd.exe', args: ['/c', type, ...extra] }
        }
        return { cmd: type, args: [...extra] }
      }
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

  /** Claude Code project directory base */
  private get claudeProjectsDir(): string {
    return join(homedir(), '.claude', 'projects')
  }

  /**
   * Convert a CWD path to Claude Code's project directory name.
   * Claude encodes: `:`, `\`, `/` → `-`; non-ASCII chars → `-`
   * e.g. `D:\prjs\open\EasyAgentCli` → `D--prjs-open-EasyAgentCli`
   */
  private cwdToClaudeProjectDir(cwd: string): string {
    const trimmed = cwd.replace(/[\\/]+$/, '') // strip trailing separators
    return trimmed.replace(/[:\\/]/g, '-').replace(/[^\x20-\x7E]/g, '-')
  }

  /**
   * Find a .jsonl session file whose creation time (birthtimeMs) is after spawnTime.
   * Returns the newest such file, or null if none found.
   * Using birthtimeMs avoids the race condition where another Claude instance
   * keeps updating an EXISTING session file's mtime after our spawn.
   */
  private findSessionCreatedAfter(dir: string, spawnTime: number): { id: string } | null {
    try {
      const entries = readdirSync(dir)
      let newest: { id: string; birthtimeMs: number } | null = null
      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue
        try {
          const st = statSync(join(dir, entry))
          // birthtimeMs = file creation time (reliable on Windows/NTFS)
          if (st.birthtimeMs > spawnTime) {
            if (!newest || st.birthtimeMs > newest.birthtimeMs) {
              newest = { id: entry.replace('.jsonl', ''), birthtimeMs: st.birthtimeMs }
            }
          }
        } catch { /* skip */ }
      }
      return newest ? { id: newest.id } : null
    } catch {
      return null
    }
  }

  /**
   * After Claude starts, poll for a new session file created after spawnTime.
   *
   * Strategy:
   * 1. Check the CWD-specific project directory first (fast path).
   * 2. If not found after maxAttempts, do a global scan of ALL project
   *    directories — this handles cases where our path encoding doesn't
   *    exactly match what Claude used.
   *
   * Using file creation time (birthtimeMs) instead of mtime ensures we
   * never mistake an existing session (from Windows Terminal or other
   * Claude instances) for the one we just spawned.
   */
  private captureClaudeSessionId(pane: PaneInternal, spawnTime: number): void {
    const dirName = this.cwdToClaudeProjectDir(pane.cwd)
    const projectDir = join(this.claudeProjectsDir, dirName)
    let attempts = 0
    const maxAttempts = 30

    const check = (): void => {
      attempts++
      if (!this.panes.has(pane.id)) return

      const found = this.findSessionCreatedAfter(projectDir, spawnTime)
      if (found) {
        pane.sessionId = found.id
        console.log(`[PTY] Captured Claude session ID for ${pane.id}: ${found.id}`)
        return
      }

      if (attempts < maxAttempts) {
        setTimeout(check, 1500)
      } else {
        // Fallback: scan ALL project directories in case our path encoding
        // doesn't match Claude's (e.g. different slash/case handling)
        console.log(`[PTY] CWD-specific lookup failed for ${pane.id}, trying global scan`)
        this.captureClaudeSessionIdGlobal(pane, spawnTime)
      }
    }

    // Give Claude a few seconds to initialise and create the session file
    setTimeout(check, 3000)
  }

  /** Global fallback: scan all ~/.claude/projects/ subdirs for a new session */
  private captureClaudeSessionIdGlobal(pane: PaneInternal, spawnTime: number): void {
    const projectsDir = this.claudeProjectsDir
    let attempts = 0
    const maxAttempts = 10

    const check = (): void => {
      attempts++
      if (!this.panes.has(pane.id)) return

      try {
        const projects = readdirSync(projectsDir)
        let newest: { id: string; birthtimeMs: number } | null = null
        for (const proj of projects) {
          const projDir = join(projectsDir, proj)
          try {
            const entries = readdirSync(projDir)
            for (const entry of entries) {
              if (!entry.endsWith('.jsonl')) continue
              try {
                const st = statSync(join(projDir, entry))
                if (st.birthtimeMs > spawnTime) {
                  if (!newest || st.birthtimeMs > newest.birthtimeMs) {
                    newest = { id: entry.replace('.jsonl', ''), birthtimeMs: st.birthtimeMs }
                  }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
        if (newest) {
          pane.sessionId = newest.id
          console.log(`[PTY] Captured Claude session ID for ${pane.id} (global): ${newest.id}`)
          return
        }
      } catch { /* ignore */ }

      if (attempts < maxAttempts) {
        setTimeout(check, 2000)
      }
    }

    check()
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
    if (!QUIET_ENABLED) return
    pane.quietTimer = setTimeout(() => {
      const mins = Math.round(QUIET_THRESHOLD / 60000)
      // Include the last ~15 filtered lines so the user can see what was happening
      const lastOutput = cleanTerminalOutput(pane.ring.last(15).join('\n'), pane.chromeLines)
      const content = lastOutput
        ? `已静默 ${mins} 分钟\n\n最后输出:\n${lastOutput}`
        : `已静默 ${mins} 分钟`
      pane.lastEvent = { type: 'idle', content, time: Date.now() }
      this.emit('pane:event', { id: pane.id, event: pane.lastEvent })
    }, QUIET_THRESHOLD)
  }

  private emitListUpdate(): void {
    this.emit('pane:listUpdate', this.list())
  }

  getSessionConfig(): Array<{ type: string; cwd: string; yoloLevel: string; title?: string; sessionId?: string; bypassPermissions?: boolean; extraArgs?: string[] }> {
    return Array.from(this.panes.values()).map(p => ({
      type: p.shellVariant ? `shell:${p.shellVariant}` : p.type,
      cwd: p.cwd,
      yoloLevel: p.yoloLevel,
      title: p.title,
      ...(p.sessionId ? { sessionId: p.sessionId } : {}),
      ...(p.bypassPermissions ? { bypassPermissions: true } : {}),
      ...(p.extraArgs.length > 0 ? { extraArgs: p.extraArgs } : {}),
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
