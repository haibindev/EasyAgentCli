import { useState } from 'react'
import type { PaneType } from '../types'
import { useI18n } from '../i18n-context'
import { getAgentIcon, ShellIcon } from './AgentIcons'

const TYPE_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  kimi: 'Kimi Code',
  aider: 'Aider',
  shell: 'Shell',
}

const SHELL_OPTIONS = [
  { value: 'cmd', label: 'CMD (cmd.exe)' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'gitbash', label: 'Git Bash' },
  { value: 'wsl', label: 'WSL' }
]

const LAST_CWD_KEY = 'eac:lastCwd'
const LAST_SHELL_KEY = 'eac:lastShell'
const LAST_BYPASS_KEY = 'eac:lastBypass'
const LAST_EXTRA_ARGS_KEY = 'eac:lastExtraArgs'

function getLastCwd(): string {
  return localStorage.getItem(LAST_CWD_KEY) || 'D:\\'
}

function saveLastCwd(cwd: string): void {
  localStorage.setItem(LAST_CWD_KEY, cwd)
}

function getLastShell(): string {
  return localStorage.getItem(LAST_SHELL_KEY) || 'cmd'
}

function saveLastShell(shell: string): void {
  localStorage.setItem(LAST_SHELL_KEY, shell)
}

function getLastBypass(): boolean {
  return localStorage.getItem(LAST_BYPASS_KEY) === 'true'
}

function saveLastBypass(v: boolean): void {
  localStorage.setItem(LAST_BYPASS_KEY, String(v))
}

function getLastExtraArgs(): string {
  return localStorage.getItem(LAST_EXTRA_ARGS_KEY) || ''
}

function saveLastExtraArgs(v: string): void {
  localStorage.setItem(LAST_EXTRA_ARGS_KEY, v)
}

interface Props {
  type: PaneType
  onConfirm: (cwd: string, shellVariant?: string, bypassPermissions?: boolean, extraArgs?: string[]) => void
  onClose: () => void
}

export default function NewPaneDialog({ type, onConfirm, onClose }: Props) {
  const { t } = useI18n()
  const [cwd, setCwd] = useState(getLastCwd)
  const [shellVariant, setShellVariant] = useState(getLastShell)
  const [bypass, setBypass] = useState(getLastBypass)
  const [extraArgsStr, setExtraArgsStr] = useState(getLastExtraArgs)

  const isAgent = type !== 'shell'

  const bypassFlag =
    type === 'claude'  ? '--dangerously-skip-permissions' :
    type === 'codex'   ? '--dangerously-bypass-approvals-and-sandbox' :
    type === 'gemini'  ? '--yolo' :
    type === 'kimi'    ? '--yolo' :
    type === 'aider'   ? '--yes' :
    null

  const handleBrowse = async () => {
    const dir = await window.api.selectDirectory()
    if (dir) setCwd(dir)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cwd.trim()) return
    saveLastCwd(cwd.trim())
    if (isAgent) {
      saveLastBypass(bypass)
      saveLastExtraArgs(extraArgsStr)
    }
    if (type === 'shell') {
      saveLastShell(shellVariant)
      onConfirm(cwd.trim(), shellVariant)
    } else {
      const extra = extraArgsStr.trim()
        ? extraArgsStr.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
        : []
      onConfirm(cwd.trim(), undefined, isAgent ? bypass : undefined, extra.length > 0 ? extra : undefined)
    }
  }

  const titleIcon = type === 'shell' ? <ShellIcon size={20} /> : getAgentIcon(type, 20)

  return (
    <div className="dialog-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <form className="dialog" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3 className="dialog-title">{titleIcon} {t.newPaneTitle(TYPE_NAMES[type])}</h3>

        {type === 'shell' && (
          <div className="dialog-field dialog-field-row">
            <label>{t.shellType}</label>
            <select
              className="dialog-select"
              value={shellVariant}
              onChange={e => setShellVariant(e.target.value)}
            >
              {SHELL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="dialog-field dialog-field-row">
          <label>{t.workDir}</label>
          <div className="input-row">
            <input
              type="text"
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder={t.workDirPlaceholder}
              autoFocus
            />
            <button type="button" className="browse-btn" onClick={handleBrowse}>
              {t.browse}
            </button>
          </div>
        </div>

        {isAgent && (
          <div className="dialog-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bypass}
                onChange={e => setBypass(e.target.checked)}
              />
              <span>{t.bypassPermissions}</span>
            </label>
            <span className="field-hint">
              {t.bypassHint}
              {bypassFlag && <>{' '}<code>{bypassFlag}</code></>}
            </span>
          </div>
        )}

        {isAgent && (
          <div className="dialog-field">
            <div className="dialog-field-row">
              <label>{t.extraArgs}</label>
              <textarea
                className="mono dialog-textarea"
                rows={2}
                value={extraArgsStr}
                onChange={e => setExtraArgsStr(e.target.value)}
                placeholder={t.extraArgsPlaceholder}
              />
            </div>
            <span className="field-hint">{t.extraArgsHint}</span>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn-create">{t.create}</button>
        </div>
      </form>
    </div>
  )
}
