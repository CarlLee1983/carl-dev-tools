# Git 工具集合

這個目錄包含各種 Git 相關的自動化工具，旨在簡化日常 Git 操作流程。

## 🛠️ 工具清單

### clean-branch.sh - 智慧分支清理工具

自動清理已合併到主要分支的功能性分支。預設只清理本地分支；遠端分支需明確加入 `--remote` 並輸入二次確認片語。

**功能特色：**
- 🔍 自動偵測主要分支（main/master/develop）
- 🎯 支援自訂掃描模式與額外保護分支規則
- 🛡️ 執行前檢查工作區是否乾淨，避免 checkout/pull 影響未提交變更
- 🌐 遠端清理預設停用，需 `--remote` 加上 `DELETE_REMOTE` 二次確認
- 🧪 支援 `DEVKIT_GIT_BIN` 指定 git binary，方便模擬與自動化測試
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

# 額外保護 release/* 分支
./git/clean-branch.sh --protect 'release/.*'

# 明確啟用遠端分支清理
./git/clean-branch.sh --remote

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

### release-tag.sh - 智慧版本標籤工具

智慧掃描現有標籤前綴，提供互動式版本遞增功能，自動生成語義化版本標籤。

**功能特色：**
- 🔍 自動掃描標籤軌道：純 SemVer（v1.2.3）與 prefix（release/v1.2.3）並列
- 🎯 互動式軌道選擇與版本遞增（patch / minor / major）
- 📊 支援語義化版本控制（major.minor.patch）
- 🌿 智慧分支檢查，可切換到主要分支進行操作
- 🔄 自動同步遠端標籤，避免重複標籤
- 🔒 SHA1 檢查，防止在同一 commit 重複建標籤
- 🛡️ 安全的工作目錄檢查和衝突檢測
- 🚀 可選的自動推送到遠端

**使用方式：**
```bash
# 互動式模式
./git/release-tag.sh

# 建立標籤並推送到遠端
./git/release-tag.sh --push

# 強制模式（跳過確認）
./git/release-tag.sh --force

# 顯示說明
./git/release-tag.sh --help
```

## 🔒 安全特性

- **受保護分支：** 自動跳過重要分支（master, main, develop, testing, staging, production），並可用 `--protect PATTERN` 增加保護規則
- **工作區檢查：** `clean-branch.sh` 在 fetch/checkout/pull 前會先確認沒有未提交變更
- **合併檢查：** 只處理確實已合併的分支（clean-branch.sh）
- **互動確認：** 顯示將要刪除的分支清單並要求確認
- **遠端雙重確認：** 遠端清理需明確使用 `--remote`，刪除前還需輸入 `DELETE_REMOTE`
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

ℹ️  遠端分支清理預設未啟用；如需清理遠端分支，請明確加入 --remote
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

### 版本標籤範例
```bash
$ ./git/release-tag.sh
🏷️  Git 智慧版本標籤工具

🌿 檢查分支狀態...
📍 當前分支：main
✅ 找到以下主要分支：
  1. main
  2. develop
✅ 當前已在主要分支上

🔄 獲取遠端最新標籤...
✅ 成功獲取遠端標籤

🔍 掃描專案版本軌道...
✅ 找到以下版本軌道：
  1. (無前綴) — 目前 v1.1.1
  2. release/ — 目前 release/v1.2.3

請選擇要操作的版本軌道：
請輸入編號 (1-2): 1
✅ 已選擇軌道：(無前綴)
📍 當前最新版本：v1.1.1

🔍 檢查 commit 狀態...
✅ 當前 commit (a1b2c3d4) 與最新標籤 v1.1.1 (e5f6g7h8) 不同，可以建立新標籤

請選擇版本遞增類型：
1. patch  - 修復版本 (1.1.1 → 1.1.2)
2. minor  - 功能版本 (1.1.1 → 1.2.0)
3. major  - 重大版本 (1.1.1 → 2.0.0)
請輸入編號 (1-3): 1
✅ 已選擇 patch 遞增：1.1.1 → 1.1.2

🔄 最終檢查遠端標籤狀態...

即將建立標籤：v1.1.2
確定要建立此標籤嗎？(y/N): y
是否要同時推送標籤到遠端？(y/N): y
✓ 將會推送標籤到遠端

✅ 成功建立標籤：v1.1.2
🚀 推送標籤到遠端...
✅ 成功推送標籤到遠端
🎉 版本標籤操作完成！
```

> 零 tag 的專案會先被詢問「是否要加上 prefix？(y/N)」，預設 N 走純 SemVer 並建立 `v0.0.1`；選 Y 則沿用舊流程提示輸入新前綴並建立 `<prefix>/v0.0.1`。

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
alias git-tag="~/scripts/git/release-tag.sh"

# 重新載入設定
source ~/.zshrc  # 或 source ~/.bashrc
```

### 設定執行權限
```bash
chmod +x ~/scripts/git/*.sh
```

---
**注意：** 使用前請先在測試環境中驗證，確保符合您的工作流程需求。
