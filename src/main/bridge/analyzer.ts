const PATTERNS = {
  // Require explicit interactive prompts — avoid matching incidental "Allow"
  // appearing in Claude/Codex tool-call descriptions or menu text.
  confirm: /Run \d+ shell command|\bAllow\s+(this|the)\b|Continue\?|>\s*Yes\s*\/\s*No|\(y\/n\)/i,
  done: /✓\s+.+|^Task complete|^Done\b/m,
  error: /^Error:|^Failed:|✗\s+/m
}

const SUMMARY_RE = /✓|✗|Created|Updated|Wrote|Error|Failed|Test/

// Box-drawing and TUI border characters
const BOX_RE = /[\u2500-\u257F\u2580-\u259F╭╮╰╯│─┌┐└┘├┤┬┴┼═║▓░▒·]/g
// Characters that only appear on pure border/separator lines (never in content)
const EDGE_BOX_RE = /^[│├┤┬┴┼╔╗╚╝║╠╣╦╩╬╭╮╰╯─═▓░▒\s]+|[│├┤┬┴┼╔╗╚╝║╠╣╦╩╬╭╮╰╯─═▓░▒\s]+$/g
// Spinner characters used by Claude/Codex while thinking
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s·…]+$/

/**
 * Strip box-drawing borders from a single line and return the inner content.
 * "│ foo bar │" → "foo bar"
 * "╭──────╮" → "" (pure border, no inner content)
 */
export function extractLineContent(raw: string): string {
  return raw.trim().replace(EDGE_BOX_RE, '').trim()
}

/**
 * Clean terminal output for IM notifications:
 *   1. Strip spinner-only lines
 *   2. Strip pure border/separator lines (>60% box chars)
 *   3. Extract inner content from table rows (│ cell │ → cell)
 *   4. Optionally filter lines matching a per-pane chrome fingerprint
 *      (startup banner, session header, etc. recorded at launch time)
 */
export function cleanTerminalOutput(text: string, chromeLines?: Set<string>): string {
  const result: string[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    // Filter spinner-only lines
    if (SPINNER_RE.test(trimmed)) continue

    const boxCount = (trimmed.match(BOX_RE) ?? []).length
    const ratio = boxCount / trimmed.length

    if (ratio > 0.6) continue  // pure border / separator — discard

    // Strip edge box chars for table rows and bordered text
    const content = ratio > 0 ? extractLineContent(trimmed) : trimmed
    if (content.length === 0) continue

    // Filter startup chrome fingerprint lines
    if (chromeLines?.has(content)) continue

    result.push(content)
  }

  return result.join('\n').trim()
}

/** Ring buffer interface — accepts our RingBuffer or plain array */
interface Ringlike {
  last(n: number): string[]
}

export interface AnalyzerEvent {
  type: 'confirm' | 'done' | 'error' | 'idle'
  content: string
}

export class Analyzer {
  feed(ring: Ringlike, text: string, chromeLines?: Set<string>): AnalyzerEvent | null {
    if (PATTERNS.confirm.test(text)) {
      return { type: 'confirm', content: cleanTerminalOutput(text, chromeLines).slice(0, 300) }
    }
    if (PATTERNS.done.test(text)) {
      return { type: 'done', content: this.buildSummary(ring, chromeLines) }
    }
    if (PATTERNS.error.test(text)) {
      return { type: 'error', content: cleanTerminalOutput(text, chromeLines).slice(0, 300) }
    }
    return null
  }

  private buildSummary(ring: Ringlike, chromeLines?: Set<string>): string {
    const recent = ring.last(200)
    const key: string[] = []
    for (let i = recent.length - 1; i >= 0 && key.length < 10; i--) {
      if (SUMMARY_RE.test(recent[i])) key.unshift(recent[i])
    }
    const raw = key.length > 0 ? key.join('\n') : ring.last(5).join('\n')
    return cleanTerminalOutput(raw, chromeLines)
  }
}
