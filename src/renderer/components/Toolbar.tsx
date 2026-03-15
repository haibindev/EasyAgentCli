import type { PaneType, LayoutMode } from '../types'
import { LAYOUT_PRESETS } from '../types'

const TYPE_COLORS: Record<PaneType, string> = {
  claude: 'var(--accent-claude)',
  codex: 'var(--accent-codex)',
  shell: 'var(--accent-shell)'
}

interface Props {
  leaveMode: boolean
  layout: LayoutMode
  overflowHint?: string
  onAddPane: (type: PaneType) => void
  onToggleLeaveMode: () => void
  onSetLayout: (mode: LayoutMode) => void
  onOpenSettings: () => void
}

export default function Toolbar({ leaveMode, layout, overflowHint, onAddPane, onToggleLeaveMode, onSetLayout, onOpenSettings }: Props) {
  const currentLabel = `${layout.rows}×${layout.cols}`

  const handleLayoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = LAYOUT_PRESETS.find(p => p.label === e.target.value)
    if (preset) onSetLayout(preset.mode)
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {(['claude', 'codex', 'shell'] as PaneType[]).map(type => (
          <button key={type} className="toolbar-btn" onClick={() => onAddPane(type)}>
            <span className="dot" style={{ background: TYPE_COLORS[type] }} />
            + {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <div className="toolbar-center">
        {leaveMode && (
          <span className="toolbar-hint toolbar-hint-leave">离开模式已开启 — 事件将通过飞书转发</span>
        )}
        {overflowHint && (
          <span className="toolbar-hint toolbar-hint-overflow">{overflowHint}</span>
        )}
      </div>

      <div className="toolbar-right">
        <div className="layout-selector">
          <span className="layout-label">布局</span>
          <select
            className="layout-select"
            value={currentLabel}
            onChange={handleLayoutChange}
          >
            {LAYOUT_PRESETS.map(({ label, mode }) => (
              <option key={label} value={label}>
                {label} ({mode.rows * mode.cols}格)
              </option>
            ))}
          </select>
        </div>
        <button className="toolbar-btn" onClick={onOpenSettings} title="远程适配器设置">
          ⚙
        </button>
        <button
          className={`toolbar-btn ${leaveMode ? 'active' : ''}`}
          onClick={onToggleLeaveMode}
        >
          {leaveMode ? '🚶 离开中' : '🚶 离开模式'}
        </button>
      </div>
    </div>
  )
}
