import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Pane management
  createPane: (type: string, cwd: string, bypassPermissions?: boolean, extraArgs?: string[]) =>
    ipcRenderer.invoke('pane:create', { type, cwd, bypassPermissions, extraArgs }),

  closePane: (id: string) =>
    ipcRenderer.invoke('pane:close', id),

  restartPane: (id: string) =>
    ipcRenderer.invoke('pane:restart', id),

  writePane: (id: string, text: string) =>
    ipcRenderer.invoke('pane:write', { id, text }),

  resizePane: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pane:resize', { id, cols, rows }),

  listPanes: () =>
    ipcRenderer.invoke('pane:list'),

  setYolo: (id: string, level: string) =>
    ipcRenderer.invoke('pane:setYolo', { id, level }),

  renamePane: (id: string, title: string) =>
    ipcRenderer.invoke('pane:rename', { id, title }),

  reorderPanes: (order: string[]) =>
    ipcRenderer.invoke('pane:reorder', order),

  // Bridge
  setLeaveMode: (enabled: boolean) =>
    ipcRenderer.invoke('bridge:setLeaveMode', enabled),

  getBridgeStatus: () =>
    ipcRenderer.invoke('bridge:getStatus'),

  // Adapter config
  getAdapterConfigs: () =>
    ipcRenderer.invoke('adapter:getConfigs'),

  saveAdapterConfig: (name: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('adapter:saveConfig', { name, config }),

  getAdapterStatus: () =>
    ipcRenderer.invoke('adapter:getStatus'),

  // Agent detection
  detectAgents: () =>
    ipcRenderer.invoke('agents:detect'),

  listAgents: () =>
    ipcRenderer.invoke('agents:list'),

  // File dialog
  selectDirectory: () =>
    ipcRenderer.invoke('dialog:selectDir'),

  // Event subscriptions — each returns an unsubscribe function
  onPaneExit: (cb: (msg: { id: string; exitCode: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: { id: string; exitCode: number }): void => cb(msg)
    ipcRenderer.on('pane:exit', handler)
    return () => { ipcRenderer.removeListener('pane:exit', handler) }
  },

  onPaneClear: (cb: (msg: { id: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: { id: string }): void => cb(msg)
    ipcRenderer.on('pane:clear', handler)
    return () => { ipcRenderer.removeListener('pane:clear', handler) }
  },

  onPaneOutput: (cb: (msg: { id: string; data: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: { id: string; data: string }): void => cb(msg)
    ipcRenderer.on('pane:output', handler)
    return () => { ipcRenderer.removeListener('pane:output', handler) }
  },

  onPaneEvent: (cb: (msg: { id: string; event: { type: string; content: string; time: number } }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: { id: string; event: { type: string; content: string; time: number } }): void => cb(msg)
    ipcRenderer.on('pane:event', handler)
    return () => { ipcRenderer.removeListener('pane:event', handler) }
  },

  onPaneListUpdate: (cb: (panes: unknown[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, panes: unknown[]): void => cb(panes)
    ipcRenderer.on('pane:listUpdate', handler)
    return () => { ipcRenderer.removeListener('pane:listUpdate', handler) }
  },

  onBridgeStatus: (cb: (status: { serverRunning: boolean; clientCount: number; leaveMode: boolean; adapters?: Record<string, boolean> }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: { serverRunning: boolean; clientCount: number; leaveMode: boolean; adapters?: Record<string, boolean> }): void => cb(status)
    ipcRenderer.on('bridge:status', handler)
    return () => { ipcRenderer.removeListener('bridge:status', handler) }
  }
})
