import { createWriteStream, existsSync, chmodSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { spawnSync } from 'node:child_process'
import * as tar from 'tar'
import extractZip from 'extract-zip'
import { appPaths } from './settings'

export const OPENCODE_VERSION = '1.19.5'

function plat() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return { os, arch, exe: process.platform === 'win32' ? 'opencode.exe' : 'opencode' }
}

export function binaryPath(): string {
  const { exe } = plat()
  return join(appPaths().bin, exe)
}

export function cliVersion(): string | null {
  const bin = binaryPath()
  if (!existsSync(bin)) return null
  try {
    const res = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 })
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim()
    const match = out.match(/\d+\.\d+\.\d+/)
    return match ? match[0] : out || null
  } catch {
    return null
  }
}

function normalizeVersion(v: string | null): [number, number, number] | null {
  if (!v) return null
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function cliIsUsable(): boolean {
  const v = normalizeVersion(cliVersion())
  if (!v) return false
  const [maj, min] = v
  return maj > 1 || (maj === 1 && min >= 18)
}

type DownloadSource = { name: string; url: string; kind: 'tgz' | 'zip' }

function sources(): DownloadSource[] {
  const { os, arch } = plat()
  const pkg = `opencode-${os}-${arch}`
  const npm: DownloadSource = {
    name: 'npm registry',
    url: `https://registry.npmjs.org/${pkg}/-/${pkg}-${OPENCODE_VERSION}.tgz`,
    kind: 'tgz'
  }
  const ghAsset =
    process.platform === 'win32'
      ? `${pkg}.zip`
      : `${pkg}.tar.gz`
  const gh: DownloadSource = {
    name: 'GitHub releases',
    url: `https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${ghAsset}`,
    kind: process.platform === 'win32' ? 'zip' : 'tgz'
  }
  return [npm, gh]
}

function download(url: string, dest: string, onProgress: (pct: number) => void, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('too many redirects'))
    const getter = url.startsWith('https:') ? httpsGet : httpGet
    const req = getter(url, { headers: { 'user-agent': 'opencode-desk' } }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        resolve(download(next, dest, onProgress, redirects + 1))
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }
      const total = Number(res.headers['content-length'] || 0)
      let received = 0
      const out = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
      })
      res.pipe(out)
      out.on('finish', () => {
        onProgress(100)
        resolve()
      })
      out.on('error', reject)
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(60000, () => {
      req.destroy(new Error('download timeout'))
    })
  })
}

function findBinary(dir: string, exe: string): string | null {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as import('node:fs').Dirent[]
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findBinary(full, exe)
      if (nested) return nested
    } else if (entry.name === exe) {
      return full
    }
  }
  return null
}

export async function installCli(onProgress: (pct: number, label: string) => void): Promise<string> {
  const paths = appPaths()
  const { exe } = plat()
  mkdirSync(paths.bin, { recursive: true })
  mkdirSync(paths.cache, { recursive: true })

  let lastError: Error | null = null
  for (const src of sources()) {
    const archive = join(paths.cache, `opencode-download.${src.kind}`)
    const extractDir = join(paths.cache, `opencode-extract-${src.kind}`)
    try {
      onProgress(0, `دریافت OpenCode ${OPENCODE_VERSION} از ${src.name}`)
      if (existsSync(archive)) rmSync(archive, { force: true })
      await download(src.url, archive, (pct) => onProgress(pct, `دریافت از ${src.name}`))
      onProgress(100, 'استخراج فایل‌ها')
      rmSync(extractDir, { recursive: true, force: true })
      mkdirSync(extractDir, { recursive: true })
      if (src.kind === 'zip') {
        await extractZip(archive, { dir: extractDir })
      } else {
        await tar.x({ file: archive, cwd: extractDir })
      }
      const found = findBinary(extractDir, exe)
      if (!found) throw new Error('binary not found in archive')
      copyFileSync(found, binaryPath())
      if (process.platform !== 'win32') chmodSync(binaryPath(), 0o755)
      rmSync(archive, { force: true })
      rmSync(extractDir, { recursive: true, force: true })
      return binaryPath()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      rmSync(archive, { force: true })
      rmSync(extractDir, { recursive: true, force: true })
    }
  }
  throw new Error(`نصب OpenCode ناموفق بود: ${lastError?.message ?? 'unknown error'}`)
}
