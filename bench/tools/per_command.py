"""Time per command: every flowchart example, every tool and output, a new process per drawing, wall clock.
Runs go round by round (file 1 every tool, file 2 every tool, ...) so a slow moment of the machine hits every tool
alike. A run counts only when the process exits 0 and prints a drawing (tools.is_drawing); a file counts for a tool
only when every run of it counts. Nothing else should run on the machine meanwhile.

usage: python3 per_command.py <flowchart dir> <work dir> <results dir> [runs]
writes <work>/per-command.csv (one row per run) and <results>/per-command.json
"""
import csv, json, os, statistics, subprocess, sys, time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools

SRC, WORK, RES = sys.argv[1:4]
RUNS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
files = sorted(f for f in os.listdir(SRC) if f.endswith('.mmd'))
pairs = [(t, f) for t, fs in tools.OUTPUTS.items() for f in fs]
out_dir = os.path.join(WORK, 'per-command')
os.makedirs(out_dir, exist_ok=True)

# an empty Node script, for the share of each Node tool's time that is Node starting
empty = []
for _ in range(30):
    t0 = time.perf_counter()
    subprocess.run([tools.NODE, '-e', ''], check=True)
    empty.append((time.perf_counter() - t0) * 1000)

rows = []
for run in range(1, RUNS + 1):
    for f in files:
        for tool, fmt in pairs:
            out = os.path.join(out_dir, f'{tool}-{fmt}-{f[:-4]}.' + ('svg' if fmt == 'svg' else 'txt'))
            if os.path.exists(out):
                os.remove(out)
            argv, writes = tools.cmd(tool, fmt, os.path.join(SRC, f), out)
            t0 = time.perf_counter()
            try:
                p = subprocess.run(argv, capture_output=True, env=tools.ENV, timeout=120, cwd=out_dir)
                ms = (time.perf_counter() - t0) * 1000
                data = (open(out, 'rb').read() if os.path.exists(out) else b'') if writes else p.stdout
                ok = p.returncode == 0 and tools.is_drawing(fmt, data)
            except subprocess.TimeoutExpired:
                ms, ok = (time.perf_counter() - t0) * 1000, False
            rows.append(dict(tool=tool, output=fmt, file=f, run=run, ms=round(ms, 2), ok=int(ok)))
    print(f'per command: round {run} of {RUNS} done', flush=True)

with open(os.path.join(WORK, 'per-command.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

runs = defaultdict(list)
okf = defaultdict(lambda: True)
for r in rows:
    k = (f"{r['tool']}/{r['output']}", r['file'])
    runs[k].append(r['ms'])
    okf[k] = okf[k] and r['ok'] == 1
keys = [f'{t}/{f}' for t, f in pairs]
common = [f for f in files if all(okf[(k, f)] for k in keys)]


def med(xs):
    return round(statistics.median(xs), 2) if xs else None


result = {'files': len(files), 'runs': RUNS, 'common_files': len(common), 'common': common,
          'empty_node_ms': round(statistics.median(empty), 1), 'tools': {}}
for k in keys:
    own = [f for f in files if okf[(k, f)]]
    per = {f: statistics.median(runs[(k, f)]) for f in files}
    result['tools'][k] = dict(drawn=len(own), median_ms_common=med([per[f] for f in common]),
                              median_ms_own=med([per[f] for f in own]))
os.makedirs(RES, exist_ok=True)
json.dump(result, open(os.path.join(RES, 'per-command.json'), 'w'), indent=1)
print(f"per command, median ms over the {len(common)} flowcharts every tool draws (empty Node script: {result['empty_node_ms']} ms)")
for k, v in result['tools'].items():
    print(f"{k:28} {v['median_ms_common']:8}  drawn {v['drawn']}/{len(files)}")
