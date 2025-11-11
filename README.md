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
├── git/                      # Git 相關工具
│   ├── README.md            # Git 工具說明
│   ├── clean-branch.sh      # 分支清理工具
│   └── sync-all.sh          # 分支同步工具
├── dev/                      # 開發工具（未來擴展）
├── system/                   # 系統管理工具（未來擴展）
├── deploy/                   # 部署相關工具（未來擴展）
└── utils/                    # 通用工具（未來擴展）
```

## 📦 工具分類

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

### 🚀 未來擴展計劃

- **`dev/`** - 開發環境設定、程式碼品質檢查、測試自動化
- **`system/`** - 系統清理、效能監控、日誌管理
- **`deploy/`** - 自動部署、環境管理、容器化工具
- **`utils/`** - 檔案處理、文字處理、資料轉換等通用工具

## 🛠️ 安裝方式

### 方法一：直接下載
```bash
# 下載到本地 scripts 目錄
git clone <repository-url> ~/scripts
cd ~/scripts
chmod +x *.sh
```

### 方法二：設定別名
```bash
# 加入到 ~/.zshrc 或 ~/.bashrc
alias git-clean="~/scripts/git/clean-branch.sh"
alias git-sync="~/scripts/git/sync-all.sh"

# 重新載入設定
source ~/.zshrc  # 或 source ~/.bashrc
```

## ⚙️ 系統需求

- **作業系統：** macOS / Linux
- **Shell：** Bash 4.0+
- **Git：** 2.0+
- **網路連線：** 遠端操作需要

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
