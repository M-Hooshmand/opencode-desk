import type { ApiResponse, ModelInfo, Session } from '../../../shared/types'

export async function apiGet<T>(path: string): Promise<T> {
  const res = await window.api.request({ path })
  if (!res.ok) throw new Error(extractError(res))
  return res.data as T
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await window.api.request({ path, method, body })
  if (!res.ok) throw new Error(extractError(res))
  return res.data as T
}

export function extractError(res: ApiResponse): string {
  if (res.error) {
    try {
      const parsed = JSON.parse(res.error) as { message?: string; data?: { message?: string } }
      return parsed.data?.message || parsed.message || res.error
    } catch {
      return res.error
    }
  }
  return `خطای سرور (${res.status})`
}

export function listSessions() {
  return apiGet<Session[]>('/session')
}

export function createSession(title?: string) {
  return apiSend<Session>('/session', 'POST', title ? { title } : {})
}

export function deleteSession(id: string) {
  return apiSend<boolean>(`/session/${id}`, 'DELETE')
}

export function renameSession(id: string, title: string) {
  return apiSend<Session>(`/session/${id}`, 'PATCH', { title })
}

export function fetchMessages(sessionID: string) {
  return apiGet<Array<{ info: never; parts: never[] }>>(`/session/${sessionID}/message`)
}

export function promptAsync(sessionID: string, body: unknown) {
  return apiSend<boolean>(`/session/${sessionID}/prompt_async`, 'POST', body)
}

export function abortSession(sessionID: string) {
  return apiSend<boolean>(`/session/${sessionID}/abort`, 'POST', {})
}

export function listModels() {
  return window.api.listModels()
}

export function groupModels(models: ModelInfo[]) {
  const groups = new Map<string, ModelInfo[]>()
  for (const model of models) {
    const key = model.providerID
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(model)
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
  return groups
}
