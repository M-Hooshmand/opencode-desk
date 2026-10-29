import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { createServer, type Server } from 'node:net'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { appPaths, ensureDirs } from './settings'
import { binaryPath } from './cli'

export const SERVER_USERNAME = 'opencode'

let child: ChildProcess | null = null
let port = 0
let password = ''
let httpServer: Server | null = null
let eventAbort: AbortController | null = null

export function serverBase(): string {
  return `http://127.0.0.1:${port}`
}

export function authHeader(): string {
  if (!password) return ''
  return `Basic ${Buffer.from(`${SERVER_USERNAME}:${password}`).toString('base64')}`
}

export function isRunning(): boolean {
  return !!child && !child.killed && port > 0
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const p = typeof address === 'object' && address ? address.port : 0
      srv.close(() => (p ? resolve(p) : reject(new Error('no free port'))))
    })
  })
}

function buildEnv() {
  const paths = ensureDirs()
  const env: NodeJS.ProcessEnv = {}
  const dropped = new Set([
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'GROQ_API_KEY',
    'XAI_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'MISTRAL_API_KEY',
    'TOGETHER_API_KEY',
    'FIREWORKS_API_KEY',
    'COHERE_API_KEY',
    'PERPLEXITY_API_KEY',
    'CEREBRAS_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'OPENCODE_API_KEY'
  ])
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('OPENCODE_') || dropped.has(key.toUpperCase())) continue
    env[key] = value
  }
  env.HOME = paths.home
  if (process.platform === 'win32') env.USERPROFILE = paths.home
  env.XDG_DATA_HOME = paths.data
  env.XDG_CONFIG_HOME = paths.config
  env.XDG_STATE_HOME = paths.state
  env.XDG_CACHE_HOME = paths.cache
  env.OPENCODE_SERVER_USERNAME = SERVER_USERNAME
  env.OPENCODE_SERVER_PASSWORD = password
  env.OPENCODE_CLIENT = 'desktop'
  env.OPENCODE_DISABLE_AUTOUPDATE = '1'
  env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = 'true'
  env.PATH = `${dirname(binaryPath())}${process.platform === 'win32' ? ';' : ':'}${env.PATH ?? ''}`
  env.NO_COLOR = '1'
  return { env, paths }
}

async function waitForHealth(timeoutMs = 90000): Promise<void> {
  const started = Date.now()
  let lastError = ''
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await httpJson('/global/health', 'GET', undefined, 1200)
      if (res.ok) {
        const data = res.data as { healthy?: boolean }
        if (data?.healthy) return
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`سرور OpenCode در زمان مقرر بالا نیامد${lastError ? ` (${lastError})` : ''}`)
}

export async function startServer(onLog: (line: string) => void, timeoutMs?: number): Promise<number> {
  await stopServer()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    port = await freePort()
    password = randomBytes(24).toString('hex')
    const { env, paths } = buildEnv()

    const bin = binaryPath()
    const proc = spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
      cwd: paths.workspace,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child = proc
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => onLog(chunk))
    proc.stderr?.on('data', (chunk: string) => onLog(chunk))
    proc.on('exit', (code) => {
      onLog(`[server exited: ${code}]`)
    })

    try {
      await waitForHealth(timeoutMs)
      return port
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      onLog(`[health check failed on port ${port} (attempt ${attempt})]`)
      await stopServer()
    }
  }

  throw lastError ?? new Error('opencode server did not start')
}

export async function stopServer(): Promise<void> {
  eventAbort?.abort()
  eventAbort = null
  httpServer?.close()
  httpServer = null
  const proc = child
  child = null
  port = 0
  if (!proc || proc.killed) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve()
    }, 3000)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      proc.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

export async function apiRequest(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  if (!isRunning()) throw new Error('سرور OpenCode در حال اجرا نیست')
  const out = await httpJson(path, method, body)
  return out
}

function httpJson(
  path: string,
  method = 'GET',
  body?: unknown,
  timeoutMs = 120000
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : null
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        agent: false,
        timeout: timeoutMs,
        headers: {
          authorization: authHeader(),
          accept: 'application/json',
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data: unknown = null
          if (text) {
            try {
              data = JSON.parse(text)
            } catch {
              data = text
            }
          }
          const status = res.statusCode ?? 0
          resolve({ ok: status >= 200 && status < 300, status, data, error: status >= 300 ? text.slice(0, 2000) : undefined })
        })
        res.on('error', reject)
      }
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

export async function startEventStream(onEvent: (payload: unknown) => void): Promise<void> {
  eventAbort?.abort()
  const abort = new AbortController()
  eventAbort = abort
  const req = httpRequest({
    host: '127.0.0.1',
    port,
    path: '/event',
    method: 'GET',
    agent: false,
    headers: { authorization: authHeader(), accept: 'text/event-stream' }
  })
  abort.signal.addEventListener('abort', () => req.destroy())
  req.on('response', (res) => {
    if ((res.statusCode ?? 0) !== 200) {
      res.resume()
      return
    }
    res.setEncoding('utf8')
    let buffer = ''
    res.on('data', (chunk: string) => {
      buffer += chunk
      let index = buffer.indexOf('\n\n')
      while (index !== -1) {
        const block = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          try {
            onEvent(JSON.parse(raw))
          } catch {
            /* ignore malformed */
          }
        }
        index = buffer.indexOf('\n\n')
      }
    })
    res.on('error', () => undefined)
  })
  req.on('error', () => undefined)
  req.end()
}
