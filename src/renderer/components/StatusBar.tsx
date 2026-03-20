import type { PaneInfo, BridgeStatus } from '../types'
import { useI18n } from '../i18n-context'

interface Props {
  panes: PaneInfo[]
  bridgeStatus: BridgeStatus
  leaveMode: boolean
}

export default function StatusBar({ panes, bridgeStatus, leaveMode }: Props) {
  const { t, lang, toggleLang } = useI18n()

  return (
    <div className={`status-bar ${leaveMode ? 'leave-mode' : ''}`}>
      {leaveMode && (
        <span className="status-leave-badge">{t.leaveModeActive}</span>
      )}
      <span className="bridge-info">
        {leaveMode && (() => {
          const connectedAdapters = bridgeStatus.adapters
            ? Object.entries(bridgeStatus.adapters).filter(([, v]) => v).map(([k]) => k)
            : []
          const hasAdapter = connectedAdapters.length > 0
          const hasClient = bridgeStatus.clientCount > 0
          if (hasAdapter || hasClient) {
            const parts: string[] = []
            if (hasAdapter) parts.push(t.adapterConnected(connectedAdapters.join(', ')))
            if (hasClient) parts.push(t.remoteConnections(bridgeStatus.clientCount))
            return <>🔗 {parts.join(' | ')}</>
          }
          return <>⚠️ {t.noRemoteConnection}</>
        })()}
        {!leaveMode && bridgeStatus.serverRunning && (
          <>🔌 {t.bridgeReady}</>
        )}
      </span>

      <div className="status-right">
        {panes.length > 0 && (
          <span className="status-pane-count">{t.terminalCount(panes.length)}</span>
        )}
        <button className="lang-toggle-btn" onClick={toggleLang} title="中文 / English">
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>
    </div>
  )
}
