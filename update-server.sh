#!/usr/bin/env bash
set -euo pipefail

SERVER="${IJ_DEPLOY_SERVER:-root@8.210.166.25}"
REMOTE_DIR="${IJ_DEPLOY_DIR:-/root/InfiniteJudge-v5.0.0}"
PORT="${IJ_DEPLOY_PORT:-4001}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for command in rsync ssh scp expect; do
  command -v "$command" >/dev/null || { echo "缺少 $command" >&2; exit 1; }
done
if [[ -z "${IJ_DEPLOY_PASSWORD:-}" ]]; then
  read -r -s -p "请输入 ${SERVER} 的 SSH 密码: " IJ_DEPLOY_PASSWORD
  echo
fi

REMOTE_RUNNER="$(mktemp -t infinitejudge-remote.XXXXXX)"
EXPECT_FILE="$(mktemp -t infinitejudge-update.XXXXXX)"
cleanup() {
  rm -f "$REMOTE_RUNNER" "$EXPECT_FILE"
  unset IJ_DEPLOY_PASSWORD
}
trap cleanup EXIT

cat > "$REMOTE_RUNNER" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
TARGET="${TARGET:?}"
PORT="${PORT:?}"
mkdir -p "$TARGET/runtime"

# Reuse an existing persistent data directory. Never copy, delete, or replace it.
if [ ! -e "$TARGET/data" ]; then
  for candidate in /opt/infinitejudge/data /root/InfiniteJudge/data; do
    if [ -d "$candidate" ] && [ -f "$candidate/infinte.db" ]; then
      ln -s "$candidate" "$TARGET/data"
      echo "复用数据目录：$candidate"
      break
    fi
  done
fi
if [ ! -e "$TARGET/data" ]; then
  mkdir -p "$TARGET/data"
  echo "未发现旧数据库；仅创建空 data 目录，没有复制或覆盖数据库。"
fi

cd "$TARGET"
npm ci --no-audit --no-fund
npm run build
DATA_REAL="$(cd "$TARGET/data" && pwd -P)"
DB_PATH="$DATA_REAL/infinte.db"

stop_process() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  echo "正在停止旧进程 PID=$pid"
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 40); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep .25
  done
  echo "强制停止旧进程 PID=$pid"
  kill -KILL "$pid" 2>/dev/null || true
}

RECORDED_PID=""
[ -s runtime/infinitejudge.pid ] && RECORDED_PID="$(cat runtime/infinitejudge.pid)"
stop_process "$RECORDED_PID"
PORT_PID="$(ss -ltnp "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
if [ -n "$PORT_PID" ] && [ "$PORT_PID" != "$RECORDED_PID" ]; then
  stop_process "$PORT_PID"
fi
for _ in $(seq 1 40); do
  ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN || break
  sleep .25
done
if ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
  echo "端口 $PORT 仍被占用，取消启动" >&2
  exit 1
fi

NODE_ENV=production PORT="$PORT" DB_PATH="$DB_PATH" nohup node server/index.js >>runtime/infinitejudge.log 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > runtime/infinitejudge.pid
echo "已启动新进程 PID=$NEW_PID"

for _ in $(seq 1 30); do
  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    echo "新进程启动失败" >&2
    tail -n 80 runtime/infinitejudge.log >&2
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/tmp/infinitejudge-health.json; then
    cat /tmp/infinitejudge-health.json
    echo
    echo "更新成功：$TARGET"
    echo "新进程：$NEW_PID"
    echo "数据库：$DB_PATH（未同步、未覆盖）"
    exit 0
  fi
  sleep 1
done

tail -n 80 runtime/infinitejudge.log >&2
exit 1
REMOTE
chmod 700 "$REMOTE_RUNNER"

export IJ_DEPLOY_PASSWORD SERVER REMOTE_DIR PORT LOCAL_DIR REMOTE_RUNNER
cat > "$EXPECT_FILE" <<'EXPECT'
#!/usr/bin/expect -f
set timeout 1200
set password $env(IJ_DEPLOY_PASSWORD)
set server $env(SERVER)
set remote_dir $env(REMOTE_DIR)
set port $env(PORT)
set local_dir $env(LOCAL_DIR)
set runner $env(REMOTE_RUNNER)
set remote_runner "/tmp/infinitejudge-update-[pid].sh"

proc finish {password} {
  expect {
    -re "(?i)are you sure you want to continue connecting" { send "yes\r"; exp_continue }
    -re "(?i)password:" { send "$password\r"; exp_continue }
    timeout { puts stderr "操作超时"; exit 124 }
    eof
  }
  return [lindex [wait] 3]
}

spawn rsync -azc --delete --itemize-changes \
  --exclude .git/ --exclude node_modules/ --exclude dist/ --exclude runtime/ \
  --exclude data/ --exclude "*.db" --exclude "*.db-wal" --exclude "*.db-shm" \
  --exclude .DS_Store --exclude ios/ \
  "$local_dir/" "$server:$remote_dir/"
set code [finish $password]
if {$code != 0} { puts stderr "文件同步失败：$code"; exit $code }

spawn scp "$runner" "$server:$remote_runner"
set code [finish $password]
if {$code != 0} { puts stderr "部署程序上传失败：$code"; exit $code }

spawn ssh $server "chmod 700 $remote_runner && TARGET='$remote_dir' PORT='$port' $remote_runner; code=\$?; rm -f $remote_runner; exit \$code"
set code [finish $password]
if {$code != 0} { puts stderr "远程部署失败：$code"; exit $code }
EXPECT
chmod 700 "$EXPECT_FILE"

echo "开始比对并更新 ${SERVER}:${REMOTE_DIR}"
/usr/bin/expect "$EXPECT_FILE"
