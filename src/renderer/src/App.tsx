import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatEvent, Message, ModelInfo, Part, ServerStatus, Session, Settings } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Composer, type Attachment } from './components/Composer'
import { ModelPicker } from './components/ModelPicker'
import { Onboarding, SettingsDialog, Splash } from './components/Dialogs'
import {
  abortSession,
  createSession,
  deleteSession,
  extractError,
  fetchMessages,
  listModels,
  listSessions,
  promptAsync,
  renameSession
} from './lib/api'

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  providerID: 'opencode-go',
  modelID: 'deepseek-v4.1-flash',
  hideReasoning: false,
  onboarded: false
}

type EventPart = Part & { messageID?: string; sessionID?: string }

export default function App() {
  const [status, setStatus] = useState<ServerStatus>({ state: 'idle' })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [streaming, setStreaming] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ message: string; link?: string; label?: string } | null>(
    null
  )
  const [versions, setVersions] = useState<{ app: string; opencode: string | null }>({
    app: '',
    opencode: null
  })
  const [showSettings, setShowSettings] = useState(false)

  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId
  const ready = status.state === 'ready'

  useEffect(() => window.api.onStatus(setStatus), [])

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    void window.api.versions().then(setVersions)
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions()
      setSessions(list)
      return list
    } catch {
      return []
    }
  }, [])

  const refreshMessages = useCallback(async (sessionID: string) => {
    try {
      const list = await fetchMessages(sessionID)
      if (activeRef.current === sessionID) {
        setMessages(list as unknown as Message[])
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void (async () => {
      const [list, modelList, auth] = await Promise.all([
        refreshSessions(),
        listModels().catch(() => [] as ModelInfo[]),
        window.api.authStatus().catch(() => ({ hasKey: false, connectedProviders: [] }))
      ])
      setModels(modelList)
      setHasKey(auth.hasKey)

      const current = await window.api.getSettings()
      const exists = modelList.some(
        (m) => m.providerID === current.providerID && m.id === current.modelID
      )
      if (!exists && modelList.length) {
        const preferred =
          modelList.find((m) => m.providerID === 'opencode-go' && m.id === 'deepseek-v4.1-flash') ??
          modelList.find((m) => m.id === 'deepseek-v4.1-flash') ??
          modelList.find((m) => m.free) ??
          modelList[0]
        const next = await window.api.updateSettings({
          providerID: preferred.providerID,
          modelID: preferred.id
        })
        setSettings(next)
      } else {
        setSettings(current)
      }

      if (!activeRef.current && list.length) {
        setActiveId(list[0].id)
      }
    })()
  }, [ready, refreshSessions])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    void refreshMessages(activeId)
  }, [activeId, refreshMessages])

  useEffect(() => {
    if (!ready) return
    return window.api.onEvent((event: ChatEvent) => {
      const props = (event.properties ?? {}) as Record<string, unknown>
      const sessionID = props.sessionID as string | undefined

      if (event.type === 'message.updated') {
        const info = props.info as Message['info'] | undefined
        if (!info || info.sessionID !== activeRef.current) return
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.info.id === info.id)
          if (index === -1) return [...prev, { info, parts: [] }]
          const next = [...prev]
          next[index] = { ...next[index], info: { ...next[index].info, ...info } }
          return next
        })
        return
      }

      if (event.type === 'message.part.updated') {
        const part = props.part as EventPart | undefined
        if (!part || sessionID !== activeRef.current) return
        const messageID = part.messageID
        if (!messageID) return
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.info.id === messageID)
          if (index === -1) {
            return [
              ...prev,
              {
                info: {
                  id: messageID,
                  role: 'assistant',
                  sessionID: sessionID ?? '',
                  time: { created: Date.now() }
                },
                parts: [part]
              }
            ]
          }
          const next = [...prev]
          const parts = [...next[index].parts]
          const partIndex = parts.findIndex((p) => p.id && p.id === part.id)
          if (partIndex === -1) parts.push(part)
          else parts[partIndex] = { ...parts[partIndex], ...part }
          next[index] = { ...next[index], parts }
          return next
        })
        return
      }

      if (event.type === 'message.removed') {
        const messageID = props.messageID as string | undefined
        if (!messageID) return
        setMessages((prev) => prev.filter((m) => m.info.id !== messageID))
        return
      }

      if (event.type === 'session.idle') {
        if (sessionID === activeRef.current) {
          setStreaming(false)
          setRetry(null)
          void refreshMessages(sessionID)
        }
        void refreshSessions()
        return
      }

      if (event.type === 'session.error') {
        if (sessionID === activeRef.current) {
          setStreaming(false)
          const err = props.error as { data?: { message?: string }; name?: string } | undefined
          setError(err?.data?.message || err?.name || 'خطای نامشخص در تولید پاسخ')
          void refreshMessages(sessionID)
        }
        return
      }

      if (event.type === 'session.updated' || event.type === 'session.deleted') {
        void refreshSessions()
      }
    })
  }, [ready, refreshMessages, refreshSessions])

  const selectedModel = models.find(
    (m) => m.providerID === settings.providerID && m.id === settings.modelID
  )

  useEffect(() => {
    if (!streaming || !activeId) return
    let stop = false
    const tick = async () => {
      const res = await window.api.request({ path: '/session/status' })
      if (stop || !res.ok) return
      const entry = (res.data as Record<string, any> | null)?.[activeId]
      if (!entry) {
        setRetry(null)
        return
      }
      if (entry.type === 'retry') {
        setRetry({
          message: entry.message || 'در حال تلاش مجدد…',
          link: entry.action?.link,
          label: entry.action?.label === 'subscribe' ? 'مشاهده پلن OpenCode Go' : entry.action?.label
        })
      }
    }
    void tick()
    const timer = window.setInterval(tick, 2500)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [streaming, activeId])

  async function handleSend(text: string, attachments: Attachment[]) {
    setError(null)
    setRetry(null)
    if (attachments.length && selectedModel && !selectedModel.vision) {
      setError('مدل انتخاب‌شده از تصویر پشتیبانی نمی‌کند.')
      return
    }
    let sessionID = activeId
    try {
      if (!sessionID) {
        const session = await createSession(text.slice(0, 40) || 'گفتگوی جدید')
        sessionID = session.id
        setActiveId(session.id)
        setSessions((prev) => [session, ...prev])
      }

      const optimistic: Message = {
        info: {
          id: `local-${Date.now()}`,
          role: 'user',
          sessionID,
          time: { created: Date.now() }
        },
        parts: [
          ...(text ? [{ type: 'text', text } as Part] : []),
          ...attachments.map(
            (a): Part => ({ type: 'file', mime: a.mime, url: a.dataUrl, filename: a.name })
          )
        ]
      }
      setMessages((prev) => [...prev, optimistic])
      setStreaming(true)

      const parts = [
        ...(text ? [{ type: 'text', text }] : []),
        ...attachments.map((a) => ({
          type: 'file',
          mime: a.mime,
          url: a.dataUrl,
          filename: a.name
        }))
      ]
      if (parts.length === 0) parts.push({ type: 'text', text: ' ' })

      await promptAsync(sessionID, {
        model: { providerID: settings.providerID, modelID: settings.modelID },
        parts
      })
      setTimeout(() => void refreshMessages(sessionID!), 600)
      void refreshSessions()
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleStop() {
    if (!activeId) return
    try {
      await abortSession(activeId)
    } catch {
      /* ignore */
    }
    setStreaming(false)
  }

  async function handleNewChat() {
    setActiveId(null)
    setMessages([])
    setError(null)
  }

  async function handleDelete(id: string) {
    try {
      await deleteSession(id)
    } catch {
      /* ignore */
    }
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
  }

  async function handleRename(id: string, title: string) {
    try {
      await renameSession(id, title)
    } catch {
      /* ignore */
    }
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  async function handleModelChange(model: ModelInfo) {
    const next = await window.api.updateSettings({
      providerID: model.providerID,
      modelID: model.id
    })
    setSettings(next)
  }

  async function handleFinishOnboarding(apiKey: string) {
    if (apiKey) {
      await window.api.setApiKey(apiKey)
      setHasKey(true)
    }
    const next = await window.api.updateSettings({ apiKey, onboarded: true })
    setSettings(next)
  }

  async function handleSetKey(key: string) {
    if (key) {
      await window.api.setApiKey(key)
      setHasKey(true)
    }
    const next = await window.api.updateSettings({ apiKey: key })
    setSettings(next)
  }

  async function handleRestart() {
    setStatus({ state: 'starting', message: 'راه‌اندازی مجدد موتور' })
    await window.api.restart()
  }

  const needsOnboarding = ready && !settings.onboarded
  const showSplash = status.state !== 'ready'

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        hasKey={hasKey}
        onSelect={(id) => {
          setActiveId(id)
          setError(null)
        }}
        onNew={handleNewChat}
        onDelete={handleDelete}
        onRename={handleRename}
        onSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <header className="topbar">
          <ModelPicker
            models={models}
            providerID={settings.providerID}
            modelID={settings.modelID}
            disabled={!ready}
            onChange={handleModelChange}
          />
          <div className="topbar-actions">
            <button className="btn ghost" onClick={handleNewChat}>
              ＋ گفتگوی جدید
            </button>
            <button className="icon-btn" title="تنظیمات" onClick={() => setShowSettings(true)}>
              ⚙
            </button>
          </div>
        </header>

        {retry && (
          <div className="retry-banner">
            <span>⏳ {retry.message}</span>
            {retry.link && (
              <a className="link" href={retry.link} target="_blank" rel="noreferrer">
                {retry.label || 'جزئیات'}
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="icon-btn" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        <ChatView
          messages={messages}
          streaming={streaming}
          hideReasoning={settings.hideReasoning}
          modelName={selectedModel?.name ?? settings.modelID}
        />

        <Composer
          streaming={streaming}
          visionSupported={selectedModel?.vision ?? true}
          onSend={handleSend}
          onStop={handleStop}
        />
      </main>

      {showSplash && <Splash status={status} />}
      {needsOnboarding && (
        <Onboarding
          opencodeVersion={versions.opencode}
          onFinish={handleFinishOnboarding}
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          versions={versions}
          hasKey={hasKey}
          onSave={async (patch) => {
            const next = await window.api.updateSettings(patch)
            setSettings(next)
          }}
          onSetKey={handleSetKey}
          onRestart={() => void handleRestart()}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
