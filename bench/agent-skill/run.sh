#!/usr/bin/env bash
# One run: a fresh empty folder with only one skill installed, one headless Claude Code session (claude -p), and the
# session's stream, result and every file it wrote kept under bench/.cache/agent-skill/out/<skill>/<input>/<run>/.
# usage: bench/agent-skill/run.sh <ursula|diagram-design> <input name> <run tag>
# Each run costs money on your Claude account (about 0.10 USD for ursula, 0.55-1.05 USD for diagram-design).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
CACHE=${BENCH_CACHE:-$ROOT/bench/.cache}/agent-skill
MODEL=${MODEL:-claude-opus-5-5}
# diagram-design at the commit that was measured
DD_REPO=https://github.com/cathrynlavery/diagram-design
DD_COMMIT=b228c5d77794a84150fca41b22940bb316b1398d
skill=$1; input=$2; tag=$3

case "$skill" in
  ursula) src="$ROOT/skills/ursula" ;;
  diagram-design)
    if [ ! -d "$CACHE/diagram-design/.git" ]; then
      git clone --quiet "$DD_REPO" "$CACHE/diagram-design"
    fi
    git -C "$CACHE/diagram-design" checkout --quiet "$DD_COMMIT"
    src="$CACHE/diagram-design/skills/diagram-design" ;;
  *) echo "unknown skill: $skill" >&2; exit 2 ;;
esac

work="$CACHE/work/$skill-$input-$tag"
dest="$CACHE/out/$skill/$input/$tag"
rm -rf "$work" "$dest"; mkdir -p "$work/.claude/skills" "$dest"
cp -R "$src" "$work/.claude/skills/$skill"
prompt=$(python3 -I -c '
import sys
t = open(sys.argv[1]).read().rstrip("\n")
c = open(sys.argv[2]).read().rstrip("\n")
print(t.replace("{SKILL}", sys.argv[3]).replace("{CONTENT}", c))' "$HERE/prompt.txt" "$HERE/inputs/$input.mmd" "$skill")
printf '%s\n' "$prompt" > "$dest/prompt.txt"
echo "load: $(uptime | sed 's/.*load averages*: //')" > "$dest/load.txt"
t0=$(python3 -c 'import time; print(time.time())')
set +e
# Only project settings (no user settings, user skills or plugins), no MCP servers, the same five tools.
(cd "$work" && claude -p "$prompt" \
  --model "$MODEL" \
  --output-format stream-json --verbose \
  --setting-sources project \
  --strict-mcp-config --mcp-config "$HERE/empty-mcp.json" \
  --tools "Bash,Read,Write,Edit,Skill" \
  --allowedTools "Bash Read Write Edit Skill" \
  --no-session-persistence \
  --max-budget-usd 25 \
  > "$dest/stream.jsonl" 2> "$dest/stderr.txt")
rc=$?
set -e
t1=$(python3 -c 'import time; print(time.time())')
python3 -c "print(round(($t1 - $t0) * 1000))" > "$dest/wall_ms.txt"
echo "exit: $rc" >> "$dest/load.txt"
tail -n 1 "$dest/stream.jsonl" > "$dest/result.json"
# keep every file the session wrote, without the copy of the skill
(cd "$work" && find . -path ./.claude -prune -o -type f -print | while read -r f; do
  mkdir -p "$dest/files/$(dirname "$f")"; cp "$f" "$dest/files/$f"
done)
echo "$skill $input $tag exit=$rc"
