# 開發工具腳本集合

這是一個按功能分類組織的實用腳本集合，旨在簡化日常開發和系統管理工作。

## 🚀 功能特色

- 📁 按功能分類組織，便於管理和擴展
- ✅ 自動偵測和智慧處理
- 🎨 彩色輸出介面，清楚易讀
- 🛡️ 安全的互動式確認機制
- 🔧 完整的錯誤處理和網路檢查
- ⚡ 支援強制模式和批次處理
- 📖 完整的說明文件

## 📂 目錄結構

```
DevTools/
├── README.md                 # 主要說明文件
├── devkit                    # 🆕 全域 CLI 工具
├── install.sh                # 🆕 DevKit 安裝腳本
├── bash-tools/git/           # Git 相關工具
│   ├── README.md            # Git 工具說明
│   ├── clean-branch.sh      # 分支清理工具
│   ├── sync-all.sh          # 分支同步工具
│   └── release-tag.sh       # 智慧版本標籤工具
├── bash-tools/docker/        # Docker 相關工具
│   ├── README.md            # Docker 工具說明
│   ├── doctor.sh            # Docker 健康檢查
│   └── clean.sh             # Docker 保守資源清理
├── node-tools/env/           # 環境檔案管理工具
└── src/utils/                # Node.js 共用工具
```

## 🚀 快速開始

### 使用 DevKit 全域工具

DevKit 是一個統一的 CLI 工具，讓您可以在任何地方輕鬆存取所有腳本功能。

```bash
# 安裝 DevKit 到系統（推薦）
./install.sh --system

# 或建立別名（簡單方式）
./install.sh --alias

# 查看所有可用工具
devkit

# 執行 Git 工具
devkit git:release-tag
devkit git:clean-branch
devkit git:sync-all

# 互動式選單
devkit -i
```

## 📦 工具分類

### 🛠️ DevKit CLI 工具

全域命令列介面，提供統一的工具管理和執行功能。

**主要功能：**
- 🔍 自動掃描和註冊所有腳本工具
- 📂 按分類組織和瀏覽工具
- 🎯 直接執行指定工具
- 🖥️ 互動式選單系統
- 🌐 全域安裝支援

**使用方式：**
```bash
# 顯示所有工具
devkit

# 顯示特定分類
devkit git

# 執行指定工具
devkit git:release-tag

# 互動式選單
devkit --interactive
```

### 🔧 Git 工具 (`git/`)

專門處理 Git 相關操作的自動化工具。

#### clean-branch.sh - 智慧分支清理工具
自動清理已合併到主要分支的分支，支援本地和遠端分支清理。

**功能特點：**
- 預設掃描所有已合併的分支（已合併的分支是安全的）
- 自動偵測主要分支（main、master、develop）
- 支援本地和遠端分支清理
- 互動式確認，避免誤刪
- 可自訂分支命名模式過濾

**使用方式：**
```bash
# 掃描所有已合併的分支（預設行為）
./bash-tools/git/clean-branch.sh

# 指定基礎分支
./bash-tools/git/clean-branch.sh develop

# 只掃描符合特定模式的分支
./bash-tools/git/clean-branch.sh --pattern 'bug-|issue-'

# 強制模式（跳過確認）
./bash-tools/git/clean-branch.sh --force

# 顯示詳細掃描過程
./bash-tools/git/clean-branch.sh --debug

# 顯示說明
./bash-tools/git/clean-branch.sh --help
```

#### sync-all.sh - 專案分支同步工具
自動同步專案中的所有指定分支，確保本地分支與遠端保持同步。

**使用方式：**
```bash
# 在專案目錄下執行
./bash-tools/git/sync-all.sh

# 或設定別名使用
alias git-sync="~/devkit/bash-tools/git/sync-all.sh"
git-sync
```

#### release-tag.sh - 智慧版本標籤工具
智慧掃描現有標籤前綴，提供互動式版本遞增功能，自動生成語義化版本標籤。

**主要功能：**
- 🌿 智慧分支檢查，可切換到主要分支進行操作
- 🔄 自動同步遠端標籤，避免重複標籤
- 🔒 SHA1 檢查，防止在同一 commit 重複建標籤
- 🎯 互動式前綴選擇和版本遞增

**使用方式：**
```bash
# 互動式模式
./bash-tools/git/release-tag.sh

# 建立標籤並推送到遠端
./bash-tools/git/release-tag.sh --push

# 或設定別名使用
alias git-tag="~/devkit/bash-tools/git/release-tag.sh"
git-tag
```

### 🐳 Docker 工具 (`docker/`)

針對 Docker daemon 的安全運維工具。第一版只提供 doctor 與 clean 兩支 Bash tool。

#### doctor.sh - Docker 健康狀態檢查
依序執行 `docker info` / `version` / `compose version` / `system df`，daemon 不可連線時 exit 1。

**使用方式：**

```bash
./bash-tools/docker/doctor.sh
```

#### clean.sh - Docker 保守資源清理
預設透過 `docker system prune --force` 清掉 stopped containers、unused images、unused networks、build cache（**不清 volumes**）。

**主要參數：**

- `--dry-run`：只列指令，不執行 prune
- `--force`：跳過 y/N 確認
- `--volumes`：同時清 volumes，**即使 `--force` 也要再輸入 `DELETE_DOCKER_VOLUMES` 片語**

**使用方式：**

```bash
./bash-tools/docker/clean.sh --dry-run
./bash-tools/docker/clean.sh --force
./bash-tools/docker/clean.sh --volumes --force
```

> ⚠️ 任何含 `--volumes` 的清理都會永久刪除未使用的資料卷；片語錯誤時腳本不會執行任何 prune 指令。

### 🚀 未來擴展計劃

- **`dev/`** - 開發環境設定、程式碼品質檢查、測試自動化
- **`system/`** - 系統清理、效能監控、日誌管理
- **`deploy/`** - 自動部署、環境管理、容器化工具
- **`utils/`** - 檔案處理、文字處理、資料轉換等通用工具

## 🛠️ 安裝方式

### 方法一：一鍵遠端安裝（最推薦）

```bash
curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash
```

預設安裝到 `~/.devkit`，並在 `~/.local/bin/devkit` 建立 symlink。可用環境變數覆寫：

```bash
DEVKIT_DIR=/tmp/devkit-test \
  curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash
```

| 環境變數 | 預設 | 作用 |
| --- | --- | --- |
| `DEVKIT_DIR` | `$HOME/.devkit` | 安裝目錄 |
| `DEVKIT_REF` | `main` | 要 clone 的 git ref |
| `DEVKIT_REPO` | `https://github.com/CarlLee1983/carl-dev-tools.git` | 來源 repo |

### 方法二：先 clone 再執行 install.sh（適合想看原始碼）

```bash
git clone https://github.com/CarlLee1983/carl-dev-tools.git ~/.devkit
cd ~/.devkit
./install.sh              # 互動式選單，預設別名安裝
```

### 方法三：指定安裝方式

```bash
./install.sh --alias      # 建立 shell 別名（最穩定）
./install.sh --user       # symlink 到 ~/.local/bin
./install.sh --system     # symlink 到 /usr/local/bin（需 sudo）
./install.sh --user --force --non-interactive   # 全程零互動（bootstrap 內部用）
```

### 方法四：手動別名（進階）

```bash
echo 'alias devkit="~/your/path/to/devkit"' >> ~/.zshrc
source ~/.zshrc
```

## 🔄 更新／體檢／移除

bootstrap 安裝後，可從任何目錄反向操作：

```bash
devkit --update      # git pull --ff-only（拒絕 merge，避免本地誤動產生 merge commit）
devkit --doctor      # 體檢：bash / git / Node.js / pnpm / PATH / symlink
devkit --uninstall   # 移除 symlink + alias；不代刪安裝目錄（會印 rm -rf 指令）
```

`devkit --doctor` 的 exit code：含任一「錯誤」→ 1；只有「OK / 警告」→ 0，可串進 CI 健康檢查。

## ⚙️ 系統需求

- **作業系統：** macOS / Linux / Windows (WSL)
- **Shell：** Bash 4.0+
- **Node.js：** >=18.0.0 <24.0.0（推薦 20.x 或 22.x LTS）
- **pnpm：** 8.0+
- **Git：** 2.0+
- **網路連線：** 遠端操作需要

### Node.js 版本支援

| 版本 | 支援狀態 | 備註 |
|------|---------|------|
| 18.x LTS | ✅ 完全支援 | 推薦 |
| 20.x LTS | ✅ 完全支援 | 推薦 |
| 21.x | ⚠️ 部分支援 | 可能有問題 |
| 22.x LTS | ✅ 完全支援 | 最新推薦版本 |
| 23.x | ⚠️ 可執行但未完整測試 | 非 LTS，不建議作為主要版本 |
| 24.x+ | ❌ 不支援 | 超出目前 engines 範圍 |

### 🤖 自動版本管理
DevKit 支援自動 Node.js 版本切換，確保工具在正確版本下運行：
- 執行前自動切換到要求版本
- 執行後自動切換回原始版本
- 支援 nvm 和 n 版本管理工具

如需升級 Node.js，請參考 [UPGRADE.md](UPGRADE.md)

## 🔒 安全特性

- **受保護分支：** 自動跳過重要分支（master, main, develop, testing, staging, production）
- **合併檢查：** 只處理確實已合併的分支
- **互動確認：** 顯示將要刪除的分支清單並要求確認
- **網路檢查：** 自動檢測網路狀態，離線時跳過遠端操作
- **錯誤處理：** 完整的錯誤捕獲和友善的錯誤訊息
- **Docker 清理雙重確認：** `clean.sh --volumes` 一律需要輸入 `DELETE_DOCKER_VOLUMES` 片語，否則不執行任何 prune

## 📋 使用範例

### 清理分支範例
```bash
$ ./bash-tools/git/clean-branch.sh
🚀 開始 Git 分支清理程序
🔍 偵測主要分支...
✓ 偵測到主要分支: main
🌐 檢查網路連線...
✓ 網路連線正常

🏠 處理本地分支
🔍 搜尋所有已合併的本地分支...
📋 將要刪除的本地分支：
  ✗ feature/user-login
  ✗ fix/header-bug
  ✗ bug-123
  ✗ issue-456
確定要刪除這些分支嗎？(y/N): y
```

### 同步分支範例
```bash
$ ./git-sync-all.sh
==========================================
通用 Git 同步腳本開始執行...
==========================================

🔄 正在同步專案: /path/to/project
📍 當前分支: develop
⬇️  正在拉取最新變更...
✅ 同步完成
```

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

### Commit 訊息格式
```
<type>: [<scope>] <subject>

<body>

<footer>
```

**Type 類型：**
- `feat`: 新增功能
- `fix`: Bug 修復
- `docs`: 文檔更新
- `style`: 程式碼格式調整
- `refactor`: 程式碼重構
- `test`: 測試相關
- `chore`: 維護工作

## 📄 授權條款

MIT License - 詳見 [LICENSE](LICENSE) 檔案

## 📞 聯絡資訊

如有問題或建議，歡迎開啟 Issue 討論。

---
**注意：** 使用前請先在測試環境中驗證，確保符合您的工作流程需求。
