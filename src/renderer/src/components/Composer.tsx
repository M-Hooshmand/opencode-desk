import { useEffect, useRef, useState } from 'react'

export type Attachment = {
  id: string
  name: string
  mime: string
  dataUrl: string
}

type Props = {
  streaming: boolean
  visionSupported: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || 'image',
    mime: file.type || 'image/png',
    dataUrl
  }
}

export function Composer({ streaming, visionSupported, onSend, onStop }: Props) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  async function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    const next = await Promise.all(images.map(fileToAttachment))
    setAttachments((prev) => [...prev, ...next].slice(0, 6))
  }

  function submit() {
    const value = text.trim()
    if ((!value && attachments.length === 0) || streaming) return
    onSend(value, attachments)
    setText('')
    setAttachments([])
  }

  return (
    <div
      className={`composer ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files)
      }}
    >
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((att) => (
            <div key={att.id} className="attachment">
              <img src={att.dataUrl} alt={att.name} />
              <button
                className="attachment-remove"
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-row">
        <button
          className="icon-btn attach"
          title="افزودن تصویر"
          onClick={() => fileRef.current?.click()}
        >
          🖼
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder="پیام خود را بنویسید… (Enter برای ارسال، Shift+Enter برای خط جدید)"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files || [])
            if (files.length) {
              e.preventDefault()
              void addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <button className="btn stop" onClick={onStop}>
            توقف
          </button>
        ) : (
          <button className="btn primary send" onClick={submit}>
            ارسال
          </button>
        )}
      </div>

      {!visionSupported && attachments.length > 0 && (
        <div className="composer-warn">مدل انتخاب‌شده از تصویر پشتیبانی نمی‌کند؛ مدل دیگری انتخاب کنید.</div>
      )}
    </div>
  )
}
