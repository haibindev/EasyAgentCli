const PATTERNS = {
  confirm: /Run \d+ shell command|Allow|Continue\?|>\s*Yes\s*\/\s*No|\(y\/n\)/i,
  done: /✓\s+.+|^Task complete|^Done\b/m,
  error: /^Error:|^Failed:|✗\s+/m
}

const SUMMARY_RE = /✓|✗|Created|Updated|Wrote|Error|Failed|Test/

/** Ring buffer interface — accepts our RingBuffer or plain array */
interface Ringlike {
  last(n: number): string[]
}

export interface AnalyzerEvent {
  type: 'confirm' | 'done' | 'error' | 'idle'
  content: string
}

export class Analyzer {
  feed(ring: Ringlike, text: string): AnalyzerEvent | null {
    if (PATTERNS.confirm.test(text)) {
      return { type: 'confirm', content: text.slice(0, 300) }
    }
    if (PATTERNS.done.test(text)) {
      return { type: 'done', content: this.buildSummary(ring) }
    }
    if (PATTERNS.error.test(text)) {
      return { type: 'error', content: text.slice(0, 300) }
    }
    return null
  }

  private buildSummary(ring: Ringlike): string {
    const recent = ring.last(200)
    const key: string[] = []
    for (let i = recent.length - 1; i >= 0 && key.length < 10; i--) {
      if (SUMMARY_RE.test(recent[i])) key.unshift(recent[i])
    }
    return key.length > 0 ? key.join('\n') : ring.last(5).join('\n')
  }
}
