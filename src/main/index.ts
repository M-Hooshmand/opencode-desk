import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { ensureDirs, readSettings, writeSettings, writeAuthKey, readAuthKeyFromDisk, readSystemInstalledKey } from './settings'
import { cliIsUsable, cliVersion, installCli, OPENCODE_VERSION } from './cli'
import { apiRequest, isRunning, startEventStream, startServer, stopServer } from './server'
import type { ModelInfo, ServerStatus, Settings } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let status: ServerStatus = { state: 'idle' }
let booting: Promise<ServerStatus> | null = null
let lastLog = ''

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function setStatus(next: Partial<ServerStatus>) {
  status = { ...status, ...next }
  broadcast('oc:status', status)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0f17',
    title: 'OpenCode Desk',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<ServerStatus> {
  if (booting) return booting
  if (status.state === 'ready' && isRunning()) return status
  booting = (async () => {
    try {
      ensureDirs()
      const settings = readSettings()
      if (settings.apiKey) writeAuthKey(settings.apiKey)

      if (!cliIsUsable()) {
        setStatus({ state: 'installing', message: `آماده‌سازی OpenCode ${OPENCODE_VERSION}`, progress: 0 })
        await installCli((pct, label) => setStatus({ state: 'installing', message: label, progress: pct }))
      }

      setStatus({ state: 'starting', message: 'راه‌اندازی سرور OpenCode', progress: 100 })
      await startServer((line) => {
        lastLog = (lastLog + line).slice(-4000)
      })
      setStatus({ state: 'ready', message: 'آماده است', progress: 100, version: cliVersion() ?? undefined })
      void startEventStream((payload) => broadcast('oc:event', payload))
      return status
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ state: 'error', message: `${message}${lastLog ? `\n${lastLog.slice(-600)}` : ''}` })
      return status
    } finally {
      booting = null
    }
  })()
  return booting
}

function registerIpc() {
  ipcMain.handle('app:status', () => status)
  ipcMain.handle('app:bootstrap', () => bootstrap())
  ipcMain.handle('app:restart', async () => {
    await stopServer()
    setStatus({ state: 'idle', message: undefined, progress: undefined })
    return bootstrap()
  })

  ipcMain.handle('api:request', async (_e, req: { path: string; method?: string; body?: unknown }) => {
    try {
      return await apiRequest(req.path, req.method ?? 'GET', req.body)
    } catch (err) {
      return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => writeSettings(patch))

  ipcMain.handle('auth:set-key', async (_e, key: string) => {
    writeAuthKey(key)
    writeSettings({ apiKey: key.trim() })
    try {
      await apiRequest('/auth/opencode', 'PUT', { type: 'api', key: key.trim() })
    } catch {
      /* server may be down; disk write is enough */
    }
    return { ok: true }
  })

  ipcMain.handle('auth:status', async () => {
    const fromDisk = readAuthKeyFromDisk()
    let connected: string[] = []
    try {
      const res = await apiRequest('/provider')
      const data = res.data as { connected?: string[] } | null
      connected = data?.connected ?? []
    } catch {
      /* ignore */
    }
    return { hasKey: !!fromDisk, connectedProviders: connected }
  })

  ipcMain.handle('auth:detect', () => {
    const key = readSystemInstalledKey()
    return { key: key ?? '' }
  })

  ipcMain.handle('models:list', async () => {
    const res = await apiRequest('/provider')
    const data = res.data as {
      all?: Array<{
        id: string
        name?: string
        models?: Record<
          string,
          { name?: string; cost?: { input?: number; output?: number }; capabilities?: { input?: { image?: boolean } } }
        >
      }>
      connected?: string[]
    } | null
    if (!data?.all) return []
    const connected = new Set(data.connected ?? [])
    const allow = new Set(['opencode', 'opencode-go'])
    const list: ModelInfo[] = []
    for (const provider of data.all) {
      if (!allow.has(provider.id) && !connected.has(provider.id)) continue
      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        const cost = model.cost
        const free = (cost?.input ?? 1) === 0 && (cost?.output ?? 1) === 0
        const vision = model.capabilities?.input?.image !== false
        list.push({
          providerID: provider.id,
          id: modelID,
          name: model.name ?? modelID,
          free: free || modelID.endsWith('-free'),
          vision
        })
      }
    }
    return list
  })

  ipcMain.handle('app:version', () => ({ app: app.getVersion(), opencode: cliVersion() }))
  ipcMain.handle('app:is-running', () => isRunning())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void stopServer()
})
