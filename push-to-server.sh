#!/usr/bin/env bash
set -euo pipefail

SERVER="root@8.210.166.25"
REMOTE_DIR="/opt/infinitejudge"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== 同步文件到服务器 ==="

# 排除不需要的文件
rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude 'runtime' \
  --exclude 'dist' \
  --exclude '.DS_Store' \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

echo "=== 在服务器上构建和部署 ==="
ssh "$SERVER" "cd $REMOTE_DIR && npm ci --no-audit --no-fund && npm run build"

echo "=== 重启服务 ==="
ssh "$SERVER" "cd $REMOTE_DIR && bash deploy.sh"

echo "=== 部署完成 ==="
