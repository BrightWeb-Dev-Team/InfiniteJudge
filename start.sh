#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime"
DATA_DIR="$ROOT_DIR/data"
MAIN_PORT="${PORT:-4001}"
DB_PATH="${DB_PATH:-$DATA_DIR/infinte.db}"

die() {
  echo "启动失败：$1" >&2
  exit 1
}

command -v node >/dev/null || die "未找到 Node.js，请安装 Node.js 22 或更高版本。"
command -v npm >/dev/null || die "未找到 npm。"
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])')"
[ "$NODE_MAJOR" -ge 22 ] || die "需要 Node.js 22 或更高版本，当前为 Node.js $NODE_MAJOR。"

cd "$ROOT_DIR"
[ -d node_modules ] || die "未找到 node_modules，请先运行 npm ci。"
mkdir -p "$RUNTIME_DIR" "$(dirname "$DB_PATH")"

echo "构建 InfiniteJudge 主站..."
npm run build

stop_pid_file() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "停止旧进程：$pid"
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
    fi
    rm -f "$file"
  fi
}

stop_pid_file "$RUNTIME_DIR/infinitejudge.pid"

echo "启动 InfiniteJudge：端口 $MAIN_PORT"
NODE_ENV=production \
PORT="$MAIN_PORT" \
DB_PATH="$DB_PATH" \
IJ_LICENSE_KEY="${IJ_LICENSE_KEY:-}" \
IJ_LICENSE_SERVER_URL="${IJ_LICENSE_SERVER_URL:-https://key.brightweb.top}" \
nohup node server/index.js >>"$RUNTIME_DIR/infinitejudge.log" 2>&1 &
MAIN_PID=$!
echo "$MAIN_PID" > "$RUNTIME_DIR/infinitejudge.pid"

sleep 1
if ! kill -0 "$MAIN_PID" 2>/dev/null; then
  tail -n 30 "$RUNTIME_DIR/infinitejudge.log" >&2 || true
  die "InfiniteJudge 主站未能启动。"
fi

echo
echo "InfiniteJudge：      http://localhost:$MAIN_PORT"
echo "官方授权服务：       https://key.brightweb.top"
echo "主站日志：           $RUNTIME_DIR/infinitejudge.log"
