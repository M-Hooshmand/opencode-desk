import { useMemo, useState } from 'react'
import type { Session } from '../../../shared/types'

type Props = {
  sessions: Session[]
  activeId: string | null
  hasKey: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSettings: () => void
}

function timeLabel(value?: number): string {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
}

export function Sidebar({
  sessions,
  activeId,
  hasKey,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSettings
}: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...sessions].sort(
      (a, b) => (b.time?.updated ?? b.time?.created ?? 0) - (a.time?.updated ?? a.time?.created ?? 0)
    )
    if (!q) return sorted
    return sorted.filter((s) => (s.title || '').toLowerCase().includes(q))
  }, [sessions, query])

  function commitRename(id: string) {
    const title = draft.trim()
    if (title) onRename(id, title)
    setEditing(null)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">⌘</span>
        <div>
          <div className="brand-title">OpenCode Desk</div>
          <div className="brand-sub">دستیار هوش مصنوعی</div>
        </div>
      </div>

      <button className="btn primary new-chat" onClick={onNew}>
        <span>＋</span> گفتگوی جدید
      </button>

      <input
        className="search"
        placeholder="جست‌وجوی گفتگو…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="session-list">
        {visible.length === 0 && <div className="empty-hint">هنوز گفتگویی ندارید</div>}
        {visible.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(session.id)}
          >
            {editing === session.id ? (
              <input
                autoFocus
                className="rename-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(session.id)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="session-main">
                  <div className="session-title">{session.title || 'بدون عنوان'}</div>
                  <div className="session-time">{timeLabel(session.time?.updated ?? session.time?.created)}</div>
                </div>
                <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="تغییر نام"
                    onClick={() => {
                      setEditing(session.id)
                      setDraft(session.title || '')
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn danger"
                    title="حذف"
                    onClick={() => {
                      if (confirm('این گفتگو حذف شود؟')) onDelete(session.id)
                    }}
                  >
                    🗑
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className={`key-chip ${hasKey ? 'ok' : 'warn'}`}>
          {hasKey ? 'کلید API ثبت شده' : 'بدون کلید API (مدل‌های رایگان)'}
        </div>
        <button className="btn ghost" onClick={onSettings}>
          ⚙ تنظیمات
        </button>
      </div>
    </aside>
  )
}
