export type ApiRequest = {
  path: string
  method?: string
  body?: unknown
}

export type ApiResponse<T = unknown> = {
  ok: boolean
  status: number
  data: T | null
  error?: string
}

export type ModelInfo = {
  providerID: string
  id: string
  name: string
  free: boolean
  vision: boolean
}

export type ServerStatus = {
  state: 'idle' | 'installing' | 'starting' | 'ready' | 'error'
  message?: string
  progress?: number
  version?: string
}

export type Settings = {
  apiKey: string
  providerID: string
  modelID: string
  hideReasoning: boolean
  onboarded: boolean
}

export type AuthInfo = {
  hasKey: boolean
  connectedProviders: string[]
}

export type Part = {
  id?: string
  type: string
  text?: string
  mime?: string
  url?: string
  filename?: string
  [key: string]: unknown
}

export type MessageInfo = {
  id: string
  role: 'user' | 'assistant' | string
  sessionID: string
  time?: { created?: number; completed?: number }
  error?: { name?: string; data?: { message?: string } } | null
  modelID?: string
  providerID?: string
  [key: string]: unknown
}

export type Message = {
  info: MessageInfo
  parts: Part[]
}

export type Session = {
  id: string
  title: string
  time?: { created?: number; updated?: number }
  [key: string]: unknown
}

export type ChatEvent = {
  id?: string
  type: string
  properties?: Record<string, unknown>
}
