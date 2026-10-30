import { copyFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const dir = 'release'
const targets = [
  { match: /-linux-x86_64\.AppImage$/, name: 'OpenCodeDesk-linux-x86_64.AppImage' },
  { match: /-linux-amd64\.deb$/, name: 'OpenCodeDesk-linux-amd64.deb' },
  { match: /-Setup-[0-9][^/]*-x64\.exe$/, name: 'OpenCodeDesk-win-x64.exe' },
  { match: /-win-x64\.exe$/, name: 'OpenCodeDesk-win-x64.exe' },
  { match: /-win-x64\.zip$/, name: 'OpenCodeDesk-win-x64.zip' }
]

let entries
try {
  entries = await readdir(dir)
} catch {
  console.log('no release directory, nothing to alias')
  process.exit(0)
}

for (const target of targets) {
  const source = entries.find((file) => target.match.test(file))
  if (!source) continue
  const from = join(dir, source)
  const to = join(dir, target.name)
  if (from === to) continue
  await copyFile(from, to)
  const size = (await stat(to)).size
  console.log(`${target.name} <- ${source} (${(size / 1024 / 1024).toFixed(1)} MB)`)
}
