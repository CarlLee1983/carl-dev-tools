# Git 工具集合

這個目錄包含各種 Git 相關的自動化工具，旨在簡化日常 Git 操作流程。

## 🛠️ 工具清單

### clean-branch.sh - 智慧分支清理工具

自動清理已合併到主要分支的功能性分支，支援本地和遠端分支清理。

**功能特色：**
- 🔍 自動偵測主要分支（main/master/develop）
- 🎯 智慧過濾功能分支類型
- 🛡️ 安全的互動式確認機制
- 🌐 網路狀態檢查
- ⚡ 支援強制模式

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

### sync-all.sh - 專案分支同步工具

自動同步專案中的所有指定分支，確保本地分支與遠端保持同步。

**功能特色：**
- 🔄 自動同步多個分支
- 📍 智慧檢測當前分支
- 🎨 彩色輸出介面
- 🛡️ 安全的錯誤處理

**使用方式：**
```bash
# 在專案目錄下執行
./git/sync-all.sh

# 或設定別名使用
alias git-sync="~/scripts/git/sync-all.sh"
git-sync
```

## 🔒 安全特性

- **受保護分支：** 自動跳過重要分支（master, main, develop, testing, staging, production）
- **合併檢查：** 只處理確實已合併的分支（clean-branch.sh）
- **互動確認：** 顯示將要刪除的分支清單並要求確認
- **網路檢查：** 自動檢測網路狀態，離線時跳過遠端操作
- **錯誤處理：** 完整的錯誤捕獲和友善的錯誤訊息

## 📋 使用範例

### 分支清理範例
```bash
$ ./git/clean-branch.sh
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

### 分支同步範例
```bash
$ ./git/sync-all.sh
==========================================
通用 Git 同步腳本開始執行...
==========================================

🔄 正在同步專案: /path/to/project
📍 當前分支: develop
⬇️  正在拉取最新變更...
✅ 同步完成
```

## ⚙️ 系統需求

- **作業系統：** macOS / Linux
- **Shell：** Bash 4.0+
- **Git：** 2.0+
- **網路連線：** 遠端操作需要

## 🚀 快速設定

### 設定別名
```bash
# 加入到 ~/.zshrc 或 ~/.bashrc
alias git-clean="~/scripts/git/clean-branch.sh"
alias git-sync="~/scripts/git/sync-all.sh"

# 重新載入設定
source ~/.zshrc  # 或 source ~/.bashrc
```

### 設定執行權限
```bash
chmod +x ~/scripts/git/*.sh
```

---
**注意：** 使用前請先在測試環境中驗證，確保符合您的工作流程需求。
