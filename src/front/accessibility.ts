/** Escapes the characters that end text in XML. */
export const escapeXml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Adds an accessible description (`<desc>`) after the `<title>` of an SVG; an empty or absent description leaves it as is. */
export function withDescription(svg: string, description: string | undefined): string {
  return description === undefined || description === '' ? svg : svg.replace('</title>', `</title><desc>${escapeXml(description)}</desc>`);
}

export interface AccessibilityOptions {
  /** Match `accTitle` and `accDescr` in any letter case. */
  ignoreCase?: boolean;
  /** An `accTitle:` with no text replaces an earlier title with the empty string (the default) or leaves it. */
  emptyTitle?: 'replace' | 'keep';
}

export interface AccessibilityReader {
  /** The text of the last `accTitle:` line, if any. */
  readonly title: string | undefined;
  /** True while `line` is inside an `accDescr { ... }` block; the line that holds the closing brace ends the block. */
  insideBlock(line: string): boolean;
  /** True when `line` is an `accTitle` or `accDescr` line, or opens an `accDescr` block. */
  read(line: string): boolean;
}

/**
 * Reads the `accTitle: ...` line and skips the `accDescr` lines of a diagram source, line by line.
 * Call `insideBlock` first for every line, then `read` for the lines the parser has not claimed yet.
 */
export function createAccessibilityReader(opts: AccessibilityOptions = {}): AccessibilityReader {
  const flags = opts.ignoreCase === true ? 'iu' : 'u';
  const titleLine = new RegExp('^accTitle\\s*:\\s*(.*)$', flags);
  const descLine = new RegExp('^accDescr\\s*:', flags);
  const descBlock = new RegExp('^accDescr\\s*\\{', flags);
  let title: string | undefined;
  let inBlock = false;
  return {
    get title() {
      return title;
    },
    insideBlock(line) {
      if (!inBlock) return false;
      if (line.includes('}')) inBlock = false;
      return true;
    },
    read(line) {
      const found = titleLine.exec(line);
      if (found !== null) {
        const text = (found[1] ?? '').trim();
        if (text !== '' || opts.emptyTitle !== 'keep') title = text;
        return true;
      }
      if (descLine.test(line)) return true;
      if (descBlock.test(line)) {
        inBlock = !line.includes('}');
        return true;
      }
      return false;
    },
  };
}
