#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${IJ_JUDGE_INSTALL_DIR:-$HOME/.infinitejudge/judge}"
CONFIG_DIR="${IJ_JUDGE_CONFIG_DIR:-$HOME/.config/hydro}"
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

command -v node >/dev/null || { echo "需要先安装 Node.js 18 或更高版本" >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || { echo "Node.js 版本过低，需要 18 或更高版本" >&2; exit 1; }

cp "$ROOT_DIR/server/judge.js" "$INSTALL_DIR/judge.js"
cp "$ROOT_DIR/server/remote-worker.js" "$INSTALL_DIR/remote-worker.js"
cp "$ROOT_DIR/server/sandbox.js" "$INSTALL_DIR/sandbox.js"
cp "$ROOT_DIR/server/db.js" "$INSTALL_DIR/db.js"
cp "$ROOT_DIR/package.json" "$INSTALL_DIR/package.json"
cat > "$CONFIG_DIR/judge.yaml.example" <<'EOF'
hosts:
  judge-01:
    type: InfinityServer
    server_url: http://127.0.0.1:4001/
    uname: judge
    password: change-me
    detail: true
EOF
cat > "$INSTALL_DIR/start-judge" <<EOF
#!/usr/bin/env bash
set -a
[ -f "$CONFIG_DIR/judge.env" ] && . "$CONFIG_DIR/judge.env"
set +a
exec node "$INSTALL_DIR/remote-worker.js"
EOF
chmod +x "$INSTALL_DIR/start-judge"
echo "独立评测机已安装到：$INSTALL_DIR"
echo "复制配置：cp '$CONFIG_DIR/judge.env.example' '$CONFIG_DIR/judge.env'"
echo "启动评测机：'$INSTALL_DIR/start-judge'"
