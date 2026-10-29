import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Settings } from '../shared/types'

const DEFAULTS: Settings = {
  apiKey: '',
  providerID: 'opencode-go',
  modelID: 'deepseek-v4.1-flash',
  hideReasoning: false,
  onboarded: false
}

export function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function readSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function appPaths() {
  const root = app.getPath('userData')
  return {
    root,
    home: join(root, 'home'),
    data: join(root, 'data'),
    config: join(root, 'config'),
    state: join(root, 'state'),
    workspace: join(root, 'workspace'),
    bin: join(root, 'bin'),
    cache: join(root, 'cache')
  }
}

export function ensureDirs() {
  const p = appPaths()
  for (const dir of [p.root, p.home, p.data, p.config, p.state, p.workspace, p.bin, p.cache]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  return p
}

export function authFilePath(): string {
  return join(appPaths().data, 'opencode', 'auth.json')
}

export function writeAuthKey(apiKey: string) {
  const key = apiKey.trim()
  if (!key) return
  const file = authFilePath()
  mkdirSync(dirname(file), { recursive: true })
  let current: Record<string, unknown> = {}
  try {
    current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    current = {}
  }
  const entry = { type: 'api', key }
  current['opencode'] = entry
  current['opencode-go'] = entry
  writeFileSync(file, JSON.stringify(current, null, 2), 'utf8')
}

export function readAuthKeyFromDisk(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(authFilePath(), 'utf8')) as Record<
      string,
      { type?: string; key?: string }
    >
    return parsed?.['opencode']?.key ?? null
  } catch {
    return null
  }
}

export function readSystemInstalledKey(): string | null {
  const home =
    process.platform === 'win32'
      ? process.env.APPDATA || join(app.getPath('home'), 'AppData', 'Roaming')
      : join(app.getPath('home'), '.local', 'share')
  const file = join(home, 'opencode', 'auth.json')
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      { type?: string; key?: string }
    >
    return parsed?.['opencode']?.key ?? null
  } catch {
    return null
  }
}
