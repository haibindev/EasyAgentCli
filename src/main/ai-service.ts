import { execFile } from 'child_process'

export interface AiConfig {
  summaryEnabled: boolean  // AI generates smart summaries for heartbeat/done events
  chatEnabled: boolean     // Plain messages (no # prefix) are answered by AI
  agent: string            // 'claude' | 'codex' | 'gemini'
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  summaryEnabled: false,
  chatEnabled: false,
  agent: 'claude',
}

function buildCmd(agent: string, prompt: string): { cmd: string; args: string[] } | null {
  const isWin = process.platform === 'win32'
  let base: string
  let args: string[]

  switch (agent) {
    case 'claude':
      base = 'claude'; args = ['-p', prompt]
      break
    case 'codex':
      base = 'codex'; args = [prompt]
      break
    case 'gemini':
      base = 'gemini'; args = [prompt]
      break
    default:
      return null
  }

  if (isWin) return { cmd: 'cmd.exe', args: ['/c', base, ...args] }
  return { cmd: base, args }
}

/**
 * Run an agent CLI in non-interactive (one-shot print) mode and return its output.
 *   Claude:  claude -p "<prompt>"
 *   Codex:   codex "<prompt>"
 *   Gemini:  gemini "<prompt>"
 */
export function callAgentOnce(agent: string, prompt: string, timeoutMs = 60000): Promise<string> {
  const spec = buildCmd(agent, prompt)
  if (!spec) return Promise.resolve('')

  return new Promise((resolve) => {
    execFile(spec.cmd, spec.args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error(`[AI] callAgentOnce(${agent}) failed:`, err.message)
        resolve('')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
