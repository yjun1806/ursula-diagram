// Turns bench/results/*.json into bench/results/site.json: the speed chart and the coverage, in-process and wide
// tables, with rows in the shape of site/.vitepress/theme/compare/benchmark.json and features.json.
// Only the numbers: the titles and notes stay in the site files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMain, resultsDir } from './paths.mjs'

const read = (name) => {
  const p = join(resultsDir, `${name}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
const NAMES = { ursula: 'ursula', 'mermaid-cli': 'mermaid-cli', pele: 'Pele', termaid: 'termaid',
  'beautiful-mermaid': 'beautiful-mermaid', mmdflux: 'mmdflux', 'mermaid-ascii': 'mermaid-ascii' }
const NO_COMMAND = new Set(['pele', 'beautiful-mermaid']) // timed through a ten-line Node script
const OUTPUT = { svg: { en: 'SVG', ko: 'SVG' }, text: { en: 'text', ko: '글자' } }
const round = (x, d) => (x === null || x === undefined ? false : Number(x.toFixed(d)))

export function writeSiteData() {
  const site = { charts: {}, tables: {} }
  const command = read('per-command')
  if (command) {
    const bars = Object.entries(command.tools).map(([key, v]) => {
      const [tool, out] = key.split('/')
      const star = NO_COMMAND.has(tool) ? '*' : ''
      const bar = { name: { en: `${NAMES[tool]}${star} (${OUTPUT[out].en})`, ko: `${NAMES[tool]}${star} (${OUTPUT[out].ko})` }, value: round(v.median_ms_common, 1) }
      return tool === 'ursula' ? { ...bar, highlight: true } : bar
    })
    site.charts.speed = { files: command.common_files, emptyNodeMs: round(command.empty_node_ms, 0), bars: bars.sort((a, b) => a.value - b.value) }
  }
  const coverage = read('coverage')
  if (coverage) {
    const c = coverage.tools
    const cell = (k) => (c[k] ? c[k].drawn : false)
    const types = (tool) => Math.max(...['svg', 'text'].map((o) => c[`${tool}/${o}`]?.types ?? 0))
    site.tables.coverage = {
      examples: coverage.files,
      rows: Object.keys(NAMES).map((tool) => {
        const row = { name: NAMES[tool], values: [cell(`${tool}/svg`), cell(`${tool}/text`), types(tool)] }
        return tool === 'ursula' ? { ...row, highlight: true } : row
      }),
    }
  }
  const library = read('in-process')
  if (library) {
    const l = library.libraries
    const v = (k) => (l[k] ? round(l[k].median_ms_common, 3) : false)
    site.tables.inProcess = {
      files: library.common_files,
      rows: [
        { name: 'ursula', values: [v('ursula/svg'), v('ursula/text')], highlight: true },
        { name: 'Pele', values: [v('pele/svg'), false] },
        { name: 'beautiful-mermaid', values: [v('beautiful-mermaid/svg'), v('beautiful-mermaid/text')] },
      ],
    }
  }
  const wide = read('wide')
  if (wide) {
    site.tables.wide = {
      rows: Object.entries(wide.summary).map(([tool, s]) => {
        const row = { name: NAMES[tool], values: [s.ko_drawn, s.worse.length, s.extra['15-flow-emoji'] ?? false] }
        return tool === 'ursula' ? { ...row, highlight: true } : row
      }),
    }
  }
  writeFileSync(join(resultsDir, 'site.json'), JSON.stringify(site, null, 2) + '\n')
  console.log(`wrote ${join(resultsDir, 'site.json')}`)
}

if (isMain(import.meta.url)) writeSiteData()
