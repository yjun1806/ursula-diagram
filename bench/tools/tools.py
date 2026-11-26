"""How each tool is called, and what counts as a drawing. run.mjs sets the environment:

BENCH_CACHE  folder with the installed tools (install.mjs)
URSULA       the repository root: the command is skills/ursula/scripts/ursula.mjs
WIDTH        columns given to every text tool that has a width option (default 100)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
T = os.environ['BENCH_CACHE']
U = os.environ['URSULA']
WIDTH = os.environ.get('WIDTH', '100')
NODE = os.environ.get('NODE', 'node')

URSULA_CLI = os.path.join(U, 'skills', 'ursula', 'scripts', 'ursula.mjs')

# environment for every child process: no colour, Puppeteer's Chromium kept in the cache folder
ENV = dict(os.environ, NO_COLOR='1', PUPPETEER_CACHE_DIR=os.path.join(T, 'puppeteer'))

# which outputs each tool offers
OUTPUTS = {
    'ursula': ['text', 'svg'],
    'beautiful-mermaid': ['text', 'svg'],
    'mmdflux': ['text', 'svg'],
    'mermaid-ascii': ['text'],
    'termaid': ['text'],
    'mermaid-cli': ['svg'],
    'pele': ['svg'],
}


def cmd(tool, fmt, src, out):
    """Return (argv, writes_file). If writes_file is False the drawing is stdout."""
    if tool == 'ursula':
        if fmt == 'text':
            return [NODE, URSULA_CLI, src, '--format', 'text', '--width', WIDTH], False
        return [NODE, URSULA_CLI, src, '--format', 'svg'], False
    if tool == 'beautiful-mermaid':
        return [NODE, os.path.join(HERE, 'bm-cli.mjs'), fmt, src], False
    if tool == 'pele':
        return [NODE, os.path.join(HERE, 'pele-cli.mjs'), src], False
    if tool == 'mmdflux':
        return [os.path.join(T, 'mmdflux', 'bin', 'mmdflux'), '--color', 'off', '-f', 'text' if fmt == 'text' else 'svg', src], False
    if tool == 'mermaid-ascii':
        return [os.path.join(T, 'mermaid-ascii', 'bin', 'mermaid-ascii'), '-f', src, '--max-width', WIDTH], False
    if tool == 'termaid':
        return [os.path.join(T, 'termaid', 'venv', 'bin', 'termaid'), '--width', WIDTH, src], False
    if tool == 'mermaid-cli':
        return [os.path.join(T, 'mermaid-cli', 'node_modules', '.bin', 'mmdc'), '-q', '-i', src, '-o', out,
                '-p', os.path.join(T, 'puppeteer.json')], True
    raise ValueError(tool)


def is_drawing(fmt, data):
    """A drawing is text with at least one visible character, or an SVG that is not an error picture.
    Whether the picture is right is not judged."""
    if fmt == 'text':
        return data.strip() != b''
    return b'<svg' in data and b'aria-roledescription="error"' not in data
