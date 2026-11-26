#!/usr/bin/env bash
# Every run: two skills x three inputs x two runs, one after another (never in parallel), then the summary.
# It needs Claude Code (`claude`) signed in, and it costs money: about 5.60 USD for the twelve runs.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
for tag in run1 run2; do
  for input in order-flow c4-container checkout-sequence; do
    for skill in diagram-design ursula; do
      "$HERE/run.sh" "$skill" "$input" "$tag"
    done
  done
done
python3 -I "$HERE/summarize.py"
