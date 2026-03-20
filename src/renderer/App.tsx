import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { PaneInfo, PaneType, BridgeStatus, LayoutMode, YoloLevel, AgentInfo } from './types'
import { useI18n } from './i18n-context'
import { getAgentIcon, ShellIcon } from './components/AgentIcons'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
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
  const { t } = useI18n()
  const paneAreaRef = useRef<HTMLDivElement>(null)
  const [panes, setPanes] = useState<PaneInfo[]>([])
  const [activePane, setActivePane] = useState<string | null>(null)
  const [focusTrigger, setFocusTrigger] = useState(0)
  const [leaveMode, setLeaveMode] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    serverRunning: false, clientCount: 0, leaveMode: false
  })
  const [layout, setLayout] = useState<LayoutMode>(loadLayout)
  const [dialog, setDialog] = useState<{ visible: boolean; type: PaneType }>({
    visible: false, type: 'shell'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [agents, setAgents] = useState<AgentInfo[]>([])

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
    window.api.listAgents().then(setAgents)

    return () => { unsub(); unsubBridge() }
  }, [])

  // Auto-correct activePane when panes change (safety net for close race conditions)
  useEffect(() => {
    if (panes.length === 0) {
      if (activePane !== null) setActivePane(null)
      return
    }
    if (activePane && !panes.find(p => p.id === activePane)) {
      setActivePane(panes[0].id)
    }
  }, [panes, activePane])

  const handleSetLayout = useCallback((mode: LayoutMode) => {
    setLayout(mode)
    saveLayout(mode)
  }, [])

  const handleAddPane = useCallback((type: PaneType) => {
    setDialog({ visible: true, type })
  }, [])

  const handleCreatePane = useCallback(async (cwd: string, shellVariant?: string, bypassPermissions?: boolean, extraArgs?: string[]) => {
    const type = dialog.type
    setDialog({ visible: false, type: 'shell' })
    const pane = await window.api.createPane(
      shellVariant && type === 'shell' ? `shell:${shellVariant}` : type,
      cwd,
      bypassPermissions,
      extraArgs
    )
    setActivePane(pane.id)
  }, [dialog.type])

  const handleClosePane = useCallback(async (id: string) => {
    const pane = panes.find(p => p.id === id)
    if (pane && pane.status === 'running') {
      const ok = window.confirm(t.confirmClose(pane.title))
      if (!ok) return
    }
    // Pre-emptively switch active pane before async close to avoid stale state
    if (activePane === id) {
      const idx = panes.findIndex(p => p.id === id)
      const next = panes[idx + 1] || panes[idx - 1]
      setActivePane(next?.id ?? null)
    }
    await window.api.closePane(id)
    // Force remaining terminals to refresh (prevents WebGL black screen)
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
  }, [activePane, panes, t])

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
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (activePane) handleRestartPane(activePane)
        return
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
  }, [handleRestartPane, handleClosePane, activePane, panes])

  // Explicit display order — the single source of truth for sidebar + grid layout.
  // New panes append to the end; closed panes are removed; drag-to-reorder updates this.
  const [paneOrder, setPaneOrder] = useState<string[]>([])

  useEffect(() => {
    setPaneOrder(prev => {
      const existing = new Set(panes.map(p => p.id))
      const filtered = prev.filter(id => existing.has(id))
      const added = panes.map(p => p.id).filter(id => !prev.includes(id))
      return [...filtered, ...added]
    })
  }, [panes])

  const handleReorder = useCallback((newOrder: string[]) => {
    setPaneOrder(newOrder)
  }, [])

  // Panes in user-defined display order
  const orderedPanes = useMemo(
    () => paneOrder.map(id => panes.find(p => p.id === id)).filter((p): p is PaneInfo => !!p),
    [paneOrder, panes]
  )

  // Grid: fill rows × cols cells in order, overflow rows scroll
  const { rows, cols } = layout
  const actualRows = Math.max(rows, Math.ceil(orderedPanes.length / cols))
  const grid = useMemo(() => {
    const result: (PaneInfo | null)[][] = []
    for (let r = 0; r < actualRows; r++) {
      const row: (PaneInfo | null)[] = []
      for (let c = 0; c < cols; c++) {
        row.push(orderedPanes[r * cols + c] ?? null)
      }
      result.push(row)
    }
    return result
  }, [orderedPanes, actualRows, cols])

  const renderPane = (pane: PaneInfo) => {
    const idx = orderedPanes.findIndex(p => p.id === pane.id) + 1
    return (
      <ErrorBoundary>
        <TerminalPane
          pane={pane}
          paneIndex={idx}
          active={activePane === pane.id}
          focusTrigger={activePane === pane.id ? focusTrigger : 0}
          onActivate={() => setActivePane(pane.id)}
          onClose={() => handleClosePane(pane.id)}
          onRestart={() => handleRestartPane(pane.id)}
          onYoloChange={(level) => handleYoloChange(pane.id, level)}
          onRename={(title) => handleRenamePane(pane.id, title)}
        />
      </ErrorBoundary>
    )
  }

  const renderEmptySlot = (key: string) => (
    <div className="empty-slot" key={key}>
      <div className="empty-slot-inner">
        <span className="empty-slot-hint">{t.emptySlot}</span>
        <div className="empty-slot-btns">
          {agents.filter(a => a.available).map(a => (
            <button key={a.type} className="empty-slot-btn" onClick={() => handleAddPane(a.type)}>
              {getAgentIcon(a.type, 15)} {a.label}
            </button>
          ))}
          <button className="empty-slot-btn" onClick={() => handleAddPane('shell')}>
            <ShellIcon size={15} /> Shell
          </button>
        </div>
      </div>
    </div>
  )

  // Row style: each row fills exactly 1/rows of the visible pane-area height.
  // When actualRows > rows the grid overflows; scroll is driven programmatically.
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: '2px',
    height: `calc(100% / ${rows})`,
    flexShrink: 0,
    background: 'var(--border)',
  }

  // Activate a pane from the sidebar: focus it if visible, else scroll its row to top.
  // Always increment focusTrigger so the terminal reclaims focus even if the
  // active pane didn't change (sidebar click moves browser focus to the button).
  const handleSidebarActivate = useCallback((id: string) => {
    setActivePane(id)
    setShowSettings(false)
    setFocusTrigger(t => t + 1)
    const paneIndex = orderedPanes.findIndex(p => p.id === id)
    if (paneIndex < 0) return
    const paneRow = Math.floor(paneIndex / cols)
    const el = paneAreaRef.current
    if (!el) return
    const rowHeight = el.clientHeight / rows
    const topRow = Math.round(el.scrollTop / rowHeight)
    const isVisible = paneRow >= topRow && paneRow < topRow + rows
    if (!isVisible) {
      el.scrollTo({ top: paneRow * rowHeight, behavior: 'smooth' })
    }
  }, [orderedPanes, cols, rows])

  return (
    <div className="app">
      <Toolbar
        leaveMode={leaveMode}
        layout={layout}
        agents={agents}
        onAddPane={handleAddPane}
        onToggleLeaveMode={handleToggleLeaveMode}
        onSetLayout={handleSetLayout}
      />

      <div className="main-body">
        <Sidebar
          panes={orderedPanes}
          activePane={activePane}
          agents={agents}
          onActivate={handleSidebarActivate}
          onAddPane={handleAddPane}
          onReorder={handleReorder}
          settingsOpen={showSettings}
          onSetSettingsOpen={setShowSettings}
        />
        <div className="pane-area" ref={paneAreaRef}>
          {/* Terminal grid — always mounted so xterm stays alive */}
          {panes.length === 0 ? (
            <div className="empty-state">
              <h2>EasyAgentCli</h2>
              <p>{t.appSubtitle}</p>
              <div className="quick-btns">
                {agents.filter(a => a.available).map(a => (
                  <button key={a.type} className="quick-btn" onClick={() => handleAddPane(a.type)}>
                    {getAgentIcon(a.type, 22)}
                    {a.label}
                  </button>
                ))}
                <button className="quick-btn" onClick={() => handleAddPane('shell')}>
                  <ShellIcon size={22} />
                  Shell
                </button>
              </div>
            </div>
          ) : (
            grid.map((row, r) => (
              <div key={r} style={rowStyle}>
                {row.map((cell, c) =>
                  cell ? (
                    <div key={cell.id} className="grid-cell">
                      {renderPane(cell)}
                    </div>
                  ) : (
                    renderEmptySlot(`empty-${r}-${c}`)
                  )
                )}
              </div>
            ))
          )}

          {/* Settings overlay — floats above grid without unmounting terminals */}
          {showSettings && (
            <div className="settings-overlay">
              <AdapterSettings
                onClose={() => setShowSettings(false)}
                onAgentsRefresh={() => window.api.listAgents().then(setAgents)}
              />
            </div>
          )}
        </div>
      </div>

      <StatusBar
        panes={panes}
        bridgeStatus={bridgeStatus}
        leaveMode={leaveMode}
      />

      {dialog.visible && (
        <NewPaneDialog
          type={dialog.type}
          onConfirm={handleCreatePane}
          onClose={() => setDialog({ visible: false, type: 'shell' })}
        />
      )}

    </div>
  )
}
