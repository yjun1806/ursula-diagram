// Node only. The renderer finds the system fonts through fontconfig's settings on Linux; a slim container often has
// the fonts but not those settings, and then a PNG comes out with no text at all.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The usual font folders of Linux when fontconfig has no settings to name them; none elsewhere. */
export function extraFontDirs(): string[] {
  if (process.platform !== 'linux' || existsSync('/etc/fonts/fonts.conf')) return [];
  const home = homedir();
  return ['/usr/share/fonts', '/usr/local/share/fonts', join(home, '.local/share/fonts'), join(home, '.fonts')].filter((dir) => existsSync(dir));
}
