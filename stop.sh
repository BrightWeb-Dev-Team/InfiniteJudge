#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/runtime/infinitejudge.pid"
if [ ! -f "$PID_FILE" ]; then echo "服务未运行。"; exit 0; fi
PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then kill "$PID"; fi
rm -f "$PID_FILE"
echo "Infinite Judge 已停止。"
