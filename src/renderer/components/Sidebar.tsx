import { useState, useRef, useEffect } from 'react'
import type { PaneInfo, PaneType, AgentInfo } from '../types'
import { useI18n } from '../i18n-context'
import { getAgentIcon, ShellIcon } from './AgentIcons'

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--green)',   // 运行中
  idle: 'var(--text-dim)',   // 空闲/已退出
  confirm: 'var(--amber)',   // 等待确认
  done: 'var(--blue)',       // 已完成
  error: 'var(--red)',       // 错误
}

const AGENT_COLORS: Record<string, string> = {
  claude: 'var(--accent-claude)',
  codex: 'var(--accent-codex)',
  gemini: '#4285f4',
  aider: '#e8a838',
  shell: 'var(--accent-shell)',
}

const SIDEBAR_COLLAPSED_KEY = 'eac:sidebarCollapsed'
const SIDEBAR_WIDTH_KEY = 'eac:sidebarWidth'
const SIDEBAR_MIN_WIDTH = 150
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_DEFAULT_WIDTH = 200

interface Props {
  panes: PaneInfo[]
  activePane: string | null
  agents: AgentInfo[]
  onActivate: (id: string) => void
  onAddPane: (type: PaneType) => void
  onReorder: (newOrder: string[]) => void
  settingsOpen: boolean
  onSetSettingsOpen: (open: boolean) => void
}

export default function Sidebar({ panes, activePane, agents, onActivate, onAddPane, onReorder, settingsOpen, onSetSettingsOpen }: Props) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const [width, setWidth] = useState(() => {
    try { return parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || '') || SIDEBAR_DEFAULT_WIDTH } catch { return SIDEBAR_DEFAULT_WIDTH }
  })
  const [showAdd, setShowAdd] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // Drag-to-reorder state
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragFromIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Transparent ghost image
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 0, 0)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const insertBefore = e.clientY < rect.top + rect.height / 2
    setDropIndex(insertBefore ? index : index + 1)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragFromIndex === null || dropIndex === null) return
    const ids = panes.map(p => p.id)
    const [moved] = ids.splice(dragFromIndex, 1)
    const adjusted = dropIndex > dragFromIndex ? dropIndex - 1 : dropIndex
    ids.splice(adjusted, 0, moved)
    onReorder(ids)
    setDragFromIndex(null)
    setDropIndex(null)
  }

  const handleDragEnd = () => {
    setDragFromIndex(null)
    setDropIndex(null)
  }

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = ev.clientX - dragStartX.current
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, dragStartWidth.current + delta))
      setWidth(next)
    }
    const onUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setWidth(prev => {
        try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(prev)) } catch { /* ignore */ }
        return prev
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const toggleCollapse = () => {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Close add menu when clicking outside
  useEffect(() => {
    if (!showAdd) return
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setShowAdd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAdd])

  const visibleAgents = agents.filter(a => a.available)

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="sidebar-expand-btn" onClick={toggleCollapse} title={t.sidebarExpand}>›</button>
        <button
          className={`sidebar-settings-pill ${settingsOpen ? 'active' : ''}`}
          onClick={() => onSetSettingsOpen(!settingsOpen)}
          title={t.settingsLabel}
        >⚙</button>
        <div className="sidebar-collapsed-divider" />

        <div className="sidebar-collapsed-list">
          {panes.map((p, i) => (
            <div
              key={p.id}
              className={`sidebar-pill ${activePane === p.id ? 'active' : ''}`}
              onClick={() => onActivate(p.id)}
              title={`#${i + 1} ${p.title}`}
            >
              <span className="status-dot" style={{ background: STATUS_COLORS[p.status] ?? STATUS_COLORS.idle }} />
              <span className="sidebar-pill-idx">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar" style={{ width }}>
      <button
        className={`sidebar-settings-item ${settingsOpen ? 'active' : ''}`}
        onClick={() => onSetSettingsOpen(!settingsOpen)}
      >
        {t.settingsLabel}
      </button>

      <div
        className={`sidebar-section-header${settingsOpen ? ' sidebar-section-header-back' : ''}`}
        onClick={settingsOpen ? () => onSetSettingsOpen(false) : undefined}
      >
        <span className="sidebar-section-title">{t.sidebarTitle}</span>
        <div className="sidebar-add-wrap" ref={addRef} onClick={settingsOpen ? e => e.stopPropagation() : undefined}>
          <button
            className={`sidebar-add-btn ${showAdd ? 'active' : ''}`}
            onClick={() => setShowAdd(v => !v)}
            title={t.sidebarAdd}
          >+</button>
          {showAdd && (
            <div className="sidebar-add-menu">
              {visibleAgents.map(a => (
                <button
                  key={a.type}
                  className="sidebar-add-item"
                  onClick={() => { onAddPane(a.type); setShowAdd(false) }}
                >
                  {getAgentIcon(a.type, 14)}
                  {a.label}
                </button>
              ))}
              <button
                className="sidebar-add-item"
                onClick={() => { onAddPane('shell'); setShowAdd(false) }}
              >
                <ShellIcon size={14} />
                Shell
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-list" onDragOver={e => e.preventDefault()}>
        {panes.map((p, i) => (
          <div key={p.id}>
            {dropIndex === i && dragFromIndex !== i && dragFromIndex !== i - 1 && (
              <div className="sidebar-drop-line" />
            )}
            <div
              className={`sidebar-item ${activePane === p.id ? 'active' : ''} ${dragFromIndex === i ? 'dragging' : ''}`}
              draggable
              onClick={() => onActivate(p.id)}
              onDragStart={e => handleDragStart(e, i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              <span
                className="status-dot"
                style={{ background: STATUS_COLORS[p.status] ?? STATUS_COLORS.idle, flexShrink: 0, marginTop: 2 }}
              />
              <div className="sidebar-item-info">
                <div className="sidebar-item-title">
                  <span className="sidebar-item-idx">#{i + 1}</span>
                  <span className="sidebar-item-name">{p.title}</span>
                </div>
                <div className="sidebar-item-cwd" title={p.cwd}>{p.cwd}</div>
              </div>
            </div>
          </div>
        ))}
        {dropIndex === panes.length && dragFromIndex !== panes.length - 1 && (
          <div className="sidebar-drop-line" />
        )}
        {panes.length === 0 && (
          <div className="sidebar-empty">{t.sidebarEmpty}</div>
        )}
      </div>

      <button className="sidebar-collapse-btn" onClick={toggleCollapse}>
        ‹ {t.sidebarCollapse}
      </button>

      <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
    </div>
  )
}
