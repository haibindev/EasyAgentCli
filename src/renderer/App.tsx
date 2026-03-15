import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PaneInfo, PaneType, BridgeStatus, LayoutMode, YoloLevel } from './types'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import TerminalPane from './components/TerminalPane'
import NewPaneDialog from './components/NewPaneDialog'
import AdapterSettings from './components/AdapterSettings'
import ErrorBoundary from './components/ErrorBoundary'

const LAYOUT_KEY = 'eac:layout'

function loadLayout(): LayoutMode {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { rows: 1, cols: 2 }
}

function saveLayout(mode: LayoutMode): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(mode))
}

export default function App() {
  const [panes, setPanes] = useState<PaneInfo[]>([])
  const [activePane, setActivePane] = useState<string | null>(null)
  const [leaveMode, setLeaveMode] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    serverRunning: false, clientCount: 0, leaveMode: false
  })
  const [layout, setLayout] = useState<LayoutMode>(loadLayout)
  const [dialog, setDialog] = useState<{ visible: boolean; type: PaneType }>({
    visible: false, type: 'shell'
  })
  const [showSettings, setShowSettings] = useState(false)

  // Listen for pane list updates from main process
  useEffect(() => {
    const unsub = window.api.onPaneListUpdate((newPanes: PaneInfo[]) => {
      setPanes(newPanes)
    })
    const unsubBridge = window.api.onBridgeStatus((status: BridgeStatus) => {
      setBridgeStatus(status)
    })

    // Initial load
    window.api.listPanes().then(setPanes)
    window.api.getBridgeStatus().then(setBridgeStatus)

    return () => { unsub(); unsubBridge() }
  }, [])

  const handleSetLayout = useCallback((mode: LayoutMode) => {
    setLayout(mode)
    saveLayout(mode)
  }, [])

  const handleAddPane = useCallback((type: PaneType) => {
    setDialog({ visible: true, type })
  }, [])

  const handleCreatePane = useCallback(async (cwd: string, shellVariant?: string) => {
    const type = dialog.type
    setDialog({ visible: false, type: 'shell' })
    const pane = await window.api.createPane(
      shellVariant && type === 'shell' ? `shell:${shellVariant}` : type,
      cwd
    )
    setActivePane(pane.id)
  }, [dialog.type])

  const handleClosePane = useCallback(async (id: string) => {
    const pane = panes.find(p => p.id === id)
    if (pane && pane.status === 'running') {
      const ok = window.confirm(`"${pane.title}" 正在运行中，确定关闭？`)
      if (!ok) return
    }
    await window.api.closePane(id)
    if (activePane === id) {
      const idx = panes.findIndex(p => p.id === id)
      const next = panes[idx + 1] || panes[idx - 1]
      setActivePane(next?.id ?? null)
    }
  }, [activePane, panes])

  const handleRestartPane = useCallback(async (id: string) => {
    await window.api.restartPane(id)
  }, [])

  const handleYoloChange = useCallback(async (id: string, level: YoloLevel) => {
    await window.api.setYolo(id, level)
  }, [])

  const handleRenamePane = useCallback(async (id: string, title: string) => {
    await window.api.renamePane(id, title)
  }, [])

  const handleToggleLeaveMode = useCallback(async () => {
    const newMode = !leaveMode
    setLeaveMode(newMode)
    await window.api.setLeaveMode(newMode)
  }, [leaveMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case 'C': e.preventDefault(); handleAddPane('claude'); return
          case 'X': e.preventDefault(); handleAddPane('codex'); return
          case 'S': e.preventDefault(); handleAddPane('shell'); return
          case 'R':
            e.preventDefault()
            if (activePane) handleRestartPane(activePane)
            return
        }
      }
      if (e.ctrlKey && e.key === 'Tab' && panes.length > 1) {
        e.preventDefault()
        const curIdx = panes.findIndex(p => p.id === activePane)
        const dir = e.shiftKey ? -1 : 1
        const next = (curIdx + dir + panes.length) % panes.length
        setActivePane(panes[next].id)
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (activePane) handleClosePane(activePane)
        return
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleAddPane, handleRestartPane, handleClosePane, activePane, panes])

  // Build grid: rows x cols, fill with panes, handle overflow/underflow
  const grid = useMemo(() => {
    const { rows, cols } = layout
    const capacity = rows * cols
    // Actual rows needed: if panes > capacity, add extra rows
    const actualRows = panes.length > capacity
      ? Math.ceil(panes.length / cols)
      : rows
    const result: (PaneInfo | null)[][] = []
    for (let r = 0; r < actualRows; r++) {
      const row: (PaneInfo | null)[] = []
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        row.push(idx < panes.length ? panes[idx] : null)
      }
      result.push(row)
    }
    return result
  }, [layout, panes])

  const renderPane = (pane: PaneInfo) => (
    <ErrorBoundary>
      <TerminalPane
        pane={pane}
        active={activePane === pane.id}
        onActivate={() => setActivePane(pane.id)}
        onClose={() => handleClosePane(pane.id)}
        onRestart={() => handleRestartPane(pane.id)}
        onYoloChange={(level) => handleYoloChange(pane.id, level)}
        onRename={(title) => handleRenamePane(pane.id, title)}
      />
    </ErrorBoundary>
  )

  const renderEmptySlot = (key: string) => (
    <div className="empty-slot" key={key}>
      <div className="empty-slot-inner">
        <span className="empty-slot-hint">空位</span>
        <div className="empty-slot-btns">
          <button className="empty-slot-btn" onClick={() => handleAddPane('claude')}>
            <span style={{ color: 'var(--accent-claude)' }}>●</span> Claude
          </button>
          <button className="empty-slot-btn" onClick={() => handleAddPane('codex')}>
            <span style={{ color: 'var(--accent-codex)' }}>●</span> Codex
          </button>
          <button className="empty-slot-btn" onClick={() => handleAddPane('shell')}>
            <span style={{ color: 'var(--accent-shell)' }}>●</span> Shell
          </button>
        </div>
      </div>
    </div>
  )

  const isOverflow = panes.length > layout.rows * layout.cols
  const actualRows = grid.length
  const { cols } = layout

  // CSS Grid style — equal-sized cells
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${actualRows}, 1fr)`,
    gap: '2px',
    height: '100%',
    width: '100%',
    background: 'var(--border)' // gap color
  }

  return (
    <div className="app">
      <Toolbar
        leaveMode={leaveMode}
        layout={layout}
        overflowHint={isOverflow ? `超出 ${layout.rows}×${layout.cols} 布局，已自动扩展` : undefined}
        onAddPane={handleAddPane}
        onToggleLeaveMode={handleToggleLeaveMode}
        onSetLayout={handleSetLayout}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="pane-area">
        {panes.length === 0 ? (
          <div className="empty-state">
            <h2>EasyAgentCli</h2>
            <p>多窗格 AI Agent 终端管理器</p>
            <div className="quick-btns">
              <button className="quick-btn" onClick={() => handleAddPane('claude')}>
                <span style={{ color: 'var(--accent-claude)', fontSize: 20 }}>●</span>
                Claude Code
                <span className="label">Ctrl+Shift+C</span>
              </button>
              <button className="quick-btn" onClick={() => handleAddPane('codex')}>
                <span style={{ color: 'var(--accent-codex)', fontSize: 20 }}>●</span>
                Codex
                <span className="label">Ctrl+Shift+X</span>
              </button>
              <button className="quick-btn" onClick={() => handleAddPane('shell')}>
                <span style={{ color: 'var(--accent-shell)', fontSize: 20 }}>●</span>
                Shell
                <span className="label">Ctrl+Shift+S</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={gridStyle}>
            {grid.flat().map((cell, idx) =>
              cell ? (
                <div key={cell.id} className="grid-cell">
                  {renderPane(cell)}
                </div>
              ) : (
                renderEmptySlot(`empty-${idx}`)
              )
            )}
          </div>
        )}
      </div>

      <StatusBar
        panes={panes}
        bridgeStatus={bridgeStatus}
        leaveMode={leaveMode}
        activePane={activePane}
        onActivatePane={setActivePane}
      />

      {dialog.visible && (
        <NewPaneDialog
          type={dialog.type}
          onConfirm={handleCreatePane}
          onClose={() => setDialog({ visible: false, type: 'shell' })}
        />
      )}

      {showSettings && (
        <AdapterSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
