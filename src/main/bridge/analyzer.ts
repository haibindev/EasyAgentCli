const PATTERNS = {
  confirm: /Run \d+ shell command|Allow|Continue\?|>\s*Yes\s*\/\s*No|\(y\/n\)/i,
  done: /✓\s+.+|^Task complete|^Done\b/m,
  error: /^Error:|^Failed:|✗\s+/m
}

export interface AnalyzerEvent {
  type: 'confirm' | 'done' | 'error' | 'idle'
  content: string
}

export class Analyzer {
  feed(ring: string[], text: string): AnalyzerEvent | null {
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

  private buildSummary(ring: string[]): string {
    const key = ring.slice(-200).filter(l =>
      /✓|✗|Created|Updated|Wrote|Error|Failed|Test/.test(l)
    )
    return key.slice(-10).join('\n') || ring.slice(-5).join('\n')
  }
}
