import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n-context'

interface AdapterConfig {
  enabled: boolean
  [key: string]: unknown
}

/** Global notification settings stored alongside adapter configs */
interface NotifySettings {
  heartbeatMin: number  // minutes
  idleMin: number       // minutes
}

const DEFAULT_NOTIFY: NotifySettings = { heartbeatMin: 10, idleMin: 15 }

interface Props {
  onClose: () => void
}

// ── Official brand SVG icons ──

const FeishuIcon = () => (
  <svg viewBox="0 0 36 29" width="22" height="18" className="adapter-icon">
    <path fill="#00D6B9" d="m18.43 15.043.088-.087c.056-.057.117-.117.177-.174l.122-.117.36-.356.495-.481.42-.417.395-.39.412-.408.378-.373.53-.52c.099-.1.203-.196.307-.291.191-.174.39-.343.59-.508a13.271 13.271 0 0 1 1.414-.976c.283-.165.573-.321.868-.469a11.562 11.562 0 0 1 1.345-.55c.083-.027.165-.057.252-.083A20.808 20.808 0 0 0 22.648.947a1.904 1.904 0 0 0-1.48-.707H5.962a.286.286 0 0 0-.17.516 44.38 44.38 0 0 1 12.604 14.326l.035-.04z"/>
    <path fill="#3370FF" d="M12.386 28.427c7.853 0 14.695-4.334 18.261-10.738.126-.226.247-.451.364-.681a8.405 8.405 0 0 1-.837 1.31 9.404 9.404 0 0 1-.581.677 7.485 7.485 0 0 1-.911.815 6.551 6.551 0 0 1-.412.295 8.333 8.333 0 0 1-.555.343 7.887 7.887 0 0 1-1.754.72 7.58 7.58 0 0 1-.932.2c-.226.035-.46.06-.69.078-.243.017-.49.022-.738.022a8.826 8.826 0 0 1-.824-.052 9.901 9.901 0 0 1-.612-.087 7.81 7.81 0 0 1-.533-.113c-.096-.022-.187-.048-.282-.074a56.83 56.83 0 0 1-.781-.217c-.13-.039-.26-.073-.386-.112a22.1 22.1 0 0 1-.578-.178c-.156-.048-.312-.1-.468-.152-.148-.048-.3-.096-.447-.148l-.304-.104-.368-.13-.26-.095a18.462 18.462 0 0 1-.517-.191c-.1-.04-.2-.074-.3-.113l-.398-.156-.421-.17-.274-.112-.338-.14-.26-.107-.27-.118-.234-.104-.212-.095-.217-.1-.221-.104-.282-.13-.295-.14c-.104-.051-.209-.099-.313-.151l-.264-.13A43.902 43.902 0 0 1 .495 8.665.287.287 0 0 0 0 8.86l.009 13.42v1.089c0 .633.312 1.223.837 1.575a20.685 20.685 0 0 0 11.54 3.484z"/>
    <path fill="#133C9A" d="M35.463 9.511a12.003 12.003 0 0 0-8.88-.672c-.083.026-.166.052-.252.082a12.415 12.415 0 0 0-2.213 1.015c-.29.17-.569.352-.842.547a11.063 11.063 0 0 0-1.163.937c-.104.096-.203.191-.308.29l-.529.521-.377.374-.412.407-.395.39-.421.417-.49.486-.36.356-.122.117a6.7 6.7 0 0 1-.178.174l-.087.087-.134.125-.152.14a21.037 21.037 0 0 1-4.33 3.066l.282.13.222.105.217.1.212.095.234.104.27.117.26.109.338.139.273.112.421.17c.13.052.265.104.4.156.1.039.199.073.299.113.173.065.347.125.516.19l.26.096c.122.043.243.087.37.13l.303.104c.147.048.295.1.447.148.156.052.312.1.468.152.191.06.386.117.577.177a51.658 51.658 0 0 0 1.167.33c.096.026.187.048.282.074.178.043.356.078.534.113.204.034.408.065.612.086a8.286 8.286 0 0 0 2.252-.048c.312-.047.624-.116.932-.199a7.619 7.619 0 0 0 1.15-.416 7.835 7.835 0 0 0 .89-.473c.095-.057.181-.117.268-.174.139-.095.278-.19.412-.295.117-.087.23-.178.339-.273a8.34 8.34 0 0 0 1.15-1.22 9.294 9.294 0 0 0 .833-1.302l.203-.402 1.814-3.614.021-.044a11.865 11.865 0 0 1 2.417-3.449z"/>
  </svg>
)

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" className="adapter-icon">
    <path fill="#5865F2" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
  </svg>
)

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" className="adapter-icon">
    <path fill="#26A5E4" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
)

const OpenclawIcon = () => (
  <svg viewBox="0 0 120 120" width="22" height="22" className="adapter-icon">
    <defs>
      <linearGradient id="oc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff4d4d"/>
        <stop offset="100%" stopColor="#991b1b"/>
      </linearGradient>
    </defs>
    <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#oc-grad)"/>
    <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#oc-grad)"/>
    <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#oc-grad)"/>
    <path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <circle cx="45" cy="35" r="6" fill="#050810"/>
    <circle cx="75" cy="35" r="6" fill="#050810"/>
    <circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>
    <circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>
  </svg>
)

// ── Toggle switch component ──

function ToggleSwitch({ checked, onChange, disabled, titleOn, titleOff }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; titleOn?: string; titleOff?: string }) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      title={checked ? (titleOn || '') : (titleOff || '')}
    >
      <span className="toggle-knob" />
    </button>
  )
}

// ── Adapter section helpers ──

interface AdapterDef {
  key: string
  label: string
  icon: React.ReactNode
  fields: { name: string; placeholder: string; type?: string }[]
  extra?: React.ReactNode
}

export default function AdapterSettings({ onClose }: Props) {
  const { t } = useI18n()
  const [configs, setConfigs] = useState<Record<string, AdapterConfig>>({})
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [notify, setNotify] = useState<NotifySettings>(DEFAULT_NOTIFY)

  useEffect(() => {
    window.api.getAdapterConfigs().then(c => {
      const loaded = c as Record<string, AdapterConfig> & { _notify?: NotifySettings }
      // Extract notify settings
      if (loaded._notify) {
        setNotify({ ...DEFAULT_NOTIFY, ...loaded._notify })
      }
      setConfigs(loaded)
      // Auto-expand adapters that have been configured
      const exp: Record<string, boolean> = {}
      for (const [name, cfg] of Object.entries(loaded)) {
        if (name === '_notify') continue
        if (cfg && hasCredentials(name, cfg)) exp[name] = true
      }
      setExpanded(exp)
    })
    window.api.getAdapterStatus().then(setStatus)
  }, [])

  const hasCredentials = (name: string, cfg: AdapterConfig): boolean => {
    switch (name) {
      case 'feishu': return !!(cfg.appId && cfg.appSecret)
      case 'discord': return !!cfg.token
      case 'telegram': return !!cfg.token
      case 'openclaw': return !!cfg.url
      default: return false
    }
  }

  const handleSave = useCallback(async (name: string) => {
    setSaving(name)
    const config = configs[name] || { enabled: false }
    await window.api.saveAdapterConfig(name, config)
    // Also save notify settings
    await window.api.saveAdapterConfig('_notify', notify as unknown as Record<string, unknown>)
    const newStatus = await window.api.getAdapterStatus()
    setStatus(newStatus)
    setSaving(null)
  }, [configs, notify])

  const handleToggleEnabled = useCallback(async (name: string, enabled: boolean) => {
    const config = { ...(configs[name] || {}), enabled }
    setConfigs(prev => ({ ...prev, [name]: config as AdapterConfig }))
    setSaving(name)
    await window.api.saveAdapterConfig(name, config)
    const newStatus = await window.api.getAdapterStatus()
    setStatus(newStatus)
    setSaving(null)
  }, [configs])

  const update = (name: string, field: string, value: unknown) => {
    setConfigs(prev => ({
      ...prev,
      [name]: { ...prev[name], [field]: value }
    }))
  }

  const toggleExpand = (name: string) => {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const adapters: AdapterDef[] = [
    {
      key: 'feishu',
      label: t.feishuBot,
      icon: <FeishuIcon />,
      fields: [
        { name: 'appId', placeholder: 'App ID (cli_xxx)' },
        { name: 'appSecret', placeholder: 'App Secret', type: 'password' },
        { name: 'chatId', placeholder: t.chatIdHint },
      ],
    },
    {
      key: 'discord',
      label: 'Discord Bot',
      icon: <DiscordIcon />,
      fields: [
        { name: 'token', placeholder: 'Bot Token', type: 'password' },
        { name: 'channelId', placeholder: t.channelIdHint },
      ],
    },
    {
      key: 'telegram',
      label: 'Telegram Bot',
      icon: <TelegramIcon />,
      fields: [
        { name: 'token', placeholder: t.telegramTokenHint, type: 'password' },
        { name: 'chatId', placeholder: t.chatIdHint },
      ],
    },
    {
      key: 'openclaw',
      label: t.openclawRelay,
      icon: <OpenclawIcon />,
      fields: [
        { name: 'url', placeholder: 'WebSocket URL (ws://192.168.x.x:18800)' },
      ],
      extra: (
        <label className="adapter-toggle" style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={(configs.openclaw || {}).autoReconnect !== false}
            onChange={e => update('openclaw', 'autoReconnect', e.target.checked)}
          />
          {t.autoReconnect}
        </label>
      ),
    },
  ]

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog adapter-dialog" onClick={e => e.stopPropagation()}>
        <h3>{t.adapterDialogTitle}</h3>

        {adapters.map(({ key, label, icon, fields, extra }) => {
          const cfg = configs[key] || { enabled: false }
          const isEnabled = !!cfg.enabled
          const isExpanded = !!expanded[key]
          const isConnected = !!status[key]
          const isSaving = saving === key
          const configured = hasCredentials(key, cfg as AdapterConfig)

          return (
            <div key={key} className={`adapter-section ${isEnabled ? 'enabled' : ''}`}>
              <div className="adapter-header" onClick={() => toggleExpand(key)}>
                <div className="adapter-title">
                  {icon}
                  <span className="adapter-name">{label}</span>
                  {configured && !isExpanded && (
                    <span className="adapter-configured-hint">{t.configured}</span>
                  )}
                </div>
                <div className="adapter-header-right">
                  <span className={`adapter-status ${isConnected ? 'connected' : ''}`}>
                    {isConnected ? t.connected : isEnabled && isSaving ? t.connecting : isEnabled ? t.notConnected : ''}
                  </span>
                  <ToggleSwitch
                    checked={isEnabled}
                    disabled={isSaving}
                    titleOn={t.clickToDisable}
                    titleOff={configured ? t.clickToEnable : t.fillConfigFirst}
                    onChange={(v) => {
                      if (v && !configured) return  // show hint but don't toggle
                      handleToggleEnabled(key, v)
                    }}
                  />
                  <span className={`adapter-expand-arrow ${isExpanded ? 'open' : ''}`}>▸</span>
                </div>
              </div>

              {isExpanded && (
                <div className="adapter-fields">
                  {fields.map(f => (
                    <input
                      key={f.name}
                      type={f.type || 'text'}
                      placeholder={f.placeholder}
                      value={((cfg as Record<string, unknown>)[f.name] as string) || ''}
                      onChange={e => update(key, f.name, e.target.value)}
                    />
                  ))}
                  {extra}
                  <button
                    className="btn-create"
                    onClick={() => handleSave(key)}
                    disabled={isSaving}
                  >
                    {isSaving ? t.saving : t.saveConfig}
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <div className="notify-settings">
          <h4>{t.notifySettingsTitle}</h4>
          <div className="notify-row">
            <label>{t.heartbeatInterval}</label>
            <input
              type="number"
              min={1}
              max={120}
              value={notify.heartbeatMin}
              onChange={e => setNotify(prev => ({ ...prev, heartbeatMin: Math.max(1, parseInt(e.target.value) || 10) }))}
            />
            <span>{t.minutes}</span>
          </div>
          <div className="notify-row">
            <label>{t.idleInterval}</label>
            <input
              type="number"
              min={1}
              max={120}
              value={notify.idleMin}
              onChange={e => setNotify(prev => ({ ...prev, idleMin: Math.max(1, parseInt(e.target.value) || 15) }))}
            />
            <span>{t.minutes}</span>
          </div>
          <button
            className="btn-create"
            style={{ alignSelf: 'flex-end', marginTop: 4 }}
            onClick={async () => {
              await window.api.saveAdapterConfig('_notify', notify as unknown as Record<string, unknown>)
            }}
          >
            {t.saveConfig}
          </button>
        </div>

        <div className="dialog-actions">
          <button className="btn-cancel" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  )
}
