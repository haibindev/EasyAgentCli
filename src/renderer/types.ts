export type PaneType = 'claude' | 'codex' | 'shell'
export type YoloLevel = 'off' | 'safe' | 'full'
export type PaneStatus = 'running' | 'idle' | 'confirm' | 'done' | 'error'

export interface PaneInfo {
  id: string
  title: string
  type: PaneType
  cwd: string
  status: PaneStatus
  yoloLevel: YoloLevel
  lastEvent?: { type: string; content: string; time: number }
}

export interface BridgeStatus {
  serverRunning: boolean
  clientCount: number
  leaveMode: boolean
}

// Layout: supports axb grid via nested horizontal rows and vertical columns
// direction='horizontal' means children are side-by-side (columns)
// direction='vertical' means children are stacked (rows)
/** 布局模式：矩阵 rows x cols */
export interface LayoutMode {
  rows: number
  cols: number
}

/** 预设布局 */
export const LAYOUT_PRESETS: { label: string; mode: LayoutMode }[] = [
  { label: '1×1', mode: { rows: 1, cols: 1 } },
  { label: '1×2', mode: { rows: 1, cols: 2 } },
  { label: '1×3', mode: { rows: 1, cols: 3 } },
  { label: '2×1', mode: { rows: 2, cols: 1 } },
  { label: '2×2', mode: { rows: 2, cols: 2 } },
  { label: '2×3', mode: { rows: 2, cols: 3 } },
  { label: '2×4', mode: { rows: 2, cols: 4 } },
  { label: '3×2', mode: { rows: 3, cols: 2 } },
  { label: '3×3', mode: { rows: 3, cols: 3 } },
  { label: '3×4', mode: { rows: 3, cols: 4 } },
  { label: '4×3', mode: { rows: 4, cols: 3 } },
  { label: '4×4', mode: { rows: 4, cols: 4 } },
]
