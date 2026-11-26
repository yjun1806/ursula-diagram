"""Collects time, turns, tokens and cost of every run under bench/.cache/agent-skill/out/<skill>/<input>/<run>/ into
bench/agent-skill/results.json, and prints a table.
usage: python3 -I bench/agent-skill/summarize.py
"""
import json
import os
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
CACHE = pathlib.Path(os.environ.get('BENCH_CACHE', HERE.parent / '.cache'))
OUT = CACHE / 'agent-skill' / 'out'
rows = []

for res in sorted(OUT.glob('*/*/run*/result.json')):
    d = res.parent
    skill, inp, run = d.parts[-3], d.parts[-2], d.parts[-1]
    r = json.loads(res.read_text())
    if r.get('type') != 'result':
        continue  # a run that has not finished
    # tokens summed over every model the session called (modelUsage)
    mu = r.get('modelUsage') or {}
    tok = {'input': 0, 'output': 0, 'cache_read': 0, 'cache_creation': 0}
    for m in mu.values():
        tok['input'] += m.get('inputTokens', 0)
        tok['output'] += m.get('outputTokens', 0)
        tok['cache_read'] += m.get('cacheReadInputTokens', 0)
        tok['cache_creation'] += m.get('cacheCreationInputTokens', 0)
    # tool calls, counted from the stream
    tools = {}
    for line in (d / 'stream.jsonl').read_text().splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get('type') == 'assistant':
            for c in e['message'].get('content', []):
                if c.get('type') == 'tool_use':
                    tools[c['name']] = tools.get(c['name'], 0) + 1
    files = sorted(
        str(p.relative_to(d / 'files')) for p in (d / 'files').rglob('*') if p.is_file()
    ) if (d / 'files').exists() else []
    rows.append({
        'skill': skill,
        'input': inp,
        'run': run,
        'is_error': r.get('is_error'),
        'subtype': r.get('subtype'),
        'duration_ms': r.get('duration_ms'),
        'duration_api_ms': r.get('duration_api_ms'),
        'wall_ms': int((d / 'wall_ms.txt').read_text().strip()),
        'num_turns': r.get('num_turns'),
        'tool_calls': sum(tools.values()),
        'tools': tools,
        'tokens': tok,
        'tokens_total': sum(tok.values()),
        'cost_usd': r.get('total_cost_usd'),
        'models': sorted(mu.keys()),
        'files': files,
    })

(HERE / 'results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')

print('| Skill | Input | Run | Seconds | API seconds | Turns | Tool calls | Total tokens | Output tokens | Cost (USD) |')
print('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
for x in rows:
    t = x['tokens']
    print(f"| {x['skill']} | {x['input']} | {x['run']} | {x['duration_ms'] / 1000:.0f} | {x['duration_api_ms'] / 1000:.0f} | "
          f"{x['num_turns']} | {x['tool_calls']} | {x['tokens_total']:,} | {t['output']:,} | {x['cost_usd']:.2f} |")
print('total cost:', round(sum(x['cost_usd'] or 0 for x in rows), 2), 'USD')
