// beautiful-mermaid has no command; this is the smallest one: node bm-cli.mjs text|svg <file.mmd>
import { readFileSync } from 'node:fs'
import { loadBeautifulMermaid } from './libs.mjs'

const [fmt, file] = process.argv.slice(2)
const { renderMermaidASCII, renderMermaidSVG } = await loadBeautifulMermaid()
const src = readFileSync(file, 'utf8')
const out = fmt === 'svg' ? renderMermaidSVG(src) : renderMermaidASCII(src, { colorMode: 'none' })
process.stdout.write(out + '\n')
