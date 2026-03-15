import type { PaneInfo, BridgeStatus } from '../types'

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  running: { text: '运行中', color: 'var(--green)' },
  idle: { text: '空闲', color: 'var(--text-dim)' },
  confirm: { text: '等待确认', color: 'var(--amber)' },
  done: { text: '已完成', color: 'var(--accent-claude)' },
  error: { text: '错误', color: 'var(--red)' }
}

interface Props {
  panes: PaneInfo[]
  bridgeStatus: BridgeStatus
  leaveMode: boolean
  activePane?: string | null
  onActivatePane?: (id: string) => void
}

export default function StatusBar({ panes, bridgeStatus, leaveMode, activePane, onActivatePane }: Props) {
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
            <>🔗 {bridgeStatus.clientCount} 个远程连接</>
          )}
          {leaveMode && bridgeStatus.clientCount === 0 && (
            <>⚠️ 无远程连接</>
          )}
          {!leaveMode && bridgeStatus.serverRunning && (
            <>🔌 Bridge 就绪</>
          )}
        </span>
        {panes.length > 0 && (
          <span className="status-pane-count">{panes.length} 个终端</span>
        )}
      </div>
    </div>
  )
}
