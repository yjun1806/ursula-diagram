// npm run bench:browser
// Times ursula.render against mermaid.render on the flowchart examples, in one page of headless Chrome (Chrome for
// Testing, downloaded by Puppeteer into bench/.cache/puppeteer). Writes bench/results/browser.json.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { benchDir, cacheDir, repoRoot, resultsDir } from '../tools/paths.mjs'

process.env.PUPPETEER_CACHE_DIR = join(cacheDir, 'puppeteer')
const modules = join(benchDir, 'node_modules')
// npm may skip Puppeteer's install script; this downloads the browser when it is not there yet
execFileSync(process.execPath, [join(modules, 'puppeteer', 'install.mjs')], { stdio: 'inherit', cwd: benchDir })
if (!existsSync(join(repoRoot, 'dist', 'ursula.global.js'))) {
  console.log('dist/ is missing: building ursula with Bun')
  execFileSync('npx', ['-y', 'bun@1', 'install', '--frozen-lockfile'], { stdio: 'inherit', cwd: repoRoot })
  execFileSync('npx', ['-y', 'bun@1', 'scripts/build.ts'], { stdio: 'inherit', cwd: repoRoot })
}
const { default: puppeteer } = await import('puppeteer')

const flowcharts = join(repoRoot, 'site', 'examples', 'official', 'flowchart')
const inputs = readdirSync(flowcharts).filter((f) => f.endsWith('.mmd')).sort().map((f) => readFileSync(join(flowcharts, f), 'utf8'))
const files = {
  '/': [join(benchDir, 'browser', 'page.html'), 'text/html'],
  '/ursula.global.js': [join(repoRoot, 'dist', 'ursula.global.js'), 'text/javascript'],
  '/mermaid.min.js': [join(modules, 'mermaid', 'dist', 'mermaid.min.js'), 'text/javascript'],
}
const server = createServer((req, res) => {
  if (req.url === '/inputs.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(inputs))
  }
  const file = files[req.url]
  if (!file) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': file[1] })
  res.end(readFileSync(file[0]))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const browser = await puppeteer.launch({ headless: true })
let result
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  result = await page.evaluate(() => window.benchmark)
  result.browser = await browser.version()
} finally {
  await browser.close()
  server.close()
}
const gzip = (p) => gzipSync(readFileSync(p), { level: 9 }).length
result.date = new Date().toISOString().slice(0, 10)
result.bundleGzipBytes = { ursula: gzip(files['/ursula.global.js'][0]), mermaid: gzip(files['/mermaid.min.js'][0]) }
mkdirSync(resultsDir, { recursive: true })
writeFileSync(join(resultsDir, 'browser.json'), JSON.stringify(result, null, 1) + '\n')
const row = (name, r) => console.log(`${name.padEnd(8)} drawn ${r.drawn}/${result.files}, median ${r.median.toFixed(1)} ms (10th-90th percentile ${r.p10.toFixed(1)}-${r.p90.toFixed(1)} ms)`)
console.log(result.browser)
row('ursula', result.ursula)
row('Mermaid', result.mermaid)
