import { describe, expect, it } from 'vitest';
import { firstWord } from '../src/registry.ts';
import { render } from '../src/index.ts';

describe('firstWord', () => {
  it('skips blank lines and comments', () => {
    expect(firstWord('\n%% note\n  sequenceDiagram\n')).toBe('sequenceDiagram');
  });

  it('skips a leading front-matter block', () => {
    expect(firstWord('---\nconfig:\n  theme: base\n---\ntimeline\n  title T')).toBe('timeline');
  });

  it('skips front matter that follows blank lines and an init directive', () => {
    expect(firstWord('\n%%{init: {}}%%\n---\ntitle: x\n---\npie\n')).toBe('pie');
  });

  it('reads only the first front-matter block', () => {
    expect(firstWord('---\na: 1\n---\n---\nflowchart')).toBe('---');
  });

  it('lets every front-end read a source that starts with front matter, keeping line numbers', () => {
    expect(render('---\ntitle: x\n---\nflowchart TD\n a-->b')).toContain('<svg');
    expect(render('---\ntitle: x\n---\nsequenceDiagram\n A->>B: hi')).toContain('<svg');
    expect(() => render('---\ntitle: x\n---\nflowchart TD\n a-->')).toThrow(/line 5/);
  });
});
