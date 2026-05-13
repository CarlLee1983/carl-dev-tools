# Docker 工具集合

這個目錄包含 Docker 相關的安全自動化工具，目前提供兩支 Bash tool，預設保守、可注入測試。

## 🛠️ 工具清單

### doctor.sh - Docker 健康狀態檢查

依序執行下列檢查，輸出版本與用量摘要，協助快速判斷 daemon 是否可用：

1. `docker info`：daemon 連線檢查（**必要**，失敗即 exit 1）
2. `docker version`：client / server 版本
3. `docker compose version`：Compose v2 可用性
4. `docker system df`：磁碟用量摘要

**Exit Code：**

- `0`：全部必要檢查通過
- `1`：找不到 docker 指令，或 `docker info` 失敗

**使用方式：**

```bash
./bash-tools/docker/doctor.sh
./bash-tools/docker/doctor.sh --help
```

### clean.sh - Docker 保守資源清理

預設透過 `docker system prune --force` 清掉以下 Docker 官方視為安全的未使用資源：

- 已停止的 containers
- dangling / unused images
- unused networks
- build cache

**預設不清 volumes。**

**參數：**

| 參數 | 行為 |
| --- | --- |
| `--dry-run` | 只列出預計指令，不執行 prune |
| `--force` | 跳過一般 y/N 確認 |
| `--volumes` | 同時清理 volumes（須輸入 `DELETE_DOCKER_VOLUMES` 二次確認，**即使 `--force` 也擋**） |
| `--help`, `-h` | 顯示說明 |

**Volumes 安全策略：**

即使使用 `--force`，只要同時加上 `--volumes`，腳本仍會要求互動輸入：

```
DELETE_DOCKER_VOLUMES
```

未輸入正確片語時，**腳本不會執行任何 prune 指令**，並以非零 exit code 結束。

**使用方式：**

```bash
# 預設互動式清理（會 y/N 確認）
./bash-tools/docker/clean.sh

# 只看會跑哪些指令
./bash-tools/docker/clean.sh --dry-run

# 跳過 y/N，但不清 volumes
./bash-tools/docker/clean.sh --force

# 連 volumes 一起清（需手動輸入片語）
./bash-tools/docker/clean.sh --volumes --force
```

## 🧪 可測試性

兩支腳本都讀取可注入的 docker binary：

```bash
DOCKER_BIN="${DEVKIT_DOCKER_BIN:-docker}"
```

`tests/docker-tools.test.js` 透過 fake docker binary（暫存目錄）記錄參數與模擬退出碼，**不依賴本機 Docker daemon**。

## 🔒 安全特性

- 預設保守：不刪 volumes、不操作 Compose 專案
- 二次確認片語擋 `--volumes`，避免「打了 `--force` 就完蛋」
- 前置 `docker info` 檢查；daemon 不可連線時不進入清理流程
- 所有指令支援 `--help` 與 source guard，方便測試與單獨呼叫
