# Infinte Judge

Project repository: <https://github.com/BrightWeb-Dev-Team/InfiniteJudge>

## 许可证

本项目采用自定义的 InfiniteJudge 部署与署名许可协议。允许部署、运行和修改，
但所有网页必须保留可见且可点击的页脚版权信息
`Powered by ©2026 BrightWeb Dev Team`。详细条款请阅读 [LICENSE](LICENSE)。

## 中文更新服务协议

点击“一键更新”后，InfiniteJudge 向 `https://update.brightweb.top/oj`
发送 `POST` 请求，并通过 JSON 提交当前版本号：

```json
{
  "product": "InfiniteJudge",
  "version": "1.0.0",
  "platform": "darwin",
  "arch": "arm64"
}
```

`platform` 和 `arch` 由运行 InfiniteJudge 的 Node.js 环境自动提供。例如
macOS Apple Silicon 为 `darwin` / `arm64`，Linux x64 为 `linux` / `x64`。

如果当前已经是最新版本，更新服务器返回 HTTP `200` 和
`{"update":false}`（也兼容 `{"latest":true}` 或返回与当前版本相同的
`version`）。
如果存在新版本，更新服务器返回 HTTP `200` 和以下 JSON：

```json
{
  "version": "1.1.0",
  "url": "https://update.brightweb.top/oj/packages/infinitejudge-1.1.0.tar.gz",
  "sha256": "更新包的64位十六进制SHA-256值"
}
```

更新服务器下发的是一个 `tar.gz` 源码更新包。压缩包可以带一层顶级目录，
但程序根目录必须包含 `package.json`，并且其中的 `version` 必须和清单中的
`version` 完全一致。

更新包应当包含 `server/`、`src/`、`plugins/`、`package.json`、
`package-lock.json`、`vite.config.ts`、`tsconfig.json`、部署脚本等程序文件。
更新包不能包含 `data/`、数据库、用户上传文件、`.env`、`.git` 和
`node_modules`。客户端会先校验 SHA-256，再覆盖程序文件，并保留本机数据，
最后执行 `npm install` 和 `npm run build`。

Cross-platform online judge with a Hydro-style plugin compatibility layer and
native process sandbox. It runs without Docker on macOS, Windows and Linux.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The API and judge worker listen on port 3001.

## One-click deployment (macOS / Linux)

```bash
chmod +x deploy.sh stop.sh
./deploy.sh
```

Open <http://localhost:3001>. On a new database, the first-run setup page asks
for the brand, logo, service URL and administrator account. Email verification
is optional and disabled by default. Stop the service with `./stop.sh`.

## Sandbox backends

- macOS: `sandbox-exec` denies network access and restricts file writes to the
  per-submission temporary directory. Timeouts terminate the process group.
- Windows: isolated working directory, restricted environment and process-tree
  termination through `taskkill /T`. For stronger isolation, configure an
  external runner with `IJ_SANDBOX_COMMAND` backed by Windows Sandbox or a
  restricted service account.
- Linux: isolated working directory, restricted environment and process-group
  termination. Set `IJ_SANDBOX_COMMAND` to a namespace/cgroup sandbox binary
  for production deployments.

The host needs the compilers it intends to expose (`g++`, `python3`/`python`,
and `javac`/`java`). The API reports the active backend at `/api/health`.

## Hydro-style plugins

Place ESM plugins in `plugins/<plugin-name>` with a `package.json` and an entry
exporting `apply(ctx)`. The compatibility context currently implements:

- `ctx.Route(name, path, Handler)`
- `ctx.on()` and `ctx.emit()`
- `ctx.injectUI()`
- `ctx.interval()`
- `ctx.collection()` for basic plugin storage

This targets Hydro's public plugin programming model. Plugins that import
Hydro's private models, Nunjucks renderer, MongoDB-specific cursors or internal
services require an adapter because Infinte Judge uses its own data model.
