import type { PaneInfo, BridgeStatus } from '../types'
import { useI18n } from '../i18n-context'

interface Props {
  panes: PaneInfo[]
  bridgeStatus: BridgeStatus
  leaveMode: boolean
  activePane?: string | null
  onActivatePane?: (id: string) => void
}

export default function StatusBar({ panes, bridgeStatus, leaveMode, activePane, onActivatePane }: Props) {
  const { t } = useI18n()

  const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    running: { text: t.statusRunning, color: 'var(--green)' },
    idle: { text: t.statusIdle, color: 'var(--text-dim)' },
    confirm: { text: t.statusConfirm, color: 'var(--amber)' },
    done: { text: t.statusDone, color: 'var(--accent-claude)' },
    error: { text: t.statusError, color: 'var(--red)' }
  }

  return (
    <div className="status-bar">
      <div className="status-panes">
        {panes.map(p => {
          const s = STATUS_LABELS[p.status] || STATUS_LABELS.idle
          return (
            <span
              key={p.id}
              className={`pane-status ${activePane === p.id ? 'pane-status-active' : ''}`}
              onClick={() => onActivatePane?.(p.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="status-dot" style={{ background: s.color }} />
              {p.title}: {s.text}
            </span>
          )
        })}
      </div>

      <div className="status-right">
        <span className="bridge-info">
          {leaveMode && bridgeStatus.clientCount > 0 && (
            <>🔗 {t.remoteConnections(bridgeStatus.clientCount)}</>
          )}
          {leaveMode && bridgeStatus.clientCount === 0 && (
            <>⚠️ {t.noRemoteConnection}</>
          )}
          {!leaveMode && bridgeStatus.serverRunning && (
            <>🔌 {t.bridgeReady}</>
          )}
        </span>
        {panes.length > 0 && (
          <span className="status-pane-count">{t.terminalCount(panes.length)}</span>
        )}
      </div>
    </div>
  )
}
