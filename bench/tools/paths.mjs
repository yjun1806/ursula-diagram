// Folders every benchmark script shares. BENCH_CACHE moves the installed tools; PYTHON picks the Python for termaid.
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const benchDir = resolve(repoRoot, 'bench')
export const cacheDir = resolve(process.env.BENCH_CACHE ?? resolve(benchDir, '.cache'))
export const resultsDir = resolve(benchDir, 'results')
export const python = process.env.PYTHON ?? 'python3'

/** True when the module at `url` is the script node was started with. */
export const isMain = (url) => pathToFileURL(resolve(process.argv[1] ?? '')).href === url
