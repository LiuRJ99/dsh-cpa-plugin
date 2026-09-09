import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function collectExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    if (value.startsWith('.')) targets.push(value)
    return targets
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) collectExportTargets(child, targets)
  }
  return targets
}

function collectBinTargets(value) {
  if (typeof value === 'string') return [value]
  if (value !== null && typeof value === 'object') return Object.values(value).filter(value => typeof value === 'string')
  return []
}

function requiredTargets() {
  return [...new Set([
    manifest.main,
    manifest.types,
    ...collectExportTargets(manifest.exports),
    ...collectBinTargets(manifest.bin),
    manifest.dsh?.bundle?.patch,
  ].filter(value => typeof value === 'string' && value.startsWith('.')))]
}

function dependencyProblems() {
  const problems = []
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (typeof spec !== 'string') continue
      if (/^(?:link|workspace):/.test(spec) || /^file:(?:\.{1,2}[\\/]|[\\/])/.test(spec)) {
        problems.push(`${section}.${name}=${spec}`)
      }
    }
  }
  return problems
}

if (manifest.packageManager !== 'pnpm@11.7.0') {
  throw new Error(`packageManager must pin pnpm@11.7.0, got ${String(manifest.packageManager)}`)
}

const targets = requiredTargets()
const missing = targets.filter(target => !existsSync(resolve(root, target)))
if (missing.length > 0) throw new Error(`missing package contract targets: ${missing.join(', ')}`)

const problems = dependencyProblems()
if (problems.length > 0) throw new Error(`non-portable dependency specs: ${problems.join(', ')}`)

const workspacePath = resolve(root, 'pnpm-workspace.yaml')
if (existsSync(workspacePath)) {
  const workspace = readFileSync(workspacePath, 'utf8')
  if (/set this to true or false/.test(workspace)) {
    throw new Error('pnpm-workspace.yaml contains an allowBuilds placeholder')
  }
  for (const entry of ["'@google/genai': true", 'protobufjs: true']) {
    if (!workspace.includes(entry)) throw new Error(`pnpm-workspace.yaml must explicitly allow ${entry}`)
  }
}

const packedJson = execFileSync('npm', [
  'pack', '--dry-run', '--ignore-scripts', '--json', '--no-audit', '--no-fund',
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const packed = JSON.parse(packedJson)
const files = (Array.isArray(packed) ? packed[0]?.files : packed?.files) ?? []
const packedPaths = new Set(files.map(file => String(file.path).replace(/^package[\\/]/, '').replaceAll('\\', '/')))
const missingFromArchive = targets.filter(target => !packedPaths.has(target.replace(/^\.\//, '')))
if (missingFromArchive.length > 0) throw new Error(`package archive is missing contract targets: ${missingFromArchive.join(', ')}`)

const forbidden = files
  .map(file => String(file.path).replaceAll('\\', '/'))
  .filter(path => /(?:^|\/)node_modules(?:\/|$)|(?:^|\/)(?:pnpm-lock|package-lock)\.(?:yaml|json)$|(?:^|\/)(?:\.npmrc|\.pnpmfile\.cjs)$/.test(path))
if (forbidden.length > 0) throw new Error(`package archive contains forbidden files: ${forbidden.join(', ')}`)

console.log(`package contract passed: ${manifest.name}@${manifest.version}`)
console.log(`verified targets: ${targets.join(', ')}`)
console.log(`archive files: ${files.length}`)
