// Pele has no command; this is the smallest one: node pele-cli.mjs <file.mmd>   (plain Node, no browser)
import { readFileSync } from 'node:fs'
import { loadPele } from './libs.mjs'

const { render } = await loadPele()
process.stdout.write(render(readFileSync(process.argv[2], 'utf8')).svg + '\n')
