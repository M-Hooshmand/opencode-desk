import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelInfo } from '../../../shared/types'

type Props = {
  models: ModelInfo[]
  providerID: string
  modelID: string
  disabled?: boolean
  onChange: (model: ModelInfo) => void
}

export function ModelPicker({ models, providerID, modelID, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = models.find((m) => m.providerID === providerID && m.id === modelID)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? models.filter(
          (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
        )
      : models
    return [...list].sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [models, query])

  return (
    <div className="model-picker" ref={boxRef}>
      <button className="model-button" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <span className="model-dot" />
        <span className="model-name">{selected?.name ?? 'انتخاب مدل'}</span>
        {selected?.free && <span className="badge free">رایگان</span>}
        {selected?.vision && <span className="badge vision">تصویر</span>}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="model-popover">
          <input
            autoFocus
            className="search"
            placeholder="جست‌وجوی مدل…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="model-list">
            {filtered.length === 0 && <div className="empty-hint">مدلی یافت نشد</div>}
            {filtered.map((model) => (
              <button
                key={`${model.providerID}/${model.id}`}
                className={`model-item ${
                  model.providerID === providerID && model.id === modelID ? 'active' : ''
                }`}
                onClick={() => {
                  onChange(model)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <div className="model-item-main">
                  <span className="model-item-name">{model.name}</span>
                  <span className="model-item-id">{model.providerID}</span>
                </div>
                <div className="model-item-badges">
                  {model.free && <span className="badge free">رایگان</span>}
                  {model.vision && <span className="badge vision">تصویر</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
