# DevKit Install UX Design Spec

**Date:** 2026-05-13
**Status:** Approved by user; ready for writing-plans

## Background

DevKit 目前的安裝流程要求使用者先 `git clone` 整個 repo，再跑 `./install.sh`。痛點：

- 多一個 clone 步驟，「我只想用工具」的使用者門檻偏高
- `install.sh` 視覺風格停留在舊 emoji 版（🚀 ✅ ❌ ⚠️ 💡 🎉），與最近 polish 過的 `devkit` dispatcher 不一致
- 安裝後的「更新／移除／體檢」沒有便捷入口，使用者需記得安裝目錄並手動跑指令
- 沒有自動化測試保護 `install.sh` 的輸出契約，回退風險高

## Goal

提供 `curl | bash` 一行安裝管道、補上 `devkit --update / --doctor / --uninstall` 三個生命週期子命令、把 `install.sh` 對齊新 devkit UX 風格、並用 Node smoke tests 鎖死契約。

## Non-Goals

- 不做 Homebrew tap、npm 全域套件、GitHub Release auto-build（未來題目）
- 不改 devkit dispatch / discovery 主邏輯
- 不改 `bash-tools/` 與 `node-tools/` 內任何工具
- 不抽共用 lib（兩處 `print_error` 直接內聯複製，< 15 行）

---

## 1. 架構與職責切分

三層獨立元件，可分別測試：

```
使用者
  │  curl -fsSL …/bootstrap.sh | bash
  ▼
bootstrap.sh ────── 遠端入口（repo 根，curl 抓得到）
  │ 1. 環境檢查（bash、git）
  │ 2. 決定安裝目錄（DEVKIT_DIR / 預設 ~/.devkit）
  │ 3. git clone（或偵測已存在 → 路由到 update）
  │ 4. exec "$DEVKIT_DIR/install.sh" --user --force --non-interactive
  ▼
install.sh ──────── 本地安裝邏輯（仍可單獨 ./install.sh）
  │ 1. PATH 接線（symlink 到 ~/.local/bin）
  │ 2. 印出 next-step（source rc / 補 PATH 提示）
  │ 3. 對齊新 devkit 風格
  ▼
devkit (dispatcher) ── 既有檔，加三個子命令
  ├ --update     git -C "$SCRIPT_DIR" pull --ff-only
  ├ --doctor     bash / Node / pnpm / PATH / symlink / git work tree 體檢
  └ --uninstall  反向：刪 symlink、提示 rm -rf "$SCRIPT_DIR"
```

**設計原則：**

- `bootstrap.sh` **不重複** `install.sh` 的 PATH/symlink 邏輯，只負責「本地拿不到的事」（拉檔）。`install.sh` 是「安裝最後一哩」的單一真相來源。
- `install.sh` 補 `--non-interactive` 旗標；本地互動模式行為不變。
- 子命令用 `$SCRIPT_DIR` 自動定位（dispatcher 已有機制），不依賴 `~/.devkit` 字面，支援 `DEVKIT_DIR` 覆寫。

---

## 2. `bootstrap.sh` 規格

**檔案位置：** `bootstrap.sh`（repo 根，與 `install.sh` 平行）

**對外 URL：** `https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh`

**輸入介面：**

| 來源 | 名稱 | 預設 | 作用 |
| --- | --- | --- | --- |
| 環境變數 | `DEVKIT_DIR` | `$HOME/.devkit` | 安裝目錄 |
| 環境變數 | `DEVKIT_REF` | `main` | 要 clone 的 git ref |
| 環境變數 | `DEVKIT_REPO` | `https://github.com/CarlLee1983/carl-dev-tools.git` | 來源 repo |
| 旗標 | `--update` | — | 顯式進更新模式（已安裝時為預設） |
| 旗標 | `--help` | — | 顯示說明 |

旗標走 `curl … | bash -s -- --update` 傳遞。

**核心流程：**

```
1. set -euo pipefail
2. 環境檢查：
     - bash 3.2+
     - git 存在；缺則 print_error "需要 git" 退出 1
3. 解析 DEVKIT_DIR / DEVKIT_REF / DEVKIT_REPO
4. 偵測 DEVKIT_DIR 狀態：
     a. 不存在 → fresh install：git clone --depth=1 ... "$DEVKIT_DIR"
     b. 存在 + git work tree + remote 對 → update：git -C ... pull --ff-only
     c. 存在 + git work tree + remote 不同 → 報錯，請使用者改 DEVKIT_DIR 或手動處理
     d. 存在但非 git work tree → 報錯，避免覆蓋
5. exec "$DEVKIT_DIR/install.sh" --user --force --non-interactive
```

**輸出契約（normal path，無 emoji，cyan section heading）：**

```
DevKit 安裝精靈

步驟 1/3  檢查環境
  bash 3.2.57
  git 2.45.0
步驟 2/3  下載 DevKit
  clone github.com/CarlLee1983/carl-dev-tools → /Users/carl/.devkit
步驟 3/3  本地安裝
  （以下承接 install.sh 輸出）
```

**設計取捨：**

- `--depth=1` shallow clone 換速度。`devkit --update` 仍能 `git pull --ff-only`；要看歷史得 `git fetch --unshallow`。
- 狀態 4c / 4d **不自動修復**，避免誤刪使用者既有檔。

---

## 3. `install.sh` 改造

主結構保留，三類變更：

### 3.1 新增 `--non-interactive` 旗標

```bash
--non-interactive)
    NON_INTERACTIVE=true
    FORCE_INSTALL=true   # 隱含 --force（無 TTY 無法回 y/N）
    shift
    ;;
```

影響的互動點：

| 位置 | 互動行為 | `--non-interactive` 行為 |
| --- | --- | --- |
| `install_system` 檔案已存在 | 問 y/N | 直接覆蓋（被 `--force` 涵蓋） |
| `install_user` 檔案已存在 | 問 y/N | 直接覆蓋 |
| `install_alias` 別名已存在 | 問 y/N | 直接更新 |
| `interactive_install` 主選單 | 互動選擇 | 不會走到（`INSTALL_METHOD` 已指定） |

bootstrap 永遠帶 `--user --force --non-interactive`，全程零互動。本地 `./install.sh` 不帶旗標時行為不變。

### 3.2 對齊 devkit 新風格（整支）

| 既有 | 改成 |
| --- | --- |
| `🔍 檢查系統環境...` | `檢查系統環境`（cyan section heading） |
| `✅ 偵測到 macOS` | `  macOS`（縮排兩格、無 emoji） |
| `🚀 安裝到系統目錄：...` | `安裝到 /usr/local/bin`（cyan heading） |
| `⚠️  設定 devkit 執行權限...` | `提示：設定 devkit 執行權限` |
| `❌ ...` 錯誤 | `print_error "..."` → stderr、紅色 `錯誤：` 前綴 |
| `🎉 DevKit 系統安裝完成！` | `DevKit 安裝完成`（bold） |
| `💡 測試安裝：` 區塊 | `下一步` cyan section |

新增的 `print_error` 與顏色變數從 `devkit` 內聯複製（兩個檔約 7 行），不抽函式庫。

### 3.3 `--user` PATH 提示打磨

既有：

```
⚠️  ~/.local/bin 不在 PATH 中
💡 請將以下內容加入到 ~/.zshrc 或 ~/.bashrc：
export PATH="$HOME/.local/bin:$PATH"
```

改成偵測 `$SHELL` 給針對性可貼指令：

```
下一步
  ~/.local/bin 不在 PATH 中，請執行：
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
    source ~/.zshrc
```

bash 使用者印 `~/.bashrc`。

---

## 4. devkit dispatcher 三個新子命令

加在 `main` 的 case 解析，與 `--help` / `--version` / `--interactive` 同層。所有子命令吃 `$SCRIPT_DIR` 自動定位。

### 4.1 `devkit --update`

```bash
update_devkit() {
    if [ ! -d "$SCRIPT_DIR/.git" ]; then
        print_error "DevKit 安裝目錄不是 git 倉庫：$SCRIPT_DIR"
        echo "  此情境通常代表手動下載 tarball，請改為遠端重裝：" >&2
        echo "  curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash" >&2
        return 1
    fi

    echo -e "${CYAN}更新 DevKit${NC}"
    local before after
    before=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)
    if ! git -C "$SCRIPT_DIR" pull --ff-only; then
        print_error "更新失敗，請檢查本地是否有未提交變更或衝突"
        return 1
    fi
    after=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)

    if [ "$before" = "$after" ]; then
        echo "  已是最新版本（$after）"
    else
        echo "  $before → $after"
    fi
}
```

`--ff-only` 拒絕 merge，避免本地誤改後產生 merge commit。

### 4.2 `devkit --doctor`

逐項檢查並用 `OK` / `警告` / `錯誤` 標籤（純文字，無 emoji）：

```
DevKit 體檢

bash
  OK    bash 3.2.57

git
  OK    git 2.45.0
  OK    $SCRIPT_DIR 是 git 倉庫（commit a8804f2 on main）

Node.js
  OK    Node v20.11.0（>=18 <24）
  警告  Node v23.x 未經完整測試（仍可執行）
  錯誤  Node v17.x 不支援，請升級至 v18 LTS

pnpm
  OK    pnpm 8.10.0
  錯誤  pnpm 未安裝，請執行：corepack enable && corepack prepare pnpm@8 --activate

PATH
  OK    ~/.local/bin/devkit → $SCRIPT_DIR/devkit
  錯誤  ~/.local/bin 不在 PATH，請執行：
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc

結果
  3 項通過，1 項警告，0 項錯誤
```

**exit code 規則：** 含任一「錯誤」→ exit 1；只有「OK」/「警告」→ exit 0。

### 4.3 `devkit --uninstall`

```bash
uninstall_devkit() {
    echo -e "${CYAN}移除 DevKit${NC}"

    local removed=()
    for target in "/usr/local/bin/devkit" "$HOME/.local/bin/devkit"; do
        if [ -L "$target" ] && [ "$(readlink "$target")" = "$SCRIPT_DIR/devkit" ]; then
            local prefix=""
            [[ "$target" == /usr/local/* ]] && prefix="sudo "
            ${prefix}rm -f "$target" && removed+=("$target")
        fi
    done

    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
        if [ -f "$rc" ] && grep -q "alias devkit=" "$rc"; then
            local sedi=(-i)
            [[ "$OSTYPE" == "darwin"* ]] && sedi=(-i '')
            sed "${sedi[@]}" '/alias devkit=/d' "$rc" && removed+=("$rc:alias devkit")
        fi
    done

    if [ ${#removed[@]} -eq 0 ]; then
        echo "  沒有找到由本安裝建立的 symlink 或別名"
    else
        echo "  已移除："
        printf '    %s\n' "${removed[@]}"
    fi

    echo ""
    echo -e "${CYAN}下一步${NC}"
    echo "  移除安裝目錄："
    echo "    rm -rf \"$SCRIPT_DIR\""
}
```

**安全：**

- 只刪「symlink 指回自己的 `$SCRIPT_DIR/devkit`」，不誤刪別份安裝
- **不代刪** `$SCRIPT_DIR`，一律印指令請使用者執行
- `install.sh --uninstall` 功能與入口維持不動，是「本地手動 clone」的合理入口（文字輸出會隨整支對齊新風格）；`devkit --uninstall` 是「bootstrap 安裝後從任何地方反向」的便利入口，兩者功能等價但路徑不同

---

## 5. 測試契約

延續 `tests/devkit-cli.test.js` 模式（`spawnSync('bash', …)` + ANSI stripper）。**bootstrap.sh 不寫自動化測試**（網路 + git 副作用），歸入手動驗證。

### 5.1 新檔 `tests/install-sh.test.js`

每測試前 `mkdtempSync` 建立 sandbox 當 `HOME`，避免污染使用者真實 dotfiles 與 `~/.local/bin`。

| 測試 | 斷言 |
| --- | --- |
| `--help` 走新風格 | exit 0、含 `^使用方式$` 段標題、無 🛠️ / 📂 / 💡 |
| `--user --force --non-interactive` 不互動完成 | exit 0、`<sandbox>/.local/bin/devkit` symlink 指回 repo `devkit` |
| 同上重跑兩次 idempotent | 第二次仍 exit 0、symlink 仍正確 |
| `--non-interactive` 隱含 `--force` | symlink 已存在不問 y/N、直接覆蓋 |
| 未知旗標 | exit ≠ 0、stderr 含 `錯誤：` 前綴、無 ❌ |
| `--uninstall` | exit 0、symlink 已移除、訊息走新風格 |
| PATH 缺失提示 | `PATH` 不含 `~/.local/bin` 時，stdout 含 `下一步` 段與可貼的 `echo … >> ~/.zshrc` |

### 5.2 擴充 `tests/devkit-cli.test.js`

追加四組（共用既有 helper）：

| 測試 | 斷言 |
| --- | --- |
| `devkit --doctor` 基本輸出 | exit 視缺項而定；含 `^DevKit 體檢$` / `bash` / `Node.js` / `PATH` 段；無 emoji |
| `devkit --doctor` exit code 規則 | 透過 `spawnSync` 的 `env` 注入：`PATH=/usr/bin:/bin` 移除 `~/.local/bin` 與 Node → 應 exit 1；正常 `PATH` + 已安裝 Node/pnpm → 應 exit 0 |
| `devkit --update` 非 git 目錄 | exit ≠ 0、stderr 含 `錯誤：DevKit 安裝目錄不是 git 倉庫`、輸出 bootstrap 重裝指令 |
| `devkit --uninstall` sandbox HOME | exit 0、只動 symlink、不刪 `$SCRIPT_DIR`、輸出 `rm -rf "<dir>"` 提示 |

`--update` 成功路徑（真實 git pull）測不了，歸入手動驗證；失敗路徑可測且最重要 —— 新使用者最容易誤撞。

### 5.3 手動驗證清單

```
1. curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash
   → 三段流程、~/.devkit 出現、~/.local/bin/devkit 是 symlink
2. 同上重跑
   → 走 update 路徑、印 commit 比較
3. DEVKIT_DIR=/tmp/devkit-test curl … | bash
   → 安裝到自訂位置
4. devkit --doctor
   → 體檢報告完整、exit code 對
5. devkit --update（已安裝目錄）
   → git pull、commit short SHA 對比
6. devkit --uninstall
   → symlink 沒了、提示 rm -rf 指令
```

### 5.4 執行

```bash
pnpm test
```

`package.json` 既有 glob 自動撈到新檔，不動 scripts。

---

## 6. 檔案異動清單

### 新增

| 路徑 | 行數預估 | 責任 |
| --- | --- | --- |
| `bootstrap.sh` | ~120 | 遠端入口：env check → DEVKIT_DIR 狀態判別 → git clone / pull → exec install.sh |
| `tests/install-sh.test.js` | ~200 | install.sh 七項契約測試，全程 sandbox HOME |

### 修改

| 路徑 | 變更摘要 |
| --- | --- |
| `install.sh` | (1) 新增 `--non-interactive` 旗標 + `NON_INTERACTIVE=false` 全域；(2) 新增 `print_error` + 內聯顏色變數；(3) 全檔 emoji → 純文字（normal path「提示：」、error 走 `print_error`、success 走 bold）；(4) `--user` PATH 提示偵測 `$SHELL` 給針對性可貼指令；(5) 互動 `read -p` 在 `NON_INTERACTIVE=true` 時跳過 |
| `devkit` | 新增三個 case 分支與 `update_devkit` / `doctor_devkit` / `uninstall_devkit`，沿用 `print_error` 與 `$SCRIPT_DIR` |
| `tests/devkit-cli.test.js` | 追加四組測試（`--doctor` × 2 + `--update` non-git + `--uninstall` sandbox） |
| `README.md` | 一鍵安裝改為 `curl … bootstrap.sh \| bash` 為「方法一」；原三方法降為「方法二／三／四（進階）」；補「更新／體檢／移除」小節列三個 `devkit --…` 子命令；移除 `git clone <repository-url>` placeholder（換真實 URL） |
| `AGENTS.md` | 同步「安裝方式」與「常用命令」兩段（CLAUDE.md 是 redirect 不必動） |

### 不動

- `package.json`（測試 glob 自動撈到新檔）
- `devkit` 的 discovery / dispatch 主邏輯
- `bash-tools/` 與 `node-tools/` 任何工具
- `UPGRADE.md`

---

## 7. Commit 切分（給 writing-plans 的最小可審查單元）

```
1. test:  [devkit] scaffold install.sh smoke tests with --help baseline
2. feat:  [devkit] add --non-interactive flag to install.sh
3. style: [devkit] align install.sh output with new section style
4. feat:  [devkit] devkit --update for in-place git pull
5. feat:  [devkit] devkit --doctor health check with exit-code rules
6. feat:  [devkit] devkit --uninstall reverses local symlinks safely
7. feat:  [devkit] bootstrap.sh remote installer with git clone + exec install.sh
8. docs:  [devkit] document curl|bash install + lifecycle subcommands
```

順序：install.sh 測試打底 → 旗標 → 風格 → dispatcher 子命令 → bootstrap → docs。每步紅綠循環清晰。

---

## 8. 風險與邊界

- **bootstrap.sh 無自動化測試**：網路 + git 副作用，mock 成本高於收益。靠手動驗證清單與真實 dogfood 防回退。
- **shallow clone**：`--depth=1` 不含完整歷史。`devkit --update` 仍可運作；若需歷史，使用者跑 `git fetch --unshallow`。
- **`devkit --uninstall` 不代刪 `$SCRIPT_DIR`**：因可能是使用者開發中的 work tree，自動刪太危險。
- **`install.sh --uninstall` 與 `devkit --uninstall` 並存**：功能等價、入口不同，重複可接受（< 30 行）。
- **macOS / Linux sed `-i` 差異**：既有 `install.sh` 已有 OSTYPE 判斷，沿用同一模式。
- **sandbox HOME 測試對 sudo path 無感**：`install.sh --system` 路徑因需 sudo，sandbox 測不到；維持手動驗證，不在自動化測試範圍。

---

## 9. 範圍邊界（防蔓延）

不在本輪：

- Homebrew tap / npm 全域 / GitHub Release auto-build
- devkit dispatch / discovery 任何主邏輯改動
- bash-tools / node-tools 任一工具改動
- 抽共用 lib（兩處 `print_error` 內聯）
- UPGRADE.md 更新（與安裝改動無關）
