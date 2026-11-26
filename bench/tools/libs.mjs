// Loads the three JavaScript libraries through each package's main entry, as `import 'pkg'` in a user's program
// would. (Pele's `pele/core` entry has no diagram types registered, so it is not the one to time.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cacheDir, repoRoot } from './paths.mjs'

/** The file `import '<pkg>'` resolves to: the "import" (else "default") condition of exports["."], else main. */
function mainEntry(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  let entry = pkg.exports && typeof pkg.exports === 'object' && '.' in pkg.exports ? pkg.exports['.'] : pkg.exports
  while (entry && typeof entry === 'object') entry = entry.import ?? entry.node ?? entry.default
  return join(dir, entry ?? pkg.module ?? pkg.main)
}

const fromCache = (folder, pkg) => import(pathToFileURL(mainEntry(join(cacheDir, folder, 'node_modules', pkg))).href)

export const loadPele = () => fromCache('pele', 'pele')
export const loadBeautifulMermaid = () => fromCache('beautiful-mermaid', 'beautiful-mermaid')
export const loadUrsula = () => import(pathToFileURL(join(repoRoot, 'dist', 'index.js')).href)
