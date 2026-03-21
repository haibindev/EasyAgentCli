import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import '@xterm/xterm/css/xterm.css'
import type { PaneInfo, YoloLevel } from '../types'
import { useI18n } from '../i18n-context'

const TYPE_COLORS: Record<string, string> = {
  claude: '#2ea043',
  codex: '#388bfd',
  gemini: '#4285f4',
  aider: '#e8a838',
  shell: '#6e7681',
}

function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-2).join('/')
}

interface Props {
  pane: PaneInfo
  paneIndex: number  // 1-based display index
  active: boolean
  focusTrigger: number  // increment from parent to force re-focus (e.g. sidebar click)
  onActivate: () => void
  onClose: () => void
  onRestart: () => void
  onYoloChange: (level: YoloLevel) => void
  onRename: (title: string) => void
}

export default function TerminalPane({ pane, paneIndex, active, focusTrigger, onActivate, onClose, onRestart, onYoloChange, onRename }: Props) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(pane.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [pane.title])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== pane.title) {
      onRename(trimmed)
    }
    setEditing(false)
  }, [editTitle, pane.title, onRename])

  const handleRenameKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    if (e.key === 'Escape') setEditing(false)
  }, [handleRenameSubmit])

  // Focus terminal when this pane becomes active, or when focusTrigger changes
  // (sidebar click increments focusTrigger even if active pane doesn't change,
  // ensuring the terminal reclaims focus after the sidebar button took it).
  useEffect(() => {
    if (active && termRef.current) {
      requestAnimationFrame(() => termRef.current?.focus())
    }
  }, [active, focusTrigger])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#0d1117',
        brightBlack: '#6e7681',
        red: '#ff7b72',
        brightRed: '#ffa198',
        green: '#3fb950',
        brightGreen: '#56d364',
        yellow: '#d29922',
        brightYellow: '#e3b341',
        blue: '#388bfd',
        brightBlue: '#79c0ff',
        magenta: '#bc8cff',
        brightMagenta: '#d2a8ff',
        cyan: '#39c5cf',
        brightCyan: '#56d4dd',
        white: '#b1bac4',
        brightWhite: '#f0f6fc'
      },
      fontFamily: '"Cascadia Mono", "Cascadia Code", "Consolas", "JetBrains Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fitAddon



    // Track last known size to avoid no-op resizes
    let lastCols = 0
    let lastRows = 0

    const safeFit = (forceResize = false) => {
      try {
        fitAddon.fit()
        if (forceResize || term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols
          lastRows = term.rows
          window.api.resizePane(pane.id, term.cols, term.rows)
        }
      } catch { /* ignore */ }
    }

    // Fit after opening and focus the terminal (need a frame for DOM to settle)
    // Note: the active-focus effect runs before the terminal is created, so we
    // must also focus here on initial mount.
    requestAnimationFrame(() => {
      safeFit(true)
      term.focus()
    })

    // Gemini CLI's Ink UI can misplace the cursor if it misses the first size
    // update during startup. Force a couple of extra resize signals.
    let geminiRefitTimer1: ReturnType<typeof setTimeout> | null = null
    let geminiRefitTimer2: ReturnType<typeof setTimeout> | null = null
    if (pane.type === 'gemini') {
      geminiRefitTimer1 = setTimeout(() => safeFit(true), 150)
      geminiRefitTimer2 = setTimeout(() => safeFit(true), 500)
    }

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      // Ctrl+C with selection → copy instead of sending SIGINT
      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      return true
    })

    // Right-click: paste from clipboard (common terminal convention)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      navigator.clipboard.readText().then(text => {
        if (text) window.api.writePane(pane.id, text)
      })
    }
    const container = containerRef.current
    containerRef.current.addEventListener('contextmenu', handleContextMenu)

    const inputDisposable = term.onData((data) => {
      window.api.writePane(pane.id, data)
    })

    // Output: main process PTY → terminal display
    const unsubOutput = window.api.onPaneOutput((msg) => {
      if (msg.id === pane.id) {
        term.write(msg.data)
      }
    })

    // Show exit message when PTY process exits
    const unsubExit = window.api.onPaneExit((msg) => {
      if (msg.id === pane.id) {
        term.write(`\r\n\x1b[90m${t.processExited(msg.exitCode)}\x1b[0m\r\n`)
      }
    })

    // Clear terminal on restart
    const unsubClear = window.api.onPaneClear((msg) => {
      if (msg.id === pane.id) {
        term.clear()
        term.reset()
        lastCols = 0
        lastRows = 0
        safeFit()
      }
    })

    // Resize observer: auto-fit when container size changes (debounced)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(safeFit, 80)
    })
    resizeObserver.observe(containerRef.current)

    // Also handle window resize events (dispatched after pane close to force refresh)
    const handleWindowResize = () => {
      try {
        fitAddon.fit()
        term.refresh(0, term.rows - 1)
      } catch { /* ignore */ }
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      inputDisposable.dispose()
      unsubOutput()
      unsubExit()
      unsubClear()
      if (geminiRefitTimer1) clearTimeout(geminiRefitTimer1)
      if (geminiRefitTimer2) clearTimeout(geminiRefitTimer2)
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      container?.removeEventListener('contextmenu', handleContextMenu)
      try { term.dispose() } catch { /* prevent WebGL disposal errors from propagating */ }
      termRef.current = null
      fitRef.current = null
    }
  }, [pane.id])

  return (
    <div
      className={`terminal-pane ${active ? 'active' : ''}`}
      onClick={onActivate}
    >
      <div className="pane-header">
        <span
          className="pane-type-bar"
          style={{ background: TYPE_COLORS[pane.type] || TYPE_COLORS.shell }}
        />
        <span className="pane-index">#{paneIndex}</span>
        {editing ? (
          <input
            ref={inputRef}
            className="pane-title-input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKey}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="pane-title" onDoubleClick={handleDoubleClick} title={t.doubleClickRename}>
            {pane.title}
          </span>
        )}
        <span className="pane-cwd" title={pane.cwd}>{shortenPath(pane.cwd)}</span>
        {pane.lastEvent && pane.status !== 'running' && (
          <span className={`pane-event-badge pane-event-${pane.status}`}>
            {pane.status === 'confirm' ? t.badgeConfirm :
             pane.status === 'done' ? t.badgeDone :
             pane.status === 'error' ? t.badgeError :
             pane.status === 'idle' ? t.badgeIdle : ''}
          </span>
        )}
        <div className="pane-controls">
          <span
            className="status-dot"
            style={{
              background:
                pane.status === 'running' ? 'var(--green)' :
                pane.status === 'confirm' ? 'var(--amber)' :
                pane.status === 'error' ? 'var(--red)' :
                pane.status === 'done' ? 'var(--accent-claude)' :
                'var(--text-dim)'
            }}
          />
          {pane.bypassPermissions ? (
            <span className="bypass-badge" title={t.bypassPermissions}>🔓</span>
          ) : (
            <select
              className="yolo-select"
              value={pane.yoloLevel}
              onChange={e => onYoloChange(e.target.value as YoloLevel)}
              onClick={e => e.stopPropagation()}
            >
              <option value="off">{t.yoloManual}</option>
              <option value="safe">Safe</option>
              <option value="full">Full-Auto</option>
            </select>
          )}
          <button
            className="restart-btn"
            onClick={e => { e.stopPropagation(); onRestart() }}
            title={t.restartTitle}
          >
            ↻
          </button>
          <button
            className="close-btn"
            onClick={e => { e.stopPropagation(); onClose() }}
            title={t.closeTitle}
          >
            ×
          </button>
        </div>
      </div>
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}
