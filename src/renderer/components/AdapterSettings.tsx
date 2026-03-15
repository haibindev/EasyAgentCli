import { useState, useEffect } from 'react'

interface AdapterConfig {
  enabled: boolean
  [key: string]: unknown
}

interface Props {
  onClose: () => void
}

export default function AdapterSettings({ onClose }: Props) {
  const [configs, setConfigs] = useState<Record<string, AdapterConfig>>({})
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    window.api.getAdapterConfigs().then(c => setConfigs(c as Record<string, AdapterConfig>))
    window.api.getAdapterStatus().then(setStatus)
  }, [])

  const handleSave = async (name: string) => {
    setSaving(name)
    const config = configs[name] || { enabled: false }
    await window.api.saveAdapterConfig(name, config)
    const newStatus = await window.api.getAdapterStatus()
    setStatus(newStatus)
    setSaving(null)
  }

  const update = (name: string, field: string, value: unknown) => {
    setConfigs(prev => ({
      ...prev,
      [name]: { ...prev[name], [field]: value }
    }))
  }

  const feishu = (configs.feishu || { enabled: false, appId: '', appSecret: '', chatId: '' }) as AdapterConfig
  const discord = (configs.discord || { enabled: false, token: '', channelId: '' }) as AdapterConfig
  const openclaw = (configs.openclaw || { enabled: false, url: '', autoReconnect: true }) as AdapterConfig

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog adapter-dialog" onClick={e => e.stopPropagation()}>
        <h3>远程适配器配置</h3>

        {/* Feishu */}
        <div className="adapter-section">
          <div className="adapter-header">
            <label className="adapter-toggle">
              <input
                type="checkbox"
                checked={!!feishu.enabled}
                onChange={e => update('feishu', 'enabled', e.target.checked)}
              />
              飞书 Bot
            </label>
            <span className={`adapter-status ${status.feishu ? 'connected' : ''}`}>
              {status.feishu ? '已连接' : '未连接'}
            </span>
          </div>
          {feishu.enabled && (
            <div className="adapter-fields">
              <input
                placeholder="App ID (cli_xxx)"
                value={(feishu.appId as string) || ''}
                onChange={e => update('feishu', 'appId', e.target.value)}
              />
              <input
                type="password"
                placeholder="App Secret"
                value={(feishu.appSecret as string) || ''}
                onChange={e => update('feishu', 'appSecret', e.target.value)}
              />
              <input
                placeholder="Chat ID (可选，自动学习)"
                value={(feishu.chatId as string) || ''}
                onChange={e => update('feishu', 'chatId', e.target.value)}
              />
              <button className="btn-create" onClick={() => handleSave('feishu')} disabled={saving === 'feishu'}>
                {saving === 'feishu' ? '连接中...' : '保存并连接'}
              </button>
            </div>
          )}
        </div>

        {/* Discord */}
        <div className="adapter-section">
          <div className="adapter-header">
            <label className="adapter-toggle">
              <input
                type="checkbox"
                checked={!!discord.enabled}
                onChange={e => update('discord', 'enabled', e.target.checked)}
              />
              Discord Bot
            </label>
            <span className={`adapter-status ${status.discord ? 'connected' : ''}`}>
              {status.discord ? '已连接' : '未连接'}
            </span>
          </div>
          {discord.enabled && (
            <div className="adapter-fields">
              <input
                type="password"
                placeholder="Bot Token"
                value={(discord.token as string) || ''}
                onChange={e => update('discord', 'token', e.target.value)}
              />
              <input
                placeholder="Channel ID (可选，自动学习)"
                value={(discord.channelId as string) || ''}
                onChange={e => update('discord', 'channelId', e.target.value)}
              />
              <button className="btn-create" onClick={() => handleSave('discord')} disabled={saving === 'discord'}>
                {saving === 'discord' ? '连接中...' : '保存并连接'}
              </button>
            </div>
          )}
        </div>

        {/* Openclaw */}
        <div className="adapter-section">
          <div className="adapter-header">
            <label className="adapter-toggle">
              <input
                type="checkbox"
                checked={!!openclaw.enabled}
                onChange={e => update('openclaw', 'enabled', e.target.checked)}
              />
              Openclaw 中继
            </label>
            <span className={`adapter-status ${status.openclaw ? 'connected' : ''}`}>
              {status.openclaw ? '已连接' : '未连接'}
            </span>
          </div>
          {openclaw.enabled && (
            <div className="adapter-fields">
              <input
                placeholder="WebSocket URL (ws://192.168.x.x:18800)"
                value={(openclaw.url as string) || ''}
                onChange={e => update('openclaw', 'url', e.target.value)}
              />
              <label className="adapter-toggle" style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={openclaw.autoReconnect !== false}
                  onChange={e => update('openclaw', 'autoReconnect', e.target.checked)}
                />
                自动重连
              </label>
              <button className="btn-create" onClick={() => handleSave('openclaw')} disabled={saving === 'openclaw'}>
                {saving === 'openclaw' ? '连接中...' : '保存并连接'}
              </button>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button className="btn-cancel" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
