import { useEffect, useState } from 'react'
import type { ServerStatus, Settings } from '../../../shared/types'

export function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="overlay">{children}</div>
}

export function Onboarding({
  opencodeVersion,
  onFinish
}: {
  opencodeVersion: string | null
  onFinish: (apiKey: string) => void
}) {
  const [key, setKey] = useState('')
  const [detected, setDetected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function detect() {
    setBusy(true)
    try {
      const res = await window.api.detectKey()
      if (res.key) {
        setKey(res.key)
        setDetected('کلید از نصب موجود OpenCode پیدا شد.')
      } else {
        setDetected('کلید ذخیره‌شده‌ای روی این سیستم پیدا نشد؛ می‌توانید دستی وارد کنید.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay>
      <div className="dialog onboarding">
        <div className="onboard-head">
          <div className="big-mark">⌘</div>
          <h1>به OpenCode Desk خوش آمدید</h1>
          <p>
            این برنامه موتور OpenCode را روی رایانه شما نصب و اجرا می‌کند و با مدل‌های هوش مصنوعی (از جمله
            DeepSeek و MiMo Flash) گفتگو می‌کند.
          </p>
          {opencodeVersion && <div className="version-pill">موتور OpenCode نسخه {opencodeVersion}</div>}
        </div>

        <div className="onboard-step">
          <h3>۱. کلید API (اختیاری)</h3>
          <p className="muted">
            برای استفاده از مدل‌های رایگان نیازی به کلید نیست، اما برای سهمیه پایدار و مدل‌های بیشتر، کلید
            حساب OpenCode خود را وارد کنید.
          </p>
          <input
            className="text-input"
            dir="ltr"
            placeholder="oc_sk_..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="row">
            <button className="btn ghost" onClick={detect} disabled={busy}>
              یافتن کلید از نصب موجود
            </button>
            <a
              className="link"
              href="https://opencode.ai/auth"
              target="_blank"
              rel="noreferrer"
            >
              دریافت کلید از opencode.ai
            </a>
          </div>
          {detected && <div className="hint">{detected}</div>}
        </div>

        <div className="onboard-actions">
          <button className="btn primary" onClick={() => onFinish(key.trim())}>
            شروع گفتگو
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function Splash({ status }: { status: ServerStatus }) {
  const percent = status.progress ?? 0
  return (
    <Overlay>
      <div className="dialog splash">
        <div className="spinner" />
        <h2>
          {status.state === 'installing'
            ? 'نصب موتور OpenCode'
            : status.state === 'starting'
              ? 'راه‌اندازی موتور'
              : status.state === 'error'
                ? 'خطا در راه‌اندازی'
                : 'در حال آماده‌سازی'}
        </h2>
        {status.message && <p className="muted">{status.message}</p>}
        {status.state !== 'error' && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${percent}%` }} />
          </div>
        )}
        {status.state === 'error' && (
          <button className="btn primary" onClick={() => void window.api.restart()}>
            تلاش دوباره
          </button>
        )}
      </div>
    </Overlay>
  )
}

export function SettingsDialog({
  settings,
  versions,
  hasKey,
  onSave,
  onSetKey,
  onRestart,
  onClose
}: {
  settings: Settings
  versions: { app: string; opencode: string | null }
  hasKey: boolean
  onSave: (patch: Partial<Settings>) => void
  onSetKey: (key: string) => Promise<void>
  onRestart: () => void
  onClose: () => void
}) {
  const [key, setKey] = useState(settings.apiKey)
  const [saved, setSaved] = useState(false)
  const [hideReasoning, setHideReasoning] = useState(settings.hideReasoning)

  useEffect(() => {
    setKey(settings.apiKey)
    setHideReasoning(settings.hideReasoning)
  }, [settings])

  async function save() {
    if (key.trim() !== settings.apiKey) {
      await onSetKey(key.trim())
    }
    onSave({ hideReasoning })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <Overlay>
      <div className="dialog settings">
        <div className="dialog-head">
          <h2>تنظیمات</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <section>
          <h3>کلید API</h3>
          <p className="muted">
            {hasKey
              ? 'کلید ثبت شده و در موتور OpenCode فعال است.'
              : 'کلید ثبت نشده؛ از مدل‌های رایگان بدون کلید استفاده می‌شود.'}
          </p>
          <input
            className="text-input"
            dir="ltr"
            placeholder="oc_sk_..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </section>

        <section>
          <h3>نمایش</h3>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={hideReasoning}
              onChange={(e) => setHideReasoning(e.target.checked)}
            />
            <span>پنهان کردن بخش استدلال مدل</span>
          </label>
        </section>

        <section>
          <h3>موتور OpenCode</h3>
          <div className="kv">
            <span>نسخه برنامه</span>
            <span dir="ltr">{versions.app}</span>
          </div>
          <div className="kv">
            <span>نسخه موتور</span>
            <span dir="ltr">{versions.opencode ?? '—'}</span>
          </div>
          <button className="btn ghost" onClick={onRestart}>
            راه‌اندازی مجدد موتور
          </button>
        </section>

        <div className="dialog-actions">
          {saved && <span className="hint">ذخیره شد</span>}
          <button className="btn ghost" onClick={onClose}>
            بستن
          </button>
          <button className="btn primary" onClick={save}>
            ذخیره
          </button>
        </div>
      </div>
    </Overlay>
  )
}
