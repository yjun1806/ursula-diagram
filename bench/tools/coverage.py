"""Coverage: every official Mermaid example, every tool, every output it offers, one command per drawing.
A drawing counts when the process exits 0 and its output is a drawing (tools.is_drawing).

usage: python3 coverage.py <examples dir> <work dir> <results dir>
writes <work>/coverage.csv (one row per tool, output and file) and <results>/coverage.json
"""
import csv, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools

EX, WORK, RES = sys.argv[1:4]
TIMEOUT = 120

files = sorted(
    (t, f) for t in os.listdir(EX) if os.path.isdir(os.path.join(EX, t))
    for f in os.listdir(os.path.join(EX, t)) if f.endswith('.mmd'))


def run_tool(tool):
    rows = []
    for fmt in tools.OUTPUTS[tool]:
        d = os.path.join(WORK, 'coverage', tool, fmt)
        os.makedirs(d, exist_ok=True)
        for typ, f in files:
            src = os.path.join(EX, typ, f)
            out = os.path.join(d, f'{typ}__{f[:-4]}.' + ('txt' if fmt == 'text' else 'svg'))
            if os.path.exists(out):
                os.remove(out)
            argv, writes = tools.cmd(tool, fmt, src, out)
            try:
                p = subprocess.run(argv, capture_output=True, env=tools.ENV, timeout=TIMEOUT, cwd=d)
                rc, err = p.returncode, p.stderr.decode('utf8', 'replace')
                if not writes:
                    with open(out, 'wb') as fh:
                        fh.write(p.stdout)
            except subprocess.TimeoutExpired:
                rc, err = 'timeout', ''
            data = open(out, 'rb').read() if os.path.exists(out) else b''
            ok = rc == 0 and tools.is_drawing(fmt, data)
            rows.append(dict(tool=tool, output=fmt, type=typ, file=f, rc=rc, bytes=len(data), ok=int(ok),
                             err=err.strip().splitlines()[-1][:200] if err.strip() else ''))
    print(f'coverage: {tool} done', flush=True)
    return rows


with ThreadPoolExecutor(len(tools.OUTPUTS)) as ex:
    rows = [r for rs in ex.map(run_tool, tools.OUTPUTS) for r in rs]

with open(os.path.join(WORK, 'coverage.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

types = sorted({t for t, _ in files})
summary = {'files': len(files), 'types': len(types), 'tools': {}}
for tool, fmts in tools.OUTPUTS.items():
    for fmt in fmts:
        rs = [r for r in rows if r['tool'] == tool and r['output'] == fmt]
        okt = sorted({r['type'] for r in rs if r['ok']})
        summary['tools'][f'{tool}/{fmt}'] = dict(
            drawn=sum(r['ok'] for r in rs), total=len(rs), types=len(okt),
            exit0_not_drawn=sum(1 for r in rs if r['rc'] == 0 and not r['ok']),
            per_type={t: f"{sum(r['ok'] for r in rs if r['type'] == t)}/{sum(1 for r in rs if r['type'] == t)}"
                      for t in types})
os.makedirs(RES, exist_ok=True)
json.dump(summary, open(os.path.join(RES, 'coverage.json'), 'w'), indent=1)
for k, v in summary['tools'].items():
    print(f"{k:28} {v['drawn']:4}/{v['total']}  types {v['types']}/{len(types)}  exit 0 without a drawing: {v['exit0_not_drawn']}")
