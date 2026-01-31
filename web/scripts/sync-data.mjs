import { rm, cp, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(webRoot, '..')
const sourceDir = path.resolve(repoRoot, 'data', 'models')
const targetDir = path.resolve(webRoot, 'public', 'data', 'models')

const exists = async (p) => {
  try {
    const info = await stat(p)
    return info.isDirectory()
  } catch {
    return false
  }
}

if (!(await exists(sourceDir))) {
  console.error(`[sync-data] Source not found: ${sourceDir}`)
  process.exit(1)
}

await rm(targetDir, { recursive: true, force: true })
await mkdir(targetDir, { recursive: true })
await cp(sourceDir, targetDir, { recursive: true, dereference: true })
console.log(`[sync-data] Copied ${sourceDir} -> ${targetDir}`)
