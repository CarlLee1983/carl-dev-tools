# Docker Tools 第一版設計

## 目標

新增 `docker` 工具類別，第一版提供兩個安全、可測試的 Bash tools：

- `devkit docker:doctor`：檢查 Docker 基本健康狀態。
- `devkit docker:clean`：保守清理 Docker 未使用資源。

此版本只做 Docker 類別的必要新增，不改 DevKit dispatcher 架構；既有自動掃描機制應能列出 `bash-tools/docker/*.sh`。

## 非目標

- 不做 Docker Desktop 自動啟動或自動修復。
- 不做 Compose 專案操作，例如 `up`、`down`、`logs`。
- 不清理 volumes，除非使用者明確傳入 `--volumes` 並完成二次確認。
- 不新增 Node.js docker tool；第一版維持 Bash tool。

## 使用介面

```bash
./devkit docker
./devkit docker:doctor
./devkit docker:clean
./devkit docker:clean --dry-run
./devkit docker:clean --force
./devkit docker:clean --volumes
```

## 檔案結構

```text
bash-tools/docker/
├── clean.sh
└── doctor.sh

tests/
└── docker-tools.test.js
```

兩支 Bash script 都應在檔頭提供 `# DEVKIT_DESC: ...`，讓 dispatcher 自動顯示工具說明。

## `docker:doctor` 行為

`doctor.sh` 執行基本健康檢查：

1. 檢查 `docker` 指令是否存在。
2. 執行 `docker info`，確認 daemon 可連線。
3. 執行 `docker version`，輸出 client/server 版本摘要。
4. 執行 `docker compose version`，確認 Compose v2 可用。
5. 執行 `docker system df`，輸出磁碟用量摘要。

Exit code：

- 全部通過：`0`
- 任一必要檢查失敗：`1`

輸出語言沿用專案慣例，使用繁體中文。

## `docker:clean` 行為

`clean.sh` 採保守策略。

預設清理 Docker system prune 可安全涵蓋的未使用資源：

- stopped containers
- dangling / unused images（依 Docker `system prune` 預設行為）
- unused networks
- build cache

預設不清理 volumes。

### 參數

- `--dry-run`：只列出將執行的清理指令，不執行 prune。
- `--force`：跳過一般清理確認。
- `--volumes`：要求額外二次確認後，才把 volumes 納入清理。
- `--help` / `-h`：顯示說明並 exit `0`。

### Volumes 安全策略

即使指定 `--force`，只要同時指定 `--volumes`，仍必須輸入固定確認片語：

```text
DELETE_DOCKER_VOLUMES
```

未輸入正確片語時，腳本不得執行含 `--volumes` 的 prune 指令，並以非零 exit code 結束或取消該危險操作。

### Docker 可用性

執行清理前先檢查：

1. `docker` 指令存在。
2. `docker info` 可連線 daemon。

任一失敗則 exit `1`。

## 可測試性設計

兩支 script 使用可注入 Docker binary：

```bash
DOCKER_BIN="${DEVKIT_DOCKER_BIN:-docker}"
```

測試透過 fake docker binary 記錄參數與模擬輸出，不依賴本機 Docker daemon。

測試檔：`tests/docker-tools.test.js`

必要測試：

1. `doctor` 依序呼叫 `info`、`version`、`compose version`、`system df`。
2. `doctor` 在 `docker info` 失敗時 exit `1`。
3. `clean --dry-run` 不呼叫 prune，只輸出預計指令。
4. `clean --force` 呼叫 `docker system prune --force`，且不含 `--volumes`。
5. `clean --volumes --force` 未輸入確認片語時，不呼叫含 `--volumes` 的 prune。
6. `clean --volumes --force` 輸入 `DELETE_DOCKER_VOLUMES` 後，才呼叫 `docker system prune --force --volumes`。

## 文件更新

更新：

- `README.md`：新增 Docker tools 類別、使用範例、安全策略摘要。
- `bash-tools/docker/README.md`：說明 `clean` / `doctor` 的功能、參數與 volumes 保護。

## 成功標準

- `./devkit docker` 能列出 `clean` 與 `doctor`。
- `./devkit docker:doctor` 在 Docker 可用時完成基本檢查。
- `./devkit docker:clean` 預設不清 volumes。
- `--volumes` 一律需要固定片語確認。
- 新增測試通過，既有測試不回歸。
- `pnpm lint` 通過。
