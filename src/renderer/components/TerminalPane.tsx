import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { PaneInfo, YoloLevel } from '../types'

const TYPE_COLORS: Record<string, string> = {
  claude: '#2ea043',
  codex: '#388bfd',
  shell: '#6e7681'
}

function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-2).join('/')
}

interface Props {
  pane: PaneInfo
  active: boolean
  onActivate: () => void
  onClose: () => void
  onRestart: () => void
  onYoloChange: (level: YoloLevel) => void
  onRename: (title: string) => void
}

export default function TerminalPane({ pane, active, onActivate, onClose, onRestart, onYoloChange, onRename }: Props) {
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

  // Auto-focus terminal when pane becomes active
  useEffect(() => {
    if (active && termRef.current) {
      termRef.current.focus()
    }
  }, [active])

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
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.35,
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

    // Fit after opening (need a frame for DOM to settle)
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        window.api.resizePane(pane.id, term.cols, term.rows)
      } catch { /* ignore */ }
    })

    // Input: terminal keystrokes → main process PTY
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
        term.write(`\r\n\x1b[90m[进程已退出，代码: ${msg.exitCode}。按 ↻ 重启]\x1b[0m\r\n`)
      }
    })

    // Clear terminal on restart
    const unsubClear = window.api.onPaneClear((msg) => {
      if (msg.id === pane.id) {
        term.clear()
        term.reset()
        try {
          fitAddon.fit()
          window.api.resizePane(pane.id, term.cols, term.rows)
        } catch { /* ignore */ }
      }
    })

    // Resize observer: auto-fit when container size changes
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        window.api.resizePane(pane.id, term.cols, term.rows)
      } catch { /* ignore */ }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      inputDisposable.dispose()
      unsubOutput()
      unsubExit()
      unsubClear()
      resizeObserver.disconnect()
      term.dispose()
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
          <span className="pane-title" onDoubleClick={handleDoubleClick} title="双击重命名">
            {pane.title}
          </span>
        )}
        <span className="pane-cwd" title={pane.cwd}>{shortenPath(pane.cwd)}</span>
        {pane.lastEvent && pane.status !== 'running' && (
          <span className={`pane-event-badge pane-event-${pane.status}`}>
            {pane.status === 'confirm' ? '需确认' :
             pane.status === 'done' ? '已完成' :
             pane.status === 'error' ? '错误' :
             pane.status === 'idle' ? '空闲' : ''}
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
          <select
            className="yolo-select"
            value={pane.yoloLevel}
            onChange={e => onYoloChange(e.target.value as YoloLevel)}
            onClick={e => e.stopPropagation()}
          >
            <option value="off">手动</option>
            <option value="safe">Safe</option>
            <option value="full">Full-Auto</option>
          </select>
          <button
            className="restart-btn"
            onClick={e => { e.stopPropagation(); onRestart() }}
            title="重启进程"
          >
            ↻
          </button>
          <button
            className="close-btn"
            onClick={e => { e.stopPropagation(); onClose() }}
            title="关闭"
          >
            ×
          </button>
        </div>
      </div>
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}
