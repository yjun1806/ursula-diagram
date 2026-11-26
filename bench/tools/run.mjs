// npm run bench:tools [-- step ...]
// Installs the compared tools into bench/.cache, builds ursula if dist/ is missing, then runs the steps in order and
// writes bench/results/*.json. Steps: install, coverage, command, library, wide, site (all of them by default).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { join } from 'node:path'
import { benchDir, cacheDir, python, repoRoot, resultsDir } from './paths.mjs'
import { install } from './install.mjs'
import { writeSiteData } from './to-site.mjs'

const STEPS = ['install', 'coverage', 'command', 'library', 'wide', 'site']
const asked = process.argv.slice(2)
for (const s of asked) if (!STEPS.includes(s)) throw new Error(`unknown step ${s}; the steps are ${STEPS.join(', ')}`)
const steps = asked.length ? asked : STEPS

const tools = join(benchDir, 'tools')
const examples = join(repoRoot, 'site', 'examples', 'official')
const work = join(cacheDir, 'work')
const env = { ...process.env, BENCH_CACHE: cacheDir, URSULA: repoRoot, WIDTH: process.env.WIDTH ?? '100' }
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', env, cwd: work })
const minutes = (t0) => `${((Date.now() - t0) / 60000).toFixed(1)} min`

mkdirSync(work, { recursive: true })
if (steps.includes('install')) await install()
if (!existsSync(join(repoRoot, 'dist', 'index.js'))) {
  console.log('dist/ is missing: building ursula with Bun')
  execFileSync('npx', ['-y', 'bun@1', 'install', '--frozen-lockfile'], { stdio: 'inherit', cwd: repoRoot })
  execFileSync('npx', ['-y', 'bun@1', 'scripts/build.ts'], { stdio: 'inherit', cwd: repoRoot })
}

const t0 = Date.now()
if (steps.some((s) => ['coverage', 'command', 'library', 'wide'].includes(s))) {
  const versions = JSON.parse(readFileSync(join(tools, 'versions.json'), 'utf8'))
  const ursula = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(join(resultsDir, 'run.json'), JSON.stringify({
    date: new Date().toISOString().slice(0, 10), steps, machine: `${cpus()[0]?.model}, ${platform()} ${release()}`,
    node: process.versions.node, python: execFileSync(python, ['--version'], { encoding: 'utf8' }).trim(),
    ursula: `${ursula} (commit ${commit})`, width: Number(env.WIDTH), tools: versions,
  }, null, 1) + '\n')
}
for (const step of steps) {
  const t = Date.now()
  if (step === 'coverage') run(python, [join(tools, 'coverage.py'), examples, work, resultsDir])
  if (step === 'command') run(python, [join(tools, 'per_command.py'), join(examples, 'flowchart'), work, resultsDir])
  if (step === 'library') run(process.execPath, [join(tools, 'in-process.mjs'), join(examples, 'flowchart'), resultsDir])
  if (step === 'wide') run(python, [join(tools, 'wide.py'), join(benchDir, 'inputs', 'wide'), work, resultsDir])
  if (step === 'site') writeSiteData()
  if (step !== 'install') console.log(`${step}: ${minutes(t)}`)
}
console.log(`done in ${minutes(t0)}; results in ${resultsDir}`)
