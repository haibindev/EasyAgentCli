import { useState } from 'react'
import type { PaneType } from '../types'

const TYPE_NAMES: Record<PaneType, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Shell'
}

const SHELL_OPTIONS = [
  { value: 'cmd', label: 'CMD (cmd.exe)' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'gitbash', label: 'Git Bash' },
  { value: 'wsl', label: 'WSL' }
]

const LAST_CWD_KEY = 'eac:lastCwd'
const LAST_SHELL_KEY = 'eac:lastShell'

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

interface Props {
  type: PaneType
  onConfirm: (cwd: string, shellVariant?: string) => void
  onClose: () => void
}

export default function NewPaneDialog({ type, onConfirm, onClose }: Props) {
  const [cwd, setCwd] = useState(getLastCwd)
  const [shellVariant, setShellVariant] = useState(getLastShell)

  const handleBrowse = async () => {
    const dir = await window.api.selectDirectory()
    if (dir) setCwd(dir)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cwd.trim()) return
    saveLastCwd(cwd.trim())
    if (type === 'shell') {
      saveLastShell(shellVariant)
      onConfirm(cwd.trim(), shellVariant)
    } else {
      onConfirm(cwd.trim())
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <form className="dialog" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>新建 {TYPE_NAMES[type]} 终端</h3>

        {type === 'shell' && (
          <div className="dialog-field">
            <label>Shell 类型</label>
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

        <div className="dialog-field">
          <label>工作目录</label>
          <div className="input-row">
            <input
              type="text"
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder="选择工作目录..."
              autoFocus
            />
            <button type="button" className="browse-btn" onClick={handleBrowse}>
              浏览...
            </button>
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>取消</button>
          <button type="submit" className="btn-create">创建</button>
        </div>
      </form>
    </div>
  )
}
