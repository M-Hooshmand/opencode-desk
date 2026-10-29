import type { ApiResponse, ChatEvent, ModelInfo, ServerStatus, Settings } from '../../shared/types'

declare global {
  interface Window {
    api: {
      status: () => Promise<ServerStatus>
      bootstrap: () => Promise<ServerStatus>
      restart: () => Promise<ServerStatus>
      request: (req: { path: string; method?: string; body?: unknown }) => Promise<ApiResponse>
      getSettings: () => Promise<Settings>
      updateSettings: (patch: Partial<Settings>) => Promise<Settings>
      setApiKey: (key: string) => Promise<{ ok: boolean }>
      authStatus: () => Promise<{ hasKey: boolean; connectedProviders: string[] }>
      detectKey: () => Promise<{ key: string }>
      listModels: () => Promise<ModelInfo[]>
      versions: () => Promise<{ app: string; opencode: string | null }>
      onStatus: (cb: (s: ServerStatus) => void) => () => void
      onEvent: (cb: (e: ChatEvent) => void) => () => void
    }
  }
}

export {}
