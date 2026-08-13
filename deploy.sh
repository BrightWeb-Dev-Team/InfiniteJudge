#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime"
DATA_DIR="$ROOT_DIR/data"
PORT="${PORT:-3001}"

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) echo "仅支持 macOS 和 Linux。" >&2; exit 1 ;;
esac
command -v node >/dev/null || { echo "请先安装 Node.js 22 或更高版本。" >&2; exit 1; }
command -v npm >/dev/null || { echo "未找到 npm。" >&2; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then echo "需要 Node.js 22 或更高版本。" >&2; exit 1; fi

mkdir -p "$RUNTIME_DIR" "$DATA_DIR"
cd "$ROOT_DIR"
npm ci --no-audit --no-fund
npm run build

if [ -f "$RUNTIME_DIR/infinitejudge.pid" ] && kill -0 "$(cat "$RUNTIME_DIR/infinitejudge.pid")" 2>/dev/null; then
  kill "$(cat "$RUNTIME_DIR/infinitejudge.pid")"
  sleep 1
fi
NODE_ENV=production PORT="$PORT" DB_PATH="$DATA_DIR/infinte.db" nohup node server/index.js >>"$RUNTIME_DIR/infinitejudge.log" 2>&1 &
echo $! > "$RUNTIME_DIR/infinitejudge.pid"
sleep 1
if ! kill -0 "$(cat "$RUNTIME_DIR/infinitejudge.pid")" 2>/dev/null; then
  tail -n 30 "$RUNTIME_DIR/infinitejudge.log" >&2
  exit 1
fi

echo "Infinite Judge 已启动：http://localhost:$PORT"
echo "首次访问会显示安装向导；邮件验证默认关闭，可直接完成安装。"
echo "日志：$RUNTIME_DIR/infinitejudge.log"
