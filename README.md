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
scripts/
├── README.md                 # 主要說明文件
├── devkit                    # 🆕 全域 CLI 工具
├── install.sh                # 🆕 DevKit 安裝腳本
├── git/                      # Git 相關工具
│   ├── README.md            # Git 工具說明
│   ├── clean-branch.sh      # 分支清理工具
│   ├── sync-all.sh          # 分支同步工具
│   └── release-tag.sh       # 智慧版本標籤工具
├── dev/                      # 開發工具（未來擴展）
├── system/                   # 系統管理工具（未來擴展）
├── deploy/                   # 部署相關工具（未來擴展）
└── utils/                    # 通用工具（未來擴展）
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
自動清理已合併到主要分支的功能性分支，支援本地和遠端分支清理。

**支援的分支類型：**
- `feature/` - 功能分支
- `fix/` - 修復分支  
- `feat/` - 特性分支
- `test/` - 測試分支
- `hotfix/` - 熱修復分支
- `bugfix/` - 錯誤修復分支
- `chore/` - 維護分支

**使用方式：**
```bash
# 自動偵測主要分支並互動式確認
./git/clean-branch.sh

# 指定基礎分支
./git/clean-branch.sh develop

# 強制模式（跳過確認）
./git/clean-branch.sh --force

# 顯示說明
./git/clean-branch.sh --help
```

#### sync-all.sh - 專案分支同步工具
自動同步專案中的所有指定分支，確保本地分支與遠端保持同步。

**使用方式：**
```bash
# 在專案目錄下執行
./git/sync-all.sh

# 或設定別名使用
alias git-sync="~/scripts/git/sync-all.sh"
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
./git/release-tag.sh

# 建立標籤並推送到遠端
./git/release-tag.sh --push

# 或設定別名使用
alias git-tag="~/scripts/git/release-tag.sh"
git-tag
```

### 🚀 未來擴展計劃

- **`dev/`** - 開發環境設定、程式碼品質檢查、測試自動化
- **`system/`** - 系統清理、效能監控、日誌管理
- **`deploy/`** - 自動部署、環境管理、容器化工具
- **`utils/`** - 檔案處理、文字處理、資料轉換等通用工具

## 🛠️ 安裝方式

### 方法一：一鍵安裝（最推薦）
```bash
# 下載專案到任意位置（不限於 ~/scripts）
git clone <repository-url> ~/devkit
cd ~/devkit

# 執行安裝腳本（會引導互動式選擇，預設使用別名方式）
./install.sh

# 重新載入 shell 設定
source ~/.zshrc  # 或 source ~/.bashrc

# 測試安裝
devkit --help
```

### 方法二：指定安裝方式
```bash
# 建立別名（推薦 - 最穩定）
./install.sh --alias
source ~/.zshrc  # 或 source ~/.bashrc

# 安裝到使用者目錄（使用符號連結）
./install.sh --user

# 安裝到系統（需要 sudo，使用符號連結）
./install.sh --system
```

### 方法三：手動設定別名
```bash
# 加入到 ~/.zshrc 或 ~/.bashrc
alias devkit="~/你的專案路徑/devkit"

# 重新載入設定
source ~/.zshrc  # 或 source ~/.bashrc
```

**重要提示：** 
- 推薦使用別名或符號連結方式，確保 devkit 能正確找到所有工具腳本
- 專案可以安裝在任何位置，不限於 `~/scripts` 目錄

## ⚙️ 系統需求

- **作業系統：** macOS / Linux / Windows (WSL)
- **Shell：** Bash 4.0+
- **Node.js：** 18.0+ (推薦 18.x 或 20.x LTS)
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
| 23.x+ | ❌ 未測試 | 不建議使用 |

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

## 📋 使用範例

### 清理分支範例
```bash
$ ./git-clean-branch.sh
🚀 開始 Git 分支清理程序
🔍 偵測主要分支...
✓ 偵測到主要分支: main
🌐 檢查網路連線...
✓ 網路連線正常

🏠 處理本地分支
🔍 搜尋已合併的本地分支...
📋 將要刪除的本地分支：
  ✗ feature/user-login
  ✗ fix/header-bug
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
