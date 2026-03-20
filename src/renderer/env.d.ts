import type { PaneInfo, BridgeStatus, AgentInfo } from './types'

interface ElectronAPI {
  createPane: (type: string, cwd: string, bypassPermissions?: boolean, extraArgs?: string[]) => Promise<PaneInfo>
  closePane: (id: string) => Promise<void>
  restartPane: (id: string) => Promise<PaneInfo | null>
  writePane: (id: string, text: string) => Promise<void>
  resizePane: (id: string, cols: number, rows: number) => Promise<void>
  listPanes: () => Promise<PaneInfo[]>
  setYolo: (id: string, level: string) => Promise<void>
  renamePane: (id: string, title: string) => Promise<void>
  setLeaveMode: (enabled: boolean) => Promise<void>
  getBridgeStatus: () => Promise<BridgeStatus>
  getAdapterConfigs: () => Promise<Record<string, unknown>>
  saveAdapterConfig: (name: string, config: Record<string, unknown>) => Promise<string>
  getAdapterStatus: () => Promise<Record<string, boolean>>
  detectAgents: () => Promise<AgentInfo[]>
  listAgents: () => Promise<AgentInfo[]>
  selectDirectory: () => Promise<string | null>
  onPaneExit: (cb: (msg: { id: string; exitCode: number }) => void) => () => void
  onPaneClear: (cb: (msg: { id: string }) => void) => () => void
  onPaneOutput: (cb: (msg: { id: string; data: string }) => void) => () => void
  onPaneEvent: (cb: (msg: { id: string; event: { type: string; content: string; time: number } }) => void) => () => void
  onPaneListUpdate: (cb: (panes: PaneInfo[]) => void) => () => void
  onBridgeStatus: (cb: (status: BridgeStatus) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
