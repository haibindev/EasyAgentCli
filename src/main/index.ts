import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { PtyManager } from './pty-manager'
import { BridgeServer } from './bridge/server'
import { Discovery } from './bridge/discovery'
import { MessageRouter } from './bridge/message-router'
import { FeishuAdapter, type FeishuConfig } from './bridge/adapters/feishu'
import { DiscordAdapter, type DiscordConfig } from './bridge/adapters/discord'
import { OpenclawAdapter, type OpenclawConfig } from './bridge/adapters/openclaw'
import { TelegramAdapter, type TelegramConfig } from './bridge/adapters/telegram'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const bridgeServer = new BridgeServer(ptyManager)
const discovery = new Discovery()
const messageRouter = new MessageRouter(ptyManager)

const isDev = !app.isPackaged

// ──── Adapter config persistence ────

interface AdapterConfigs {
  feishu?: FeishuConfig & { enabled: boolean }
  discord?: DiscordConfig & { enabled: boolean }
  openclaw?: OpenclawConfig & { enabled: boolean }
  telegram?: TelegramConfig & { enabled: boolean }
}

function getConfigDir(): string {
  const dir = join(app.getPath('userData'), 'config')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return dir
}

function loadAdapterConfigs(): AdapterConfigs {
  try {
    const raw = readFileSync(join(getConfigDir(), 'adapters.json'), 'utf-8')
    return JSON.parse(raw)
  } catch { return {} }
}

function saveAdapterConfigs(configs: AdapterConfigs): void {
  try {
    writeFileSync(join(getConfigDir(), 'adapters.json'), JSON.stringify(configs, null, 2))
  } catch { /* ignore */ }
}

// ──── Adapter lifecycle ────

async function startAdapter(name: string, configs: AdapterConfigs): Promise<string> {
  const onMsg = (adapterName: string, text: string) => {
    messageRouter.handleMessage(adapterName, text)
  }

  try {
    // Stop existing adapter
    messageRouter.removeAdapter(name)

    if (name === 'feishu' && configs.feishu?.enabled) {
      const adapter = new FeishuAdapter(configs.feishu, onMsg)
      messageRouter.addAdapter(adapter)
      await adapter.start()
      return adapter.isConnected() ? 'connected' : 'failed'
    }

    if (name === 'discord' && configs.discord?.enabled) {
      const adapter = new DiscordAdapter(configs.discord, onMsg)
      messageRouter.addAdapter(adapter)
      await adapter.start()
      // Discord login is async, give it a moment
      await new Promise(r => setTimeout(r, 3000))
      return adapter.isConnected() ? 'connected' : 'connecting'
    }

    if (name === 'openclaw' && configs.openclaw?.enabled) {
      const adapter = new OpenclawAdapter(configs.openclaw, onMsg)
      messageRouter.addAdapter(adapter)
      await adapter.start()
      return adapter.isConnected() ? 'connected' : 'connecting'
    }

    if (name === 'telegram' && configs.telegram?.enabled) {
      const adapter = new TelegramAdapter(configs.telegram, onMsg)
      messageRouter.addAdapter(adapter)
      await adapter.start()
      return adapter.isConnected() ? 'connected' : 'connecting'
    }

    return 'disabled'
  } catch (err) {
    console.error(`[Adapter] Failed to start ${name}:`, err)
    return 'error'
  }
}

async function initAdapters(): Promise<void> {
  const configs = loadAdapterConfigs()
  if (configs.feishu?.enabled) await startAdapter('feishu', configs)
  if (configs.discord?.enabled) await startAdapter('discord', configs)
  if (configs.openclaw?.enabled) await startAdapter('openclaw', configs)
  if (configs.telegram?.enabled) await startAdapter('telegram', configs)
}

async function stopAllAdapters(): Promise<void> {
  const status = messageRouter.getStatus()
  for (const name of Object.keys(status)) {
    messageRouter.removeAdapter(name)
  }
}

// ──── Session persistence ────

function getSessionPath(): string {
  const dir = join(app.getPath('userData'), 'session')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return join(dir, 'panes.json')
}

function saveSession(): void {
  try {
    const config = ptyManager.getSessionConfig()
    writeFileSync(getSessionPath(), JSON.stringify(config, null, 2))
  } catch { /* ignore */ }
}

function restoreSession(): void {
  try {
    const raw = readFileSync(getSessionPath(), 'utf-8')
    const configs = JSON.parse(raw) as Array<{ type: string; cwd: string; yoloLevel: string }>
    for (const cfg of configs) {
      const pane = ptyManager.create(cfg.type, cfg.cwd)
      if (cfg.yoloLevel !== 'off') {
        ptyManager.setYolo(pane.id, cfg.yoloLevel as 'safe' | 'full')
      }
    }
  } catch { /* no session to restore */ }
}

// ──── Window & IPC ────

function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#161b22',
      symbolColor: '#c9d1d9',
      height: 32
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Forward PTY events to renderer
  ptyManager.on('pane:output', (msg: { id: string; data: string }) => {
    safeSend('pane:output', msg)
  })

  ptyManager.on('pane:event', (msg: { id: string; event: unknown }) => {
    safeSend('pane:event', msg)
    const evt = msg.event as { type: string; content: string; time: number }
    bridgeServer.broadcastEvent(msg.id, evt)
    // Route to IM adapters
    messageRouter.dispatchEvent(msg.id, evt)
  })

  ptyManager.on('pane:exit', (msg: { id: string; exitCode: number }) => {
    safeSend('pane:exit', msg)
  })

  ptyManager.on('pane:clear', (msg: { id: string }) => {
    safeSend('pane:clear', msg)
  })

  ptyManager.on('pane:listUpdate', (panes: unknown[]) => {
    safeSend('pane:listUpdate', panes)
    bridgeServer.broadcastPaneList(panes as import('./pty-manager').PaneInfo[])
  })

  bridgeServer.on('statusChange', (status: { serverRunning: boolean; clientCount: number; leaveMode: boolean }) => {
    safeSend('bridge:status', status)
  })

  setupIPC()

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupIPC(): void {
  ipcMain.handle('pane:create', async (_, args: { type: string; cwd: string }) => {
    return ptyManager.create(args.type, args.cwd)
  })

  ipcMain.handle('pane:close', async (_, id: string) => {
    ptyManager.close(id)
  })

  ipcMain.handle('pane:restart', async (_, id: string) => {
    return ptyManager.restart(id)
  })

  ipcMain.handle('pane:write', async (_, args: { id: string; text: string }) => {
    ptyManager.write(args.id, args.text)
  })

  ipcMain.handle('pane:resize', async (_, args: { id: string; cols: number; rows: number }) => {
    ptyManager.resize(args.id, args.cols, args.rows)
  })

  ipcMain.handle('pane:list', async () => {
    return ptyManager.list()
  })

  ipcMain.handle('pane:setYolo', async (_, args: { id: string; level: string }) => {
    ptyManager.setYolo(args.id, args.level as import('./pty-manager').YoloLevel)
  })

  ipcMain.handle('pane:rename', async (_, args: { id: string; title: string }) => {
    ptyManager.rename(args.id, args.title)
  })

  ipcMain.handle('bridge:setLeaveMode', async (_, enabled: boolean) => {
    bridgeServer.setLeaveMode(enabled)
    messageRouter.setLeaveMode(enabled)
    if (enabled) {
      discovery.start()
    } else {
      discovery.stop()
    }
    safeSend('bridge:status', bridgeServer.getStatus())
  })

  ipcMain.handle('bridge:getStatus', async () => {
    return {
      ...bridgeServer.getStatus(),
      adapters: messageRouter.getStatus()
    }
  })

  // ──── Adapter config IPC ────

  ipcMain.handle('adapter:getConfigs', async () => {
    return loadAdapterConfigs()
  })

  ipcMain.handle('adapter:saveConfig', async (_, args: { name: string; config: Record<string, unknown> }) => {
    const configs = loadAdapterConfigs()
    ;(configs as Record<string, unknown>)[args.name] = args.config
    saveAdapterConfigs(configs)

    // Restart the adapter
    const result = await startAdapter(args.name, configs)
    safeSend('bridge:status', {
      ...bridgeServer.getStatus(),
      adapters: messageRouter.getStatus()
    })
    return result
  })

  ipcMain.handle('adapter:getStatus', async () => {
    return messageRouter.getStatus()
  })

  // Dialog for selecting directory
  ipcMain.handle('dialog:selectDir', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

app.whenReady().then(async () => {
  createWindow()
  restoreSession()
  bridgeServer.start()
  await initAdapters()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  saveSession()
  await stopAllAdapters()
  bridgeServer.stop()
  discovery.stop()
  ptyManager.cleanup()
  if (process.platform !== 'darwin') app.quit()
})
