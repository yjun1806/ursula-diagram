// Time per call inside one Node process, for the three JavaScript libraries.
// One untimed pass over every file first (warm-up). Then each file is drawn REPEAT times, each time with a different
// trailing comment line (%% run k) so no library can hand back a cached drawing. Every timed call's output is checked:
// a file counts for a library only when all its timed calls returned a drawing (text with a visible character, or an
// SVG). A call that throws or returns nothing is never timed as a drawing.
// usage: node in-process.mjs <flowchart dir> <results dir>      (env WIDTH, default 100)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBeautifulMermaid, loadPele, loadUrsula } from './libs.mjs'

const [src, res] = process.argv.slice(2)
const WIDTH = Number(process.env.WIDTH ?? 100)
const REPEAT = 10
const [ursula, pele, bm] = await Promise.all([loadUrsula(), loadPele(), loadBeautifulMermaid()])

const isText = (out) => typeof out === 'string' && out.trim() !== ''
const isSvg = (out) => typeof out === 'string' && out.includes('<svg')
const draw = {
  'ursula/svg': [(s) => ursula.render(s), isSvg],
  'ursula/text': [(s) => { const r = ursula.renderText(s, WIDTH); return 'lines' in r ? r.lines.join('\n') : null }, isText],
  'pele/svg': [(s) => pele.render(s).svg, isSvg],
  'beautiful-mermaid/svg': [(s) => bm.renderMermaidSVG(s), isSvg],
  'beautiful-mermaid/text': [(s) => bm.renderMermaidASCII(s, { colorMode: 'none' }), isText],
}
const files = readdirSync(src).filter((f) => f.endsWith('.mmd')).sort()
const texts = files.map((f) => readFileSync(join(src, f), 'utf8'))
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }

/** One timed call: its time, and whether it returned a drawing. */
function timed(fn, check, s) {
  const t0 = process.hrtime.bigint()
  let out = null
  try { out = fn(s) } catch { out = null }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  return { ms, ok: check(out) }
}

const perFile = {}
for (const [key, [fn, check]] of Object.entries(draw)) {
  for (const s of texts) timed(fn, check, s) // warm-up
  perFile[key] = texts.map((s) => {
    const calls = Array.from({ length: REPEAT }, (_, k) => timed(fn, check, `${s}\n%% run ${k}`))
    const ok = calls.every((c) => c.ok)
    return { ok, calls: calls.filter((c) => c.ok).length, ms: ok ? median(calls.map((c) => c.ms)) : null }
  })
}

const libs = {}
for (const [key, rows] of Object.entries(perFile)) {
  const drawn = rows.filter((r) => r.ok)
  libs[key] = {
    drawn: drawn.length,
    drawn_calls: rows.reduce((n, r) => n + r.calls, 0),
    calls: rows.length * REPEAT,
    median_ms_own: drawn.length ? Number(median(drawn.map((r) => r.ms)).toFixed(4)) : null,
  }
}
// The medians compare the same drawings: the flowcharts every tool drew in the per-command run when its result is
// there, otherwise the ones every library here draws.
const commandRun = join(res, 'per-command.json')
const commonNames = existsSync(commandRun) ? new Set(JSON.parse(readFileSync(commandRun, 'utf8')).common) : null
const common = files.map((_, i) => i).filter((i) =>
  Object.values(perFile).every((rows) => rows[i].ok) && (!commonNames || commonNames.has(files[i])))
for (const [key, rows] of Object.entries(perFile)) {
  libs[key].median_ms_common = Number(median(common.map((i) => rows[i].ms)).toFixed(4))
}
const result = { files: files.length, repeat: REPEAT, common_files: common.length, libraries: libs,
  per_file: Object.fromEntries(Object.entries(perFile).map(([k, rows]) => [k, Object.fromEntries(rows.map((r, i) => [files[i], r.ms]))])) }
mkdirSync(res, { recursive: true })
writeFileSync(join(res, 'in-process.json'), JSON.stringify(result, null, 1) + '\n')
console.log(`in process, median ms over the ${common.length} flowcharts every library draws`)
for (const [k, v] of Object.entries(libs)) console.log(`${k.padEnd(24)} ${String(v.median_ms_common).padStart(8)}  drawn ${v.drawn}/${files.length} (calls ${v.drawn_calls}/${v.calls})`)
