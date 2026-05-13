# DevKit Install UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供 `curl | bash` 一行遠端安裝管道、把 `install.sh` 對齊新 devkit UX 風格、補上 `devkit --update / --doctor / --uninstall` 三個生命週期子命令，並用 Node smoke tests 鎖死契約。

**Architecture:** 三層獨立元件：`bootstrap.sh`（遠端入口、只做拉檔）→ `install.sh`（本地安裝最後一哩，新增 `--non-interactive`、輸出對齊 devkit 風格）→ `devkit` dispatcher（新增三個子命令，沿用既有 `$SCRIPT_DIR` 與 `print_error`）。測試用 sandbox `HOME` 隔離 `tests/install-sh.test.js`，並擴充既有 `tests/devkit-cli.test.js`。`bootstrap.sh` 因含網路 + git 副作用，歸入手動驗證清單。

**Tech Stack:**
- Bash 3.2+（macOS 預設；不依賴 GNU sed `\U`、不需 associative array）
- Node.js `>=18 <24`、`node:test`、`node:assert/strict`、`node:child_process.spawnSync`、`node:fs.mkdtempSync`
- pnpm test runner（既有 `package.json scripts.test` glob 自動撈到新檔）

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `bootstrap.sh` | Create | 遠端入口：解析 `DEVKIT_DIR / DEVKIT_REF / DEVKIT_REPO`、檢查 bash & git、依目錄狀態 `git clone --depth=1` 或 `git pull --ff-only`、`exec` 到 `install.sh --user --force --non-interactive`。**不重複** install.sh 的 PATH/symlink 邏輯。 |
| `install.sh` | Modify | (1) 新增 `--non-interactive` 旗標（隱含 `--force`、跳過所有 `read -p`）。(2) 全檔輸出對齊新風格：cyan section heading、縮排兩格純文字項目、`print_error` 走 stderr、bold 成功訊息、無 emoji。(3) `--user` PATH 缺失提示偵測 `$SHELL` 給可貼指令。 |
| `devkit` | Modify | 在 `main` 的 case 加 `--update / --doctor / --uninstall` 三個分支與對應函式 `update_devkit / doctor_devkit / uninstall_devkit`。沿用既有 `print_error / $SCRIPT_DIR / CYAN / BOLD`，不動 discovery / dispatch。 |
| `tests/install-sh.test.js` | Create | install.sh 七項契約測試。每測試 `mkdtempSync` 建 sandbox 當 `HOME`，避免污染真實 dotfiles 與 `~/.local/bin`。 |
| `tests/devkit-cli.test.js` | Modify | 追加四組：`--doctor` 基本輸出、`--doctor` exit code 規則、`--update` 非 git 目錄、`--uninstall` sandbox HOME。 |
| `README.md` | Modify | 「方法一」改 curl \| bash；原三方法降為方法二/三/四；補「更新／體檢／移除」小節列三子命令；移除 `<repository-url>` placeholder。 |
| `AGENTS.md` | Modify | 同步「安裝方式」與「常用命令」段。（CLAUDE.md 是 redirect 不動） |

不抽共用 lib：兩處 `print_error` 內聯複製（< 7 行）。`bootstrap.sh` 不寫自動化測試。

---

## Tasks

### Task 1: Scaffold install.sh smoke tests with `--help` baseline

**Files:**
- Create: `tests/install-sh.test.js`

- [ ] **Step 1: Write the baseline test file**

建立 `tests/install-sh.test.js`，含共用 helper 與一支「`--help` 應 exit 0」的最低門檻測試。此時 install.sh 仍是舊風格、`--help` 已能 exit 0，所以這支測試會立刻通過 —— 用來驗證 harness 本身能跑，Task 3 才會加上嚴格的內容斷言。

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readlinkSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const installPath = resolve('install.sh');
const devkitPath = resolve('devkit');
const repoDir = resolve('.');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-9;]*m/g;

function stripAnsi(input) {
    return input.replace(ANSI_PATTERN, '');
}

function runInstall(args = [], env = {}) {
    const result = spawnSync('bash', [installPath, ...args], {
        encoding: 'utf8',
        cwd: repoDir,
        env: { ...process.env, ...env },
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    return {
        status: result.status,
        stdout,
        stderr,
        combined: stripAnsi(stdout + stderr),
    };
}

function withSandboxHome(fn) {
    const home = mkdtempSync(join(tmpdir(), 'devkit-install-'));
    try {
        return fn(home);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('install.sh --help exits 0', () => {
    const r = runInstall(['--help']);
    assert.equal(r.status, 0, r.combined);
});
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `pnpm test`
Expected: 新測試通過；既有 `tests/devkit-cli.test.js` 七支測試與 `tests/clean-branch.test.js`、`tests/version-check.test.js` 仍全綠。

- [ ] **Step 3: Commit**

```bash
git add tests/install-sh.test.js
git commit -m "test: [devkit] scaffold install.sh smoke tests with --help baseline"
```

---

### Task 2: Add `--non-interactive` flag to install.sh

**Files:**
- Modify: `tests/install-sh.test.js`
- Modify: `install.sh`

- [ ] **Step 1: Write the failing test for non-interactive flow + idempotent + implied --force**

在 `tests/install-sh.test.js` 末尾追加三支測試，覆蓋三個契約：`--user --force --non-interactive` 零互動安裝、重跑 idempotent、`--non-interactive` 隱含 `--force`（symlink 已存在時直接覆寫、不問 y/N）。

```javascript
test('install.sh --user --force --non-interactive completes without prompting', () => {
    withSandboxHome((home) => {
        const r = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(r.status, 0, r.combined);
        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.ok(existsSync(symlink), `symlink missing: ${symlink}\n${r.combined}`);
        assert.equal(readlinkSync(symlink), join(repoDir, 'devkit'));
    });
});

test('install.sh --user --force --non-interactive is idempotent on second run', () => {
    withSandboxHome((home) => {
        const first = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(first.status, 0, first.combined);
        const second = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(second.status, 0, second.combined);
        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.equal(readlinkSync(symlink), join(repoDir, 'devkit'));
    });
});

test('install.sh --non-interactive implies --force (no prompt when symlink exists)', () => {
    withSandboxHome((home) => {
        // Seed: install once with --force.
        runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        // Now re-install without explicit --force; --non-interactive alone must skip the y/N prompt.
        const r = runInstall(['--user', '--non-interactive'], { HOME: home });
        assert.equal(r.status, 0, r.combined);
        assert.doesNotMatch(r.combined, /是否要覆蓋/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: 三支新測試失敗 —— install.sh 目前不認識 `--non-interactive`，會走「未知參數」路徑 exit 1，且 `install_user` 仍會在 symlink 存在時嘗試 `read -p`（在無 TTY 環境讀到 EOF 行為未定）。

- [ ] **Step 3: Add `NON_INTERACTIVE` global and the flag parser branch**

在 `install.sh` 第 21-24 行區塊（`INSTALL_METHOD=""` 起）新增全域。

修改 `install.sh:21-24`：

```bash
# 安裝選項
INSTALL_METHOD=""
FORCE_INSTALL=false
NON_INTERACTIVE=false
UNINSTALL=false
```

在 `install.sh:322-325` 的 `--force)` case 之後追加：

```bash
            --non-interactive)
                NON_INTERACTIVE=true
                FORCE_INSTALL=true
                shift
                ;;
```

- [ ] **Step 4: Add a `--non-interactive` guard at the top of `interactive_install`**

三處 `read -p "是否要..."` 互動點（`install_system:99` / `install_user:140` / `install_alias:192`）已有 `if [ "$FORCE_INSTALL" = false ]` guard；因 `--non-interactive` 強制 `FORCE_INSTALL=true`，這三段天然會跳過，**不需動程式碼**。

唯一風險：本地手動 `./install.sh --non-interactive`（沒帶 `--system/--user/--alias`）會掉進 `interactive_install` 的主選單 `read -p`、卡死。在 `interactive_install` 入口加守門。

修改 `install.sh:266-268`（原 `interactive_install() {` 起），插入第一個檢查：

```bash
# 互動式安裝
interactive_install() {
    if [ "$NON_INTERACTIVE" = true ]; then
        echo -e "${RED}錯誤：--non-interactive 模式需明確指定 --system / --user / --alias${NC}" >&2
        exit 1
    fi
    echo -e "${BOLD}🛠️  DevKit 互動式安裝${NC}"
```

Task 3 會把這行錯誤改用 `print_error`，這裡先寫死 inline 即可（避免 Task 2 還沒引入 helper 就 forward-reference）。

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: 本任務三支新測試全綠；既有測試全部仍綠。

- [ ] **Step 6: Commit**

```bash
git add install.sh tests/install-sh.test.js
git commit -m "feat: [devkit] add --non-interactive flag to install.sh"
```

---

### Task 3: Align install.sh output with new section style

**Files:**
- Modify: `tests/install-sh.test.js`
- Modify: `install.sh`

- [ ] **Step 1: Write the failing tests for new style, error formatting, PATH hint, and uninstall**

追加四支測試。新風格契約：cyan section heading（無 emoji）、錯誤走 `錯誤：` 前綴到 stderr、PATH 缺失提示走 `下一步` cyan 段並印可貼指令、`--uninstall` 訊息也走新風格。

```javascript
test('install.sh --help walks the new section style without emoji', () => {
    const r = runInstall(['--help']);
    assert.equal(r.status, 0, r.combined);
    assert.match(r.combined, /^使用方式$/m);
    assert.doesNotMatch(r.combined, /🛠️|📂|💡|🚀|✅|❌|⚠️|🎉|🔍|🗑️/);
});

test('install.sh unknown flag prints 錯誤： to stderr without emoji', () => {
    const r = runInstall(['--definitely-not-a-flag']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(stripAnsi(r.stderr), /錯誤：/);
    assert.doesNotMatch(r.combined, /❌/);
});

test('install.sh --user prints 下一步 with shell-specific PATH hint when ~/.local/bin missing', () => {
    withSandboxHome((home) => {
        // Trim PATH so it does NOT contain $home/.local/bin.
        const r = runInstall(['--user', '--force', '--non-interactive'], {
            HOME: home,
            PATH: '/usr/bin:/bin',
            SHELL: '/bin/zsh',
        });
        assert.equal(r.status, 0, r.combined);
        assert.match(r.combined, /^下一步$/m);
        assert.match(r.combined, /echo 'export PATH="\$HOME\/\.local\/bin:\$PATH"' >> ~\/\.zshrc/);
    });
});

test('install.sh --uninstall walks the new style', () => {
    withSandboxHome((home) => {
        runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        const r = runInstall(['--uninstall'], { HOME: home });
        assert.equal(r.status, 0, r.combined);
        assert.doesNotMatch(r.combined, /🎉|🗑️|✅|❌/);
        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.ok(!existsSync(symlink), `symlink should be gone: ${symlink}\n${r.combined}`);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: 四支新測試全紅 —— install.sh 目前還是滿屏 emoji、`show_help` 段標題帶冒號（`使用方式：`）、`--user` PATH 提示沒有 `下一步` 段、`--uninstall` 帶 🎉。

- [ ] **Step 3: Inline `print_error` helper into install.sh**

在 `install.sh:19`（`NC='\033[0m'` 之後）新增（從 `devkit` 內聯複製，~3 行）：

```bash
NC='\033[0m'

# 統一錯誤輸出：紅色 + 「錯誤：」前綴 + stderr
print_error() {
    echo -e "${RED}錯誤：$1${NC}" >&2
}
```

- [ ] **Step 4: Rewrite `show_help` to the new section style**

替換 `install.sh:27-49` 整段 `show_help`：

```bash
# 顯示使用說明
show_help() {
    echo -e "${BOLD}DevKit 安裝腳本${NC}"
    echo ""
    echo "  將 devkit 安裝到系統，支援全域呼叫"
    echo ""
    echo -e "${CYAN}使用方式${NC}"
    echo "  $0 [選項]"
    echo ""
    echo -e "${CYAN}選項${NC}"
    echo "  --system               安裝到系統目錄 (/usr/local/bin)"
    echo "  --user                 安裝到使用者目錄 (~/.local/bin)"
    echo "  --alias                建立 shell 別名"
    echo "  --force                強制安裝（覆蓋現有檔案）"
    echo "  --non-interactive      跳過所有確認；隱含 --force"
    echo "  --uninstall            移除安裝"
    echo "  --help                 顯示此說明"
    echo ""
    echo -e "${CYAN}範例${NC}"
    echo "  $0 --system            安裝到系統目錄"
    echo "  $0 --user              安裝到使用者目錄"
    echo "  $0 --alias             建立別名"
    echo "  $0 --uninstall         移除安裝"
}
```

- [ ] **Step 5: Rewrite `check_environment` to the new style**

替換 `install.sh:51-78`：

```bash
# 檢查系統環境
check_environment() {
    echo -e "${CYAN}檢查系統環境${NC}"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  macOS"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "  Linux"
    else
        echo "  未知作業系統：$OSTYPE（嘗試通用安裝）"
    fi

    if [ ! -f "$DEVKIT_SCRIPT" ]; then
        print_error "找不到 devkit 腳本：$DEVKIT_SCRIPT"
        exit 1
    fi

    if [ ! -x "$DEVKIT_SCRIPT" ]; then
        echo "  提示：設定 devkit 執行權限"
        chmod +x "$DEVKIT_SCRIPT"
    fi
}
```

- [ ] **Step 6: Rewrite `install_system` to the new style**

替換 `install.sh:80-122`：

```bash
# 系統安裝 (需要 sudo 權限)
install_system() {
    local target_dir="/usr/local/bin"
    local target_file="$target_dir/devkit"

    echo -e "${CYAN}安裝到 $target_dir${NC}"

    if [ ! -d "$target_dir" ]; then
        echo "  提示：建立目錄 $target_dir"
        sudo mkdir -p "$target_dir" || {
            print_error "無法建立目錄：$target_dir"
            return 1
        }
    fi

    if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
        echo "  檔案已存在：$target_file"
        read -p "  是否要覆蓋？(y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "  已取消安裝"
            return 1
        fi
    fi

    if sudo ln -sf "$DEVKIT_SCRIPT" "$target_file"; then
        echo "  symlink $target_file → $DEVKIT_SCRIPT"
        if command -v devkit >/dev/null 2>&1; then
            echo "  devkit 已可全域使用"
        else
            echo "  提示：可能需要重新載入 shell 或檢查 PATH"
        fi
        return 0
    else
        print_error "安裝失敗"
        return 1
    fi
}
```

- [ ] **Step 7: Rewrite `install_user` with shell-aware PATH hint**

替換 `install.sh:124-165`。新風格 + `--user` PATH 提示走 `下一步` cyan 段、偵測 `$SHELL` 選 rc 檔。

```bash
# 使用者安裝
install_user() {
    local target_dir="$HOME/.local/bin"
    local target_file="$target_dir/devkit"

    echo -e "${CYAN}安裝到 $target_dir${NC}"

    mkdir -p "$target_dir" || {
        print_error "無法建立目錄：$target_dir"
        return 1
    }

    if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
        echo "  檔案已存在：$target_file"
        read -p "  是否要覆蓋？(y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "  已取消安裝"
            return 1
        fi
    fi

    if ! ln -sf "$DEVKIT_SCRIPT" "$target_file"; then
        print_error "安裝失敗"
        return 1
    fi
    echo "  symlink $target_file → $DEVKIT_SCRIPT"

    if [[ ":$PATH:" != *":$target_dir:"* ]]; then
        local rc="~/.zshrc"
        [[ "$SHELL" == *"bash"* ]] && rc="~/.bashrc"
        echo ""
        echo -e "${CYAN}下一步${NC}"
        echo "  $target_dir 不在 PATH 中，請執行："
        echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> $rc"
        echo "    source $rc"
    else
        echo "  devkit 已可全域使用"
    fi

    return 0
}
```

- [ ] **Step 8: Rewrite `install_alias` to the new style**

替換 `install.sh:167-214`：

```bash
# 建立別名
install_alias() {
    echo -e "${CYAN}建立 shell 別名${NC}"

    local shell_rc=""
    local alias_line="alias devkit=\"$DEVKIT_SCRIPT\""

    if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
        shell_rc="$HOME/.zshrc"
        echo "  偵測到 Zsh：$shell_rc"
    elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
        shell_rc="$HOME/.bashrc"
        echo "  偵測到 Bash：$shell_rc"
    else
        echo "  無法偵測 shell 類型；請手動加入："
        echo "    $alias_line"
        return 0
    fi

    if [ -f "$shell_rc" ] && grep -q "alias devkit=" "$shell_rc"; then
        if [ "$FORCE_INSTALL" = false ]; then
            echo "  別名已存在於 $shell_rc"
            read -p "  是否要更新？(y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "  已取消安裝"
                return 1
            fi
        fi

        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' '/alias devkit=/d' "$shell_rc"
        else
            sed -i '/alias devkit=/d' "$shell_rc"
        fi
    fi

    echo "$alias_line" >> "$shell_rc"
    echo "  別名已加入：$shell_rc"
    echo ""
    echo -e "${CYAN}下一步${NC}"
    echo "  source $shell_rc"

    return 0
}
```

- [ ] **Step 9: Rewrite `uninstall` to the new style**

替換 `install.sh:216-264`：

```bash
# 移除安裝
uninstall() {
    echo -e "${CYAN}移除 DevKit${NC}"

    local removed=false

    if [ -f "/usr/local/bin/devkit" ]; then
        if sudo rm -f "/usr/local/bin/devkit"; then
            echo "  已移除 /usr/local/bin/devkit"
            removed=true
        else
            print_error "移除 /usr/local/bin/devkit 失敗"
        fi
    fi

    if [ -f "$HOME/.local/bin/devkit" ]; then
        if rm -f "$HOME/.local/bin/devkit"; then
            echo "  已移除 $HOME/.local/bin/devkit"
            removed=true
        else
            print_error "移除 $HOME/.local/bin/devkit 失敗"
        fi
    fi

    for rc_file in "$HOME/.zshrc" "$HOME/.bashrc"; do
        if [ -f "$rc_file" ] && grep -q "alias devkit=" "$rc_file"; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' '/alias devkit=/d' "$rc_file"
            else
                sed -i '/alias devkit=/d' "$rc_file"
            fi
            echo "  已移除 $rc_file 內的 alias devkit"
            removed=true
        fi
    done

    if [ "$removed" = true ]; then
        echo ""
        echo -e "${BOLD}DevKit 移除完成${NC}"
        echo -e "${CYAN}下一步${NC}"
        echo "  重新載入 shell 或重新開啟終端"
    else
        echo "  沒有找到已安裝的 devkit"
    fi
}
```

- [ ] **Step 10: Rewrite `interactive_install` to the new style**

替換 `install.sh:266-303`。保留 Task 2 加進去的 `NON_INTERACTIVE` 守門，把錯誤訊息改用 `print_error`：

```bash
# 互動式安裝
interactive_install() {
    if [ "$NON_INTERACTIVE" = true ]; then
        print_error "--non-interactive 模式需明確指定 --system / --user / --alias"
        exit 1
    fi

    echo -e "${BOLD}DevKit 互動式安裝${NC}"
    echo ""
    echo -e "${CYAN}請選擇安裝方式${NC}"
    echo "  1. 建立別名（推薦 — 最簡單且最穩定）"
    echo "  2. 使用者安裝（僅當前使用者可用，符號連結）"
    echo "  3. 系統安裝（需 sudo，所有使用者可用，符號連結）"
    echo "  4. 取消安裝"
    echo ""

    read -p "請輸入選項 (1-4，預設 1)：" choice
    choice=${choice:-1}

    case "$choice" in
        1) INSTALL_METHOD="alias" ;;
        2) INSTALL_METHOD="user" ;;
        3) INSTALL_METHOD="system" ;;
        4)
            echo "  已取消安裝"
            exit 0
            ;;
        *)
            echo "  無效選項，使用預設的別名安裝"
            INSTALL_METHOD="alias"
            ;;
    esac
}
```

- [ ] **Step 11: Rewrite `main` (success / unknown-flag tails) to the new style**

替換 `install.sh:305-390` 整段 `main()`：

```bash
# 主程式
main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --system)
                INSTALL_METHOD="system"
                shift
                ;;
            --user)
                INSTALL_METHOD="user"
                shift
                ;;
            --alias)
                INSTALL_METHOD="alias"
                shift
                ;;
            --force)
                FORCE_INSTALL=true
                shift
                ;;
            --non-interactive)
                NON_INTERACTIVE=true
                FORCE_INSTALL=true
                shift
                ;;
            --uninstall)
                UNINSTALL=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                print_error "未知參數：$1"
                show_help >&2
                exit 1
                ;;
        esac
    done

    check_environment
    echo ""

    if [ "$UNINSTALL" = true ]; then
        uninstall
        exit 0
    fi

    if [ -z "$INSTALL_METHOD" ]; then
        interactive_install
        echo ""
    fi

    case "$INSTALL_METHOD" in
        "system")
            install_system && {
                echo ""
                echo -e "${BOLD}DevKit 安裝完成${NC}"
                echo "  現在您可以在任何地方使用 devkit"
            }
            ;;
        "user")
            install_user && {
                echo ""
                echo -e "${BOLD}DevKit 安裝完成${NC}"
            }
            ;;
        "alias")
            install_alias && {
                echo ""
                echo -e "${BOLD}DevKit 安裝完成${NC}"
                echo "  重新載入 shell 後即可使用 devkit"
            }
            ;;
        *)
            print_error "無效的安裝方式：$INSTALL_METHOD"
            exit 1
            ;;
    esac
}

# 執行主程式
main "$@"
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm test`
Expected: Task 3 四支新測試綠；Task 1-2 測試 + 既有 devkit-cli 測試全部仍綠。

- [ ] **Step 13: Commit**

```bash
git add install.sh tests/install-sh.test.js
git commit -m "style: [devkit] align install.sh output with new section style"
```

---

### Task 4: `devkit --update` for in-place git pull

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit`

- [ ] **Step 1: Add the failing test for non-git directory error path**

`--update` 成功路徑會真的跑 `git pull`，無法在 sandbox 測；失敗路徑（`$SCRIPT_DIR` 非 git work tree）才是新使用者最容易撞的契約，必須測。

先在 `tests/devkit-cli.test.js` 頂端 import 段（檔頭 1-4 行）擴充：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
```

然後在檔尾追加：

```javascript
test('devkit --update outside a git work tree exits non-zero with bootstrap hint', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'devkit-non-git-'));
    try {
        const devkitCopy = join(tmpDir, 'devkit');
        cpSync(devkitPath, devkitCopy);
        chmodSync(devkitCopy, 0o755);

        const result = spawnSync('bash', [devkitCopy, '--update'], { encoding: 'utf8' });
        const combined = stripAnsi((result.stdout ?? '') + (result.stderr ?? ''));

        assert.notEqual(result.status, 0, combined);
        assert.match(combined, /錯誤：DevKit 安裝目錄不是 git 倉庫/);
        assert.match(combined, /bootstrap\.sh \| bash/);
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: 新測試紅。devkit 還沒認識 `--update`，會落到 `show_category_tools '--update'`，印「分類不存在」與可用分類列表 → 雖然 exit 非 0，但訊息不含 `DevKit 安裝目錄不是 git 倉庫` 與 `bootstrap.sh | bash`，斷言失敗。

- [ ] **Step 3: Add `update_devkit` function and route the flag**

在 `devkit:482` 之前（`# 主程式` 區塊前）新增：

```bash
# 在地更新：git pull --ff-only
update_devkit() {
    if [ ! -d "$SCRIPT_DIR/.git" ]; then
        print_error "DevKit 安裝目錄不是 git 倉庫：$SCRIPT_DIR"
        {
            echo "  此情境通常代表手動下載 tarball，請改為遠端重裝："
            echo "  curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash"
        } >&2
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

在 `devkit:487-509` 的 `main()` case 區塊中，於 `"--interactive"|"-i")` 之後、`*":"*)` 之前新增：

```bash
        "--update")
            update_devkit
            ;;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: 新測試綠；既有 devkit-cli 七支 + install-sh 全部仍綠。

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] devkit --update for in-place git pull"
```

---

### Task 5: `devkit --doctor` health check with exit-code rules

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit`

- [ ] **Step 1: Add the failing tests for basic doctor output and exit-code rule**

兩支測試：(a) 正常環境下 `devkit --doctor` 印出新風格段標題、無 emoji、含 bash / Node.js / PATH 區塊；(b) 透過 `env` 注入 `PATH=/usr/bin:/bin` 刻意把 node 與 `~/.local/bin` 都拿掉 → 應 exit 1。

```javascript
test('devkit --doctor prints the health report sections without emoji', () => {
    const r = runDevkit(['--doctor']);
    assert.match(r.combined, /^DevKit 體檢$/m);
    assert.match(r.combined, /^bash$/m);
    assert.match(r.combined, /^Node\.js$/m);
    assert.match(r.combined, /^PATH$/m);
    assert.match(r.combined, /^結果$/m);
    assert.doesNotMatch(r.combined, /❌|✅|⚠️/);
});

test('devkit --doctor exits 1 when required tooling is missing from PATH', () => {
    const result = spawnSync('bash', [devkitPath, '--doctor'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    const combined = stripAnsi((result.stdout ?? '') + (result.stderr ?? ''));
    assert.equal(result.status, 1, combined);
    assert.match(combined, /錯誤/);
});
```

注：第二支測試假設 `/usr/bin:/bin` 不會撈到 node / pnpm；在 CI 與多數開發機上成立。若本機把 node 裝進 `/usr/bin`，本測試會誤綠 —— 風險可接受（spec 已涵蓋手動驗證清單）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: 兩支新測試紅 —— devkit 還沒認識 `--doctor`。

- [ ] **Step 3: Add `doctor_devkit` function and route the flag**

在 `devkit` 中、`update_devkit` 後新增。逐項輸出 OK / 警告 / 錯誤，累計 counter，按錯誤數決定 exit code。

```bash
# 系統體檢
doctor_devkit() {
    local ok=0 warnings=0 errors=0

    echo -e "${BOLD}DevKit 體檢${NC}"
    echo ""

    # --- bash ---
    echo "bash"
    local bash_ver
    bash_ver=$(bash --version | head -1 | sed -E 's/.*version ([0-9.]+).*/\1/')
    echo "  OK    bash $bash_ver"
    ((ok++))
    echo ""

    # --- git ---
    echo "git"
    if command -v git >/dev/null 2>&1; then
        local git_ver
        git_ver=$(git --version | awk '{print $3}')
        echo "  OK    git $git_ver"
        ((ok++))
        if [ -d "$SCRIPT_DIR/.git" ]; then
            local sha branch
            sha=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
            branch=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
            echo "  OK    \$SCRIPT_DIR 是 git 倉庫（commit $sha on $branch）"
            ((ok++))
        else
            echo "  警告  \$SCRIPT_DIR 不是 git 倉庫，devkit --update 不可用"
            ((warnings++))
        fi
    else
        echo "  錯誤  git 未安裝"
        ((errors++))
    fi
    echo ""

    # --- Node.js ---
    echo "Node.js"
    if command -v node >/dev/null 2>&1; then
        local node_ver
        node_ver=$(node -v | sed 's/v//')
        local major="${node_ver%%.*}"
        if [ "$major" -lt 18 ]; then
            echo "  錯誤  Node v${node_ver} 不支援，請升級至 v18 LTS"
            ((errors++))
        elif [ "$major" -ge 24 ]; then
            echo "  警告  Node v${node_ver} 未經完整測試（仍可執行）"
            ((warnings++))
        else
            echo "  OK    Node v${node_ver}（>=18 <24）"
            ((ok++))
        fi
    else
        echo "  錯誤  Node.js 未安裝"
        ((errors++))
    fi
    echo ""

    # --- pnpm ---
    echo "pnpm"
    if command -v pnpm >/dev/null 2>&1; then
        local pnpm_ver
        pnpm_ver=$(pnpm --version)
        echo "  OK    pnpm $pnpm_ver"
        ((ok++))
    else
        echo "  錯誤  pnpm 未安裝，請執行：corepack enable && corepack prepare pnpm@8 --activate"
        ((errors++))
    fi
    echo ""

    # --- PATH / symlink ---
    echo "PATH"
    local symlink_ok=false
    for target in "$HOME/.local/bin/devkit" "/usr/local/bin/devkit"; do
        if [ -L "$target" ] && [ "$(readlink "$target")" = "$SCRIPT_DIR/devkit" ]; then
            echo "  OK    $target → \$SCRIPT_DIR/devkit"
            ((ok++))
            symlink_ok=true
        fi
    done
    if [ "$symlink_ok" = false ]; then
        echo "  警告  找不到指回 \$SCRIPT_DIR/devkit 的 symlink"
        ((warnings++))
    fi
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]] && [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
        echo "  錯誤  ~/.local/bin 不在 PATH，請執行："
        echo "        echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
        ((errors++))
    fi
    echo ""

    # --- 結果 ---
    echo "結果"
    echo "  $ok 項通過，$warnings 項警告，$errors 項錯誤"

    [ "$errors" -gt 0 ] && return 1
    return 0
}
```

在 `main()` case 區塊加，放在 `"--update")` 之後：

```bash
        "--doctor")
            doctor_devkit
            ;;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: Task 5 兩支新測試綠；既有測試全綠。

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] devkit --doctor health check with exit-code rules"
```

---

### Task 6: `devkit --uninstall` reverses local symlinks safely

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit`

- [ ] **Step 1: Add the failing test for sandbox HOME uninstall**

先用 `install.sh --user --force --non-interactive` 在 sandbox HOME 安裝、然後跑 `devkit --uninstall` 並覆寫 HOME → 應該只刪 symlink、不動 `$SCRIPT_DIR`，並印 `rm -rf "<dir>"` 提示。

於 `tests/devkit-cli.test.js` 檔尾追加：

```javascript
test('devkit --uninstall removes the sandbox-HOME symlink and prints rm -rf hint', () => {
    const home = mkdtempSync(join(tmpdir(), 'devkit-uninstall-'));
    try {
        // Seed: install into the sandbox HOME via install.sh.
        const installResult = spawnSync('bash', [resolve('install.sh'), '--user', '--force', '--non-interactive'], {
            encoding: 'utf8',
            env: { ...process.env, HOME: home },
        });
        assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);

        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.ok(existsSync(symlink), 'precondition: symlink should exist after install');

        // Act: uninstall via dispatcher, sandbox HOME so we don't touch real ~/.zshrc.
        const uninstallResult = spawnSync('bash', [devkitPath, '--uninstall'], {
            encoding: 'utf8',
            env: { ...process.env, HOME: home },
        });
        const combined = stripAnsi((uninstallResult.stdout ?? '') + (uninstallResult.stderr ?? ''));

        assert.equal(uninstallResult.status, 0, combined);
        assert.ok(!existsSync(symlink), `symlink should be removed: ${combined}`);
        // SCRIPT_DIR not auto-deleted; hint must be printed.
        assert.match(combined, /rm -rf/);
        assert.match(combined, /^下一步$/m);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
});
```

`mkdtempSync / existsSync / rmSync / tmpdir / join / resolve` 等 import 已於 Task 4 Step 1 引入；不需重複加。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: 紅。devkit 還不認識 `--uninstall`，會走 `show_category_tools '--uninstall'`。

- [ ] **Step 3: Add `uninstall_devkit` function and route the flag**

在 `devkit` 中（`doctor_devkit` 之後）新增。**安全紀律：** 只刪「symlink 指回 `$SCRIPT_DIR/devkit`」的 target，不動別份安裝、不代刪 `$SCRIPT_DIR`。

```bash
# 反向安裝：移除 symlink + alias，不刪 $SCRIPT_DIR
uninstall_devkit() {
    echo -e "${CYAN}移除 DevKit${NC}"

    local removed=()
    for target in "/usr/local/bin/devkit" "$HOME/.local/bin/devkit"; do
        if [ -L "$target" ] && [ "$(readlink "$target")" = "$SCRIPT_DIR/devkit" ]; then
            local prefix=""
            [[ "$target" == /usr/local/* ]] && prefix="sudo "
            if ${prefix}rm -f "$target"; then
                removed+=("$target")
            fi
        fi
    done

    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
        if [ -f "$rc" ] && grep -q "alias devkit=" "$rc"; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' '/alias devkit=/d' "$rc"
            else
                sed -i '/alias devkit=/d' "$rc"
            fi
            removed+=("$rc:alias devkit")
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

在 `main()` case 區塊加，放在 `"--doctor")` 之後：

```bash
        "--uninstall")
            uninstall_devkit
            ;;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: 新測試綠；既有全綠。

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] devkit --uninstall reverses local symlinks safely"
```

---

### Task 7: `bootstrap.sh` remote installer

**Files:**
- Create: `bootstrap.sh`

**測試策略：** bootstrap.sh 含網路 + git 副作用，**不寫自動化測試**（mock 成本高於收益）。本任務只實作 + 手動驗證；契約由「`install.sh --user --force --non-interactive` 已被 Tasks 1-3 鎖死」這條間接保障。

- [ ] **Step 1: Write `bootstrap.sh` at the repo root**

```bash
#!/bin/bash
# ==========================================
# DevKit 遠端安裝入口
# 用法: curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash
# ==========================================

set -euo pipefail

# 彩色輸出（與 devkit / install.sh 對齊）
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_error() {
    echo -e "${RED}錯誤：$1${NC}" >&2
}

# --- 預設值 ---
DEVKIT_DIR="${DEVKIT_DIR:-$HOME/.devkit}"
DEVKIT_REF="${DEVKIT_REF:-main}"
DEVKIT_REPO="${DEVKIT_REPO:-https://github.com/CarlLee1983/carl-dev-tools.git}"
MODE="auto"   # auto | update

show_help() {
    cat <<EOF
${BOLD}DevKit 遠端安裝${NC}

${CYAN}使用方式${NC}
  curl -fsSL <bootstrap-url> | bash
  curl -fsSL <bootstrap-url> | bash -s -- --update

${CYAN}環境變數${NC}
  DEVKIT_DIR    安裝目錄（預設 \$HOME/.devkit）
  DEVKIT_REF    git ref（預設 main）
  DEVKIT_REPO   來源 repo URL
EOF
}

# --- 解析旗標 ---
while [[ $# -gt 0 ]]; do
    case "$1" in
        --update)
            MODE="update"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            print_error "未知參數：$1"
            show_help >&2
            exit 1
            ;;
    esac
done

echo -e "${BOLD}DevKit 安裝精靈${NC}"
echo ""

# --- 步驟 1/3 環境檢查 ---
echo -e "${CYAN}步驟 1/3  檢查環境${NC}"
bash_ver=$(bash --version | head -1 | sed -E 's/.*version ([0-9.]+).*/\1/')
echo "  bash $bash_ver"

if ! command -v git >/dev/null 2>&1; then
    print_error "需要 git，請先安裝後重試"
    exit 1
fi
git_ver=$(git --version | awk '{print $3}')
echo "  git $git_ver"

# --- 步驟 2/3 下載 / 更新 ---
echo ""
echo -e "${CYAN}步驟 2/3  下載 DevKit${NC}"

if [ ! -e "$DEVKIT_DIR" ]; then
    echo "  clone $DEVKIT_REPO → $DEVKIT_DIR"
    git clone --depth=1 --branch "$DEVKIT_REF" "$DEVKIT_REPO" "$DEVKIT_DIR"
elif [ -d "$DEVKIT_DIR/.git" ]; then
    existing_remote=$(git -C "$DEVKIT_DIR" remote get-url origin 2>/dev/null || echo "")
    if [ "$existing_remote" != "$DEVKIT_REPO" ]; then
        print_error "$DEVKIT_DIR 已是另一個 git 倉庫（remote=$existing_remote）"
        echo "  請改用 DEVKIT_DIR 指定其他目錄，或手動處理現有目錄。" >&2
        exit 1
    fi
    echo "  $DEVKIT_DIR 已存在，執行 git pull --ff-only"
    git -C "$DEVKIT_DIR" pull --ff-only
else
    print_error "$DEVKIT_DIR 已存在但非 git 倉庫，為避免覆蓋請手動移除或改用 DEVKIT_DIR"
    exit 1
fi

# --- 步驟 3/3 本地安裝 ---
echo ""
echo -e "${CYAN}步驟 3/3  本地安裝${NC}"
exec "$DEVKIT_DIR/install.sh" --user --force --non-interactive
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x bootstrap.sh`

- [ ] **Step 3: Smoke check the script parses and `--help` works**

Run: `bash bootstrap.sh --help`
Expected: 印出 `DevKit 遠端安裝` 標題與環境變數說明、exit 0、沒有 syntax error。

- [ ] **Step 4: Run full test suite to confirm nothing else broke**

Run: `pnpm test`
Expected: 所有既有測試（install-sh + devkit-cli + clean-branch + version-check）仍綠；bootstrap.sh 本身不在 glob 範圍內。

- [ ] **Step 5: Commit**

```bash
git add bootstrap.sh
git commit -m "feat: [devkit] bootstrap.sh remote installer with git clone + exec install.sh"
```

---

### Task 8: Document `curl | bash` install + lifecycle subcommands

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

不動 `CLAUDE.md`（redirect 到 AGENTS.md）；不動 `UPGRADE.md`（與安裝無關）。

- [ ] **Step 1: Replace the install section of `README.md`**

在 `README.md` 中找到「🛠️ 安裝方式」段（約 161 行起），把「方法一」改為 `curl | bash`、原三方法降序。並補一段「更新／體檢／移除」介紹三個 `devkit --…` 子命令。

替換 `README.md:161-204` 整段為：

````markdown
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
````

注：上方 markdown 用四個反引號的 fenced block 包住巢狀 ``` —— 寫進 README.md 時請把外層的 ```` markdown ... ```` 拆掉，只留內層段落。

- [ ] **Step 2: Sync `AGENTS.md`**

`AGENTS.md:37-45` 的 `# Global Installation` 區塊替換為：

```markdown
# Global Installation
curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash
./install.sh --alias           # Local: add shell alias (recommended, most stable)
./install.sh --user            # Local: symlink to ~/.local/bin
./install.sh --system          # Local: symlink to /usr/local/bin (requires sudo)
./install.sh --user --force --non-interactive   # Non-interactive (bootstrap internal use)
./install.sh --uninstall

# Lifecycle subcommands (after bootstrap install)
devkit --update                # git pull --ff-only inside $SCRIPT_DIR
devkit --doctor                # health check; exit 1 if any 錯誤
devkit --uninstall             # remove symlinks + aliases (does not delete $SCRIPT_DIR)
```

- [ ] **Step 3: Visual smoke check**

Run: `sed -n '160,230p' README.md`
Expected: 「方法一」是 `curl … bootstrap.sh | bash`；緊接的「方法二／三／四」與「🔄 更新／體檢／移除」段落都存在且格式無亂。

Run: `sed -n '35,55p' AGENTS.md`
Expected: `Global Installation` 區塊已含 `curl … bootstrap.sh | bash` 與 `Lifecycle subcommands` 區塊。

- [ ] **Step 4: Run tests to confirm no test relied on README copy**

Run: `pnpm test`
Expected: 全綠。

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: [devkit] document curl|bash install + lifecycle subcommands"
```

---

## Manual Verification (post-Task 8)

`bootstrap.sh` 沒有自動化測試，依下列清單實測：

1. `curl -fsSL https://raw.githubusercontent.com/CarlLee1983/carl-dev-tools/main/bootstrap.sh | bash`
   → 三段流程（檢查環境 / 下載 DevKit / 本地安裝）、`~/.devkit` 出現、`~/.local/bin/devkit` 是 symlink
2. 同上重跑
   → `~/.devkit` 已存在 → 走 `git pull --ff-only` 路徑、輸出含「已存在，執行 git pull」
3. `DEVKIT_DIR=/tmp/devkit-test curl … | bash`
   → 安裝到 `/tmp/devkit-test`
4. `devkit --doctor`
   → 體檢報告完整、exit code 對
5. `devkit --update`（在 `~/.devkit` 上）
   → `git pull --ff-only`、印 before → after commit SHA 比較
6. `devkit --uninstall`
   → `~/.local/bin/devkit` 沒了、印 `rm -rf "~/.devkit"` 提示
7. 將 `devkit` 手動 `cp` 到 `/tmp/foo/`（非 git 目錄）後跑 `bash /tmp/foo/devkit --update`
   → 出現「DevKit 安裝目錄不是 git 倉庫」錯誤與 bootstrap 重裝指令
