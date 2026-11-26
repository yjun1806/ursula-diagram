"""Splits the wall time of every agent-skill run into time waiting for the model and time inside tool calls, from the
timestamps in its stream, and says what each turn did.
usage: python3 -I bench/agent-skill/breakdown.py [<name>=]<out folder>... > breakdown.json
An out folder holds <skill>/<input>/<run>/stream.jsonl and result.json, as run.sh writes them. The optional name goes
into every row as "set", to tell apart runs of the same skill at different versions.

How the time is split:
- The session starts duration_ms (from result.json) before the last event of the stream.
- Output tokens are the session total from result.json; the stream does not hold a final count per turn.
- A model turn is one model response (one message id). Its time runs from the end of the previous tool call (or the
  start) to the response's last event.
- A tool call runs from the end of the model turn that asked for it to the moment its result comes back.
- The ursula command is a Bash call that runs scripts/ursula.mjs. A skill script is a Bash call that runs a file under
  the skill's scripts/ folder (for diagram-design: self_check.py, verify_geometry.py, export_png.py and others).
  Every other call (cat, grep, ls, sed, a script the model wrote, a browser screenshot, Read, Write, Edit, loading the
  skill) counts as other tools.
"""
import json
import pathlib
import re
import sys
from datetime import datetime


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def kind(name, inp):
    if name != 'Bash':
        return 'other', name
    cmd = inp.get('command', '')
    if 'ursula.mjs' in cmd:
        flags = re.findall(r'--format \S+|--check|--fix|\bsyntax\b', cmd)
        return 'skill_command', ' '.join(['ursula'] + flags)
    if re.search(r'(^|[\s;&|(])(python3?|node|bash|sh)\s+(\S*/)?scripts/\w', cmd):
        names = sorted(set(re.findall(r'scripts/(\w+)\.\w+', cmd)))
        return 'skill_command', 'skill scripts: ' + ', '.join(names)
    words = sorted(set(re.findall(r'(?:^|[;&|]\s*|\n)\s*(?:cd \S+\s*(?:&&|;)\s*)?([a-z][\w.-]*)', cmd)) - {'cd', 'echo'})
    if 'Google Chrome' in cmd or 'chrome' in cmd.lower():
        words = sorted(set(words) | {'chrome screenshot'})
    return 'other', 'Bash: ' + ', '.join(words[:6])


def one(d):
    res = json.loads((d / 'result.json').read_text())
    events = [json.loads(l) for l in (d / 'stream.jsonl').read_text().splitlines() if l.strip()]
    stamped = [e for e in events if e.get('timestamp')]
    end = ts(stamped[-1]['timestamp'])
    # a few sessions report a duration_ms shorter than their own stream; then the first request starts ttft_ms before
    # the first event
    start = min(end - res['duration_ms'] / 1000, ts(stamped[0]['timestamp']) - res.get('ttft_ms', 0) / 1000)
    turns = []          # one per model response
    pending = {}        # tool_use id -> (turn index, kind, label)
    cursor = start      # end of the last thing that finished
    by_id = {}
    for e in events:
        if e['type'] == 'assistant':
            m = e['message']
            t = ts(e['timestamp'])
            if m['id'] not in by_id:
                by_id[m['id']] = len(turns)
                turns.append({'from': cursor, 'to': t, 'did': [], 'tools': []})
            turn = turns[by_id[m['id']]]
            turn['to'] = t
            for c in m.get('content', []):
                if c['type'] == 'tool_use':
                    k, label = kind(c['name'], c['input'])
                    if c['name'] == 'Write':
                        label = f"Write ({len(c['input'].get('content', '')):,} chars)"
                    pending[c['id']] = (by_id[m['id']], k, label)
                    turn['did'].append(label)
                elif c['type'] == 'text' and c['text'].strip():
                    turn['did'].append('answer')
        elif e['type'] == 'user':
            for c in (e['message'].get('content') or []):
                if isinstance(c, dict) and c.get('type') == 'tool_result' and c['tool_use_id'] in pending:
                    i, k, label = pending.pop(c['tool_use_id'])
                    t = ts(e['timestamp'])
                    turns[i]['tools'].append({'kind': k, 'label': label, 's': max(0.0, t - turns[i]['to'])})
                    cursor = max(cursor, t)
    out_turns = []
    for x in turns:
        # parallel calls of one turn overlap: count the turn's tool time once, split in proportion
        span = max([0.0] + [t['s'] for t in x['tools']])
        total = sum(t['s'] for t in x['tools']) or 1
        tools = [{**t, 's': round(span * t['s'] / total, 3)} for t in x['tools']]
        out_turns.append({
            'model_s': round(x['to'] - x['from'], 3),
            'did': x['did'] or ['thinking'],
            'tools': tools,
        })
    model = sum(t['model_s'] for t in out_turns)
    cmd = sum(c['s'] for t in out_turns for c in t['tools'] if c['kind'] == 'skill_command')
    oth = sum(c['s'] for t in out_turns for c in t['tools'] if c['kind'] == 'other')
    wall = int((d / 'wall_ms.txt').read_text()) / 1000 if (d / 'wall_ms.txt').exists() else None
    return {
        'skill': d.parts[-3], 'input': d.parts[-2], 'run': d.parts[-1],
        'session_s': round(end - start, 2),
        'wall_s': wall,
        'model_s': round(model, 2),
        'skill_command_s': round(cmd, 2),
        'other_tools_s': round(oth, 2),
        'unaccounted_s': round(end - start - model - cmd - oth, 2),
        'model_turns': len(out_turns),
        'num_turns': res.get('num_turns'),
        'output_tokens': sum(m.get('outputTokens', 0) for m in (res.get('modelUsage') or {}).values()),
        'cost_usd': res.get('total_cost_usd'),
        'turns': out_turns,
    }


rows = []
for arg in sys.argv[1:]:
    name, _, root = arg.rpartition('=')
    for res in sorted(pathlib.Path(root).glob('*/*/run*/result.json')):
        if json.loads(res.read_text()).get('type') == 'result':
            rows.append({'set': name or None, **one(res.parent)})
print(json.dumps(rows, ensure_ascii=False, indent=2))
