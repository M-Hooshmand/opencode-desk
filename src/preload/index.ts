import { contextBridge, ipcRenderer } from 'electron'
import type { ApiResponse, ChatEvent, ModelInfo, ServerStatus, Settings } from '../shared/types'

const api = {
  status: (): Promise<ServerStatus> => ipcRenderer.invoke('app:status'),
  bootstrap: (): Promise<ServerStatus> => ipcRenderer.invoke('app:bootstrap'),
  restart: (): Promise<ServerStatus> => ipcRenderer.invoke('app:restart'),
  request: (req: { path: string; method?: string; body?: unknown }): Promise<ApiResponse> =>
    ipcRenderer.invoke('api:request', req),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),
  setApiKey: (key: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:set-key', key),
  authStatus: (): Promise<{ hasKey: boolean; connectedProviders: string[] }> =>
    ipcRenderer.invoke('auth:status'),
  detectKey: (): Promise<{ key: string }> => ipcRenderer.invoke('auth:detect'),
  listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke('models:list'),
  versions: (): Promise<{ app: string; opencode: string | null }> => ipcRenderer.invoke('app:version'),
  onStatus: (cb: (s: ServerStatus) => void) => {
    const handler = (_e: unknown, s: ServerStatus) => cb(s)
    ipcRenderer.on('oc:status', handler)
    return () => ipcRenderer.removeListener('oc:status', handler)
  },
  onEvent: (cb: (e: ChatEvent) => void) => {
    const handler = (_e: unknown, payload: ChatEvent) => cb(payload)
    ipcRenderer.on('oc:event', handler)
    return () => ipcRenderer.removeListener('oc:event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ExposedApi = typeof api
