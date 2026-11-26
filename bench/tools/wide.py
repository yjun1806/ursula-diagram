"""Wide characters in terminal text: 13 Korean drawings against the same 13 in English, plus one with Chinese and
Japanese mixed in (14-flow-cjkmix) and one with emoji (15-flow-emoji). Every terminal tool, one run each, and the
break counter (break_count.py). A Korean drawing breaks when it has more dangling strokes than its English twin.

usage: python3 wide.py <inputs dir with ko/ and en/> <work dir> <results dir>
writes <results>/wide.json
"""
import json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools
from break_count import measure

INP, WORK, RES = sys.argv[1:4]
TEXT_TOOLS = [t for t, fs in tools.OUTPUTS.items() if 'text' in fs]
names = sorted(f[:-4] for f in os.listdir(os.path.join(INP, 'ko')) if f.endswith('.mmd'))

per = {}
for tool in TEXT_TOOLS:
    for lang in ('ko', 'en'):
        d = os.path.join(WORK, 'wide', tool, lang)
        os.makedirs(d, exist_ok=True)
        for n in names:
            argv, _ = tools.cmd(tool, 'text', os.path.join(INP, lang, n + '.mmd'), None)
            p = subprocess.run(argv, capture_output=True, env=tools.ENV, timeout=120, cwd=d)
            open(os.path.join(d, n + '.txt'), 'wb').write(p.stdout)
            drawn = p.returncode == 0 and tools.is_drawing('text', p.stdout)
            txt = p.stdout.decode('utf8', 'replace')
            per[f'{tool}|{lang}|{n}'] = dict(drawn=drawn, dangling=measure(txt)['dangling'] if drawn else None)

summary = {}
core = [n for n in names if n[:2].isdigit() and int(n[:2]) <= 13]
for tool in TEXT_TOOLS:
    s = dict(ko_drawn=0, both_drawn=0, ko_dangling=0, en_dangling=0, worse=[], extra={})
    for n in names:
        ko, en = per[f'{tool}|ko|{n}'], per[f'{tool}|en|{n}']
        if n in core and ko['drawn']:
            s['ko_drawn'] += 1
        if ko['drawn'] and en['drawn']:
            extra = ko['dangling'] - en['dangling']
            s['extra'][n] = extra
            if n in core:
                s['both_drawn'] += 1
                s['ko_dangling'] += ko['dangling']
                s['en_dangling'] += en['dangling']
                if extra > 0:
                    s['worse'].append(n)
        else:
            s['extra'][n] = None
    summary[tool] = s
os.makedirs(RES, exist_ok=True)
json.dump(dict(width=tools.WIDTH, summary=summary, per_drawing=per), open(os.path.join(RES, 'wide.json'), 'w'),
          ensure_ascii=False, indent=1)
print('tool | Korean drawn/13 | dangling ko/en | Korean drawings that break | cjkmix extra | emoji extra')
for t, s in summary.items():
    print(t, '|', s['ko_drawn'], '|', f"{s['ko_dangling']}/{s['en_dangling']}", '|', len(s['worse']), s['worse'], '|',
          s['extra'].get('14-flow-cjkmix'), '|', s['extra'].get('15-flow-emoji'))
