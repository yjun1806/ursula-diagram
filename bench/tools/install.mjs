// Installs the compared tools into the cache folder (bench/.cache unless BENCH_CACHE says otherwise).
// npm packages from the lockfiles in lock/, the pip package at the version in versions.json, and the two native tools
// as release archives checked against the SHA-256 sums in versions.json. Nothing is installed globally. Running it again skips what is there.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arch, platform } from 'node:os'
import { cacheDir, isMain, python } from './paths.mjs'

const versions = JSON.parse(readFileSync(new URL('./versions.json', import.meta.url), 'utf8'))
const puppeteerEnv = { ...process.env, PUPPETEER_CACHE_DIR: join(cacheDir, 'puppeteer') }
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

function installNpm(name, { package: pkg, version }) {
  // The whole tree is pinned by the lockfile in lock/<name>/, the one the published numbers were measured with.
  const dir = join(cacheDir, name)
  const lock = fileURLToPath(new URL(`./lock/${name}/`, import.meta.url))
  const manifest = join(dir, 'node_modules', ...pkg.split('/'), 'package.json')
  const sameLock = () => readFileSync(join(dir, 'package-lock.json'), 'utf8') === readFileSync(join(lock, 'package-lock.json'), 'utf8')
  const installed = existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).version === version && sameLock()
  if (!installed) {
    mkdirSync(dir, { recursive: true })
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(lock, f), join(dir, f))
    console.log(`installing ${pkg}@${version}`)
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, env: puppeteerEnv })
  }
  // mermaid-cli draws through Puppeteer. Its own install script downloads Chromium; npm may skip install scripts,
  // so the download is asked for here as well (it does nothing when the browser is already there).
  const puppeteerInstall = join(dir, 'node_modules', 'puppeteer', 'install.mjs')
  if (existsSync(puppeteerInstall)) run(process.execPath, [puppeteerInstall], { cwd: dir, env: puppeteerEnv })
}

function installPip(name, { package: pkg, version }) {
  const venv = join(cacheDir, name, 'venv')
  const bin = join(venv, 'bin', name)
  if (existsSync(bin)) {
    const shown = execFileSync(join(venv, 'bin', 'python'), ['-m', 'pip', 'show', pkg], { encoding: 'utf8' })
    if (shown.includes(`Version: ${version}`)) return
  }
  console.log(`installing ${pkg}==${version} into a venv`)
  run(python, ['-m', 'venv', venv])
  run(join(venv, 'bin', 'python'), ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', `${pkg}==${version}`])
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      const found = findFile(p, name)
      if (found) return found
    } else if (entry === name) return p
  }
  return null
}

async function installRelease(name, { version, binary, base, assets }) {
  const bin = join(cacheDir, name, 'bin', binary)
  const stamp = join(cacheDir, name, 'version')
  if (existsSync(bin) && existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return
  const key = `${platform()}-${arch()}`
  const asset = assets[key]
  if (!asset) throw new Error(`${name} ${version} has no release archive for ${key} in versions.json`)
  const [file, sha256] = asset
  console.log(`downloading ${base}${file}`)
  const res = await fetch(base + file)
  if (!res.ok) throw new Error(`${name}: download failed with HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(data).digest('hex')
  if (got !== sha256) throw new Error(`${name}: SHA-256 ${got} does not match ${sha256}`)
  const dir = join(cacheDir, name)
  rmSync(dir, { recursive: true, force: true })
  const unpacked = join(dir, 'unpacked')
  mkdirSync(unpacked, { recursive: true })
  writeFileSync(join(dir, file), data)
  run('tar', ['-xzf', join(dir, file), '-C', unpacked])
  const found = findFile(unpacked, binary)
  if (!found) throw new Error(`${name}: ${binary} not found in ${file}`)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  renameSync(found, bin)
  chmodSync(bin, 0o755)
  writeFileSync(stamp, version)
}

export async function install() {
  mkdirSync(cacheDir, { recursive: true })
  for (const [name, spec] of Object.entries(versions.npm)) installNpm(name, spec)
  for (const [name, spec] of Object.entries(versions.release)) await installRelease(name, spec)
  for (const [name, spec] of Object.entries(versions.pip)) installPip(name, spec)
  // mermaid-cli starts Chromium with this profile folder, so no profile is left in the system temp folder
  writeFileSync(join(cacheDir, 'puppeteer.json'), JSON.stringify({ userDataDir: join(cacheDir, 'chrome-profile') }) + '\n')
  console.log(`tools are in ${cacheDir}`)
}

if (isMain(import.meta.url)) await install()
