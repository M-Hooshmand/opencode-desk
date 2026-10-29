import { useEffect, useRef } from 'react'
import type { Message, Part } from '../../../shared/types'
import { Markdown } from './Markdown'

type Props = {
  messages: Message[]
  streaming: boolean
  hideReasoning: boolean
  modelName: string
}

function TextPart({ part }: { part: Part }) {
  if (!part.text) return null
  return <Markdown text={part.text} />
}

function ReasoningPart({ part }: { part: Part }) {
  if (!part.text) return null
  return (
    <details className="reasoning">
      <summary>استدلال مدل</summary>
      <div className="reasoning-body">{part.text}</div>
    </details>
  )
}

function FilePart({ part }: { part: Part }) {
  const url = typeof part.url === 'string' ? part.url : ''
  if (!url) return null
  if ((part.mime || '').startsWith('image/')) {
    return <img className="msg-image" src={url} alt={part.filename || 'image'} />
  }
  return <div className="file-chip">📎 {part.filename || part.mime || 'فایل'}</div>
}

function ToolPart({ part }: { part: Part }) {
  const tool = typeof part.tool === 'string' ? part.tool : 'ابزار'
  return <div className="tool-chip">⚙ {tool}</div>
}

function PartView({ part, hideReasoning }: { part: Part; hideReasoning: boolean }) {
  switch (part.type) {
    case 'text':
      return <TextPart part={part} />
    case 'reasoning':
      return hideReasoning ? null : <ReasoningPart part={part} />
    case 'file':
      return <FilePart part={part} />
    case 'tool':
      return <ToolPart part={part} />
    default:
      return null
  }
}

function MessageItem({
  message,
  hideReasoning,
  modelName
}: {
  message: Message
  hideReasoning: boolean
  modelName: string
}) {
  const isUser = message.info.role === 'user'
  const error = message.info.error
  const errorMessage =
    typeof error === 'object' && error
      ? (error as { data?: { message?: string }; name?: string }).data?.message ||
        (error as { name?: string }).name ||
        ''
      : ''

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? 'شما' : 'AI'}</div>
      <div className="bubble">
        <div className="msg-meta">
          <span>{isUser ? 'شما' : modelName}</span>
          {message.info.time?.created && (
            <span className="msg-time">
              {new Date(message.info.time.created).toLocaleTimeString('fa-IR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>
        <div className="msg-body">
          {message.parts.map((part, index) => (
            <PartView key={part.id ?? `${message.info.id}-${index}`} part={part} hideReasoning={hideReasoning} />
          ))}
          {message.parts.length === 0 && !isUser && <div className="typing">در حال پاسخ…</div>}
        </div>
        {errorMessage && <div className="msg-error">{errorMessage}</div>}
      </div>
    </div>
  )
}

export function ChatView({ messages, streaming, hideReasoning, modelName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-card">
          <div className="big-mark">⌘</div>
          <h2>چطور می‌توانم کمکتان کنم؟</h2>
          <p>
            سؤال بپرسید، کد بنویسید یا یک تصویر بفرستید تا مدل آن را تحلیل کند. گفتگوها در همین رایانه ذخیره
            می‌شوند.
          </p>
          <div className="suggestions">
            <span>یک تابع پایتون برای مرتب‌سازی بنویس</span>
            <span>این تصویر چه چیزی نشان می‌دهد؟</span>
            <span>یک ایمیل رسمی برای مرخصی بنویس</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-scroll">
      {messages.map((message) => (
        <MessageItem
          key={message.info.id}
          message={message}
          hideReasoning={hideReasoning}
          modelName={modelName}
        />
      ))}
      {streaming && <div className="stream-hint">در حال دریافت پاسخ…</div>}
      <div ref={bottomRef} />
    </div>
  )
}
