import type { PaneType, LayoutMode, AgentInfo } from '../types'
import { LAYOUT_PRESETS } from '../types'
import { useI18n } from '../i18n-context'
import { getAgentIcon, ShellIcon } from './AgentIcons'

interface Props {
  leaveMode: boolean
  layout: LayoutMode
  agents: AgentInfo[]
  onAddPane: (type: PaneType) => void
  onToggleLeaveMode: () => void
  onSetLayout: (mode: LayoutMode) => void
}

export default function Toolbar({ leaveMode, layout, agents, onAddPane, onToggleLeaveMode, onSetLayout }: Props) {
  const { t } = useI18n()
  const currentLabel = `${layout.rows}×${layout.cols}`

  const handleLayoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = LAYOUT_PRESETS.find(p => p.label === e.target.value)
    if (preset) onSetLayout(preset.mode)
  }

  const visibleAgents = agents.filter(a => a.available)

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {visibleAgents.map(agent => (
          <button key={agent.type} className="toolbar-btn" onClick={() => onAddPane(agent.type)}>
            {getAgentIcon(agent.type, 14)}
            + {agent.label}
          </button>
        ))}
        <button className="toolbar-btn" onClick={() => onAddPane('shell')}>
          <ShellIcon size={14} />
          + Shell
        </button>
      </div>

      <div className="toolbar-center">
        {leaveMode && (
          <span className="toolbar-hint toolbar-hint-leave">{t.leaveModeHint}</span>
        )}
      </div>

      <div className="toolbar-right">
        <div className="layout-selector">
          <span className="layout-label">{t.layoutLabel}</span>
          <select
            className="layout-select"
            value={currentLabel}
            onChange={handleLayoutChange}
          >
            {LAYOUT_PRESETS.map(({ label, mode }) => (
              <option key={label} value={label}>
                {label} ({t.layoutSlots(mode.rows * mode.cols)})
              </option>
            ))}
          </select>
        </div>
        <button
          className={`toolbar-btn ${leaveMode ? 'active' : ''}`}
          onClick={onToggleLeaveMode}
        >
          {leaveMode ? t.leaveModeActive : t.leaveModeInactive}
        </button>
      </div>
    </div>
  )
}
