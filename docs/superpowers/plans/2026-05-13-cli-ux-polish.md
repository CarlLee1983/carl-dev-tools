# DevKit CLI UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the `devkit` Bash dispatcher's CLI output so the default list, category view, and error paths read as professional, concise, scannable Traditional Chinese, while fixing the BSD-`sed` `Ugit`/`Uenv` label bug and adding Node-based smoke tests that lock the contract in.

**Architecture:** All user-facing behavior change is local to the `devkit` Bash script. We add a small `title_case` helper and a `print_error` helper inside the script, route error lines to stderr with an `錯誤：` prefix, replace decorative emoji headings with plain section titles (`分類`, `工具`, `使用方式`), and add a single Node `node:test` file under `tests/` that drives `bash devkit …` via `spawnSync` and asserts on ANSI-stripped output and exit codes. Discovery logic (`get_categories`, `get_category_tools`) and dispatch logic (`execute_bash_tool`, `execute_node_tool`) are untouched.

**Tech Stack:**
- Bash 3.2+ (macOS-compatible — no `\U` in `sed`, no associative arrays needed)
- Node.js `>=18 <24`, `node:test`, `node:assert/strict`, `node:child_process.spawnSync`
- pnpm test runner already wired in `package.json`

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `devkit` | Modify | Bash dispatcher; gains `title_case` + `print_error` helpers, restructured `show_all_tools`/`show_category_tools`, cleaner errors in `execute_tool`, simplified pre-execution line, consistent labels in interactive menus. |
| `tests/devkit-cli.test.js` | Create | Node smoke tests for the CLI UX contract: `--version`, default list, category view, unknown category, unknown tool. Uses `spawnSync('bash', ['devkit', …])` with an ANSI stripper. |

Discovery (`get_categories`, `get_category_tools`) and execution (`execute_bash_tool`, `execute_node_tool`) functions stay as-is — we only change presentation.

---

## Tasks

### Task 1: Scaffold CLI smoke test file with `--version` baseline

**Files:**
- Create: `tests/devkit-cli.test.js`

- [ ] **Step 1: Write the baseline test file**

Create `tests/devkit-cli.test.js` with the shared helper and one trivially-passing test so we know the harness works before we add failing assertions.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const devkitPath = resolve('devkit');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\[[0-9;]*m/g;

function stripAnsi(input) {
    return input.replace(ANSI_PATTERN, '');
}

function runDevkit(args = []) {
    const result = spawnSync('bash', [devkitPath, ...args], {
        encoding: 'utf8',
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

test('devkit --version prints a concise version line and exits 0', () => {
    const r = runDevkit(['--version']);
    assert.equal(r.status, 0, r.combined);
    assert.match(r.combined, /DevKit v\d+\.\d+\.\d+/);
});
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `pnpm test`
Expected: the new `devkit --version` test passes (current `show_version` already prints `DevKit v1.1.1`). Existing tests must still pass.

- [ ] **Step 3: Commit**

```bash
git add tests/devkit-cli.test.js
git commit -m "test: [devkit] scaffold CLI smoke tests with --version baseline"
```

---

### Task 2: Portable `title_case` helper — kill the `Ugit`/`Uenv` artifact

The root bug is `sed 's/./\U&/'` on lines 158, 165, 204, 401 of `devkit`. macOS BSD `sed` does not support the GNU `\U` escape, so it emits a literal `U` and leaves the original char untouched. Replace every call with a portable Bash helper.

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit` (add helpers after line 21; replace `sed 's/./\U&/'` everywhere)

- [ ] **Step 1: Add the failing regression test**

Append to `tests/devkit-cli.test.js`:

```javascript
test('devkit default output does not contain malformed Ugit/Uenv labels', () => {
    const r = runDevkit([]);
    assert.equal(r.status, 0, r.combined);
    assert.doesNotMatch(r.combined, /Ugit/);
    assert.doesNotMatch(r.combined, /Uenv/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: this new test FAILS — current `./devkit` output contains `Ugit` and `Uenv`.

- [ ] **Step 3: Add `title_case` and `print_error` helpers in `devkit`**

Edit `devkit`. Immediately after the color block ending at line 21 (`NC='\033[0m'`), insert the helpers:

```bash
# 將字串首字母轉為大寫（可攜帶式，不依賴 GNU sed \U）
title_case() {
    local word="$1"
    if [ -z "$word" ]; then
        printf ''
        return
    fi
    local first rest
    first=$(printf '%s' "${word:0:1}" | tr '[:lower:]' '[:upper:]')
    rest="${word:1}"
    printf '%s%s' "$first" "$rest"
}

# 統一錯誤輸出：紅色 + 「錯誤：」前綴 + stderr
print_error() {
    echo -e "${RED}錯誤：$1${NC}" >&2
}
```

- [ ] **Step 4: Replace every `sed 's/./\U&/'` call with `title_case`**

In `devkit`, replace the four occurrences of:

```bash
local category_display=$(echo "$category" | sed 's/./\U&/')
```

with:

```bash
local category_display
category_display=$(title_case "$category")
```

These appear in `show_all_tools` (twice — categories list and tools grouping), `show_category_tools`, and `interactive_category_menu`. Use Edit's `replace_all` to update all four at once.

- [ ] **Step 5: Trim `wc -l` output**

In `show_all_tools` and `interactive_menu`, `wc -l` emits leading whitespace on macOS (`       3`). Replace the two lines:

```bash
local tool_count=$(get_category_tools "$category" | wc -l)
```

with:

```bash
local tool_count
tool_count=$(get_category_tools "$category" | wc -l | tr -d '[:space:]')
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test`
Expected: the `Ugit/Uenv` regression test now PASSES; all earlier tests still pass.

Also sanity-check the live CLI:

Run: `./devkit | head -20`
Expected: section headings now show `Git` and `Env`, never `Ugit`/`Uenv`; tool counts render as `(3)` / `(1)` with no leading whitespace.

- [ ] **Step 7: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "fix: [devkit] portable title-case for category labels"
```

---

### Task 3: Restructure default list output (`./devkit`)

Replace the `🛠️  Development Toolkit` banner and `📂` / `🔧` / `💡` decorations with the spec's section model: product+version header, then `分類`, `工具`, `使用方式`. Color stays for scanability; emoji disappears from the normal-output path.

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit` (function `show_all_tools`, lines 142–178)

- [ ] **Step 1: Add the failing structural test**

Append to `tests/devkit-cli.test.js`:

```javascript
test('devkit default output uses the new section structure', () => {
    const r = runDevkit([]);
    assert.equal(r.status, 0, r.combined);
    assert.match(r.combined, /DevKit v\d+\.\d+\.\d+/);
    assert.match(r.combined, /^分類$/m);
    assert.match(r.combined, /^工具$/m);
    assert.match(r.combined, /^使用方式$/m);
    // categories still rendered with their lowercase slug for invocation
    assert.match(r.combined, /\bgit\b/);
    assert.match(r.combined, /\benv\b/);
    // tool names appear under the 工具 grouping
    assert.match(r.combined, /clean-branch/);
    assert.match(r.combined, /release-tag/);
    assert.match(r.combined, /sync-all/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — current output has `📂 可用分類：` not bare `分類`, `🔧 所有工具：` not bare `工具`, and `💡 使用方式：` not bare `使用方式`.

- [ ] **Step 3: Rewrite `show_all_tools`**

Replace the entire `show_all_tools` function in `devkit` with:

```bash
# 顯示所有工具清單
show_all_tools() {
    echo -e "${BOLD}DevKit v${VERSION}${NC}"
    echo ""

    local categories=($(get_categories))

    if [ ${#categories[@]} -eq 0 ]; then
        echo -e "${YELLOW}沒有找到任何工具${NC}"
        echo "請確認目錄結構完整：需要 bash-tools/ 和 node-tools/ 子目錄"
        return
    fi

    echo -e "${CYAN}分類${NC}"
    for category in "${categories[@]}"; do
        local tool_count
        tool_count=$(get_category_tools "$category" | wc -l | tr -d '[:space:]')
        local category_display
        category_display=$(title_case "$category")
        printf "  %-8s%s 相關工具 (%s)\n" "$category" "$category_display" "$tool_count"
    done

    echo ""
    echo -e "${CYAN}工具${NC}"
    for category in "${categories[@]}"; do
        local category_display
        category_display=$(title_case "$category")
        echo -e "${BOLD}  $category_display${NC}"
        get_category_tools "$category" | while IFS='|' read -r tool_name script_path description; do
            printf "    %-16s%s\n" "$tool_name" "$description"
        done
        echo ""
    done

    echo -e "${CYAN}使用方式${NC}"
    echo "  devkit <category>          顯示分類工具"
    echo "  devkit <category>:<tool>   執行指定工具"
    echo "  devkit --help              顯示完整說明"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: all `devkit-cli.test.js` tests pass.

Also visually inspect:

Run: `./devkit`
Expected: header `DevKit v1.1.1`, then bare `分類`, `工具`, `使用方式` headings (cyan), `Git` / `Env` group labels (bold), tool list aligned via `printf`.

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] restructure default list output with 分類/工具/使用方式 sections"
```

---

### Task 4: Restructure category view (`./devkit <category>`)

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit` (function `show_category_tools`, lines 181–222)

- [ ] **Step 1: Add the failing category-view test**

Append to `tests/devkit-cli.test.js`:

```javascript
test('devkit <category> shows a clean category view with usage hint', () => {
    const r = runDevkit(['git']);
    assert.equal(r.status, 0, r.combined);
    assert.doesNotMatch(r.combined, /Ugit/);
    assert.match(r.combined, /Git 工具/);
    assert.match(r.combined, /clean-branch/);
    assert.match(r.combined, /release-tag/);
    assert.match(r.combined, /sync-all/);
    assert.match(r.combined, /^使用方式$/m);
    assert.match(r.combined, /devkit git:<tool>/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — current heading is `🔧 Ugit 工具：`, and the `使用方式` block carries the leading `💡` emoji.

- [ ] **Step 3: Replace `show_category_tools`**

Replace the entire `show_category_tools` function in `devkit` with:

```bash
# 顯示特定分類的工具
show_category_tools() {
    local category="$1"

    local categories=($(get_categories))
    local category_exists=false

    for cat in "${categories[@]}"; do
        if [ "$cat" = "$category" ]; then
            category_exists=true
            break
        fi
    done

    if [ "$category_exists" = false ]; then
        print_error "分類 '$category' 不存在"
        {
            echo ""
            echo "可用分類"
            for cat in "${categories[@]}"; do
                echo "  $cat"
            done
        } >&2
        return 1
    fi

    local category_display
    category_display=$(title_case "$category")
    echo -e "${BOLD}${category_display} 工具${NC}"
    echo ""

    local has_tools=false
    while IFS='|' read -r tool_name script_path description; do
        has_tools=true
        printf "  %-16s%s\n" "$tool_name" "$description"
    done < <(get_category_tools "$category")

    if [ "$has_tools" = false ]; then
        echo -e "${YELLOW}該分類下沒有可用工具${NC}"
        return
    fi

    echo ""
    echo -e "${CYAN}使用方式${NC}"
    echo "  devkit ${category}:<tool>   執行指定工具"
}
```

Notes:
- We no longer rely on `local tools=($(get_category_tools …))` for the empty check — that splitting was buggy because descriptions contain spaces. The `has_tools` flag set inside the read-loop is safer.
- Error path goes to stderr and returns 1; the parent `main` propagates the exit code (its `*) show_category_tools "$1" ;;` branch already returns the function's status).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: the new test passes. Also verify visually:

Run: `./devkit git`
Expected: `Git 工具` bold heading, three tools aligned, then `使用方式` block with `devkit git:<tool>` hint.

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] clean category view with portable label and usage section"
```

---

### Task 5: Polish unknown-category error path

The path is already non-zero-exit; the polish drops the `❌` emoji, prefixes with `錯誤：`, routes to stderr, and lists available categories under a bare `可用分類` heading. Task 4 already added the stderr routing inside `show_category_tools` — this task locks the contract in tests.

**Files:**
- Modify: `tests/devkit-cli.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/devkit-cli.test.js`:

```javascript
test('devkit unknown category exits non-zero with a clear error and category list', () => {
    const r = runDevkit(['definitely-not-a-category']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：分類 'definitely-not-a-category' 不存在/);
    assert.match(r.combined, /^可用分類$/m);
    assert.match(r.combined, /\bgit\b/);
    assert.match(r.combined, /\benv\b/);
    // The error must not leak the old emoji-flagged format
    assert.doesNotMatch(r.combined, /❌/);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test`
Expected: PASS — Task 4 already wired the stderr + `錯誤：` format. If anything still fails (e.g. lingering `❌` on this path), fix it in `devkit` before moving on.

- [ ] **Step 3: Commit**

```bash
git add tests/devkit-cli.test.js
git commit -m "test: [devkit] lock unknown-category error contract"
```

---

### Task 6: Polish unknown-tool error path

The current `execute_tool` prints `❌ 工具 '…' 不存在` to stdout and, when the *category* itself does not exist, lists an empty "可用工具" block — confusing. Polish: route to stderr with `錯誤：` prefix, and if the category does not exist, route to the category-not-exist error instead of an empty tool list.

**Files:**
- Modify: `tests/devkit-cli.test.js`
- Modify: `devkit` (function `execute_tool`, lines 225–276; add `category_exists` helper just above it)

- [ ] **Step 1: Add the failing tests**

Append to `tests/devkit-cli.test.js`:

```javascript
test('devkit <existing-category>:<unknown-tool> exits non-zero with available tool list', () => {
    const r = runDevkit(['git:definitely-not-a-tool']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：工具 'git:definitely-not-a-tool' 不存在/);
    assert.match(r.combined, /git 可用工具/);
    assert.match(r.combined, /devkit git:clean-branch/);
    assert.doesNotMatch(r.combined, /❌/);
});

test('devkit <unknown-category>:<tool> routes to a category-not-exist error', () => {
    const r = runDevkit(['definitely-not-a-category:whatever']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：分類 'definitely-not-a-category' 不存在/);
    assert.match(r.combined, /^可用分類$/m);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — current output uses `❌`, prints to stdout, and on unknown category emits an empty `可用工具` list instead of routing to the category error.

- [ ] **Step 3: Add `category_exists` and rewrite `execute_tool`**

Edit `devkit`. Immediately above the existing `# 執行指定工具` comment (just before `execute_tool() {`), add:

```bash
# 判斷分類是否存在（給 execute_tool / show_category_tools 共用）
category_exists() {
    local target="$1"
    local cat
    for cat in $(get_categories); do
        [ "$cat" = "$target" ] && return 0
    done
    return 1
}
```

Then replace the entire body of `execute_tool` with:

```bash
execute_tool() {
    local tool_spec="$1"
    shift
    local args="$@"

    if [[ "$tool_spec" != *":"* ]]; then
        print_error "工具格式錯誤，應為 category:tool"
        return 1
    fi

    local category="${tool_spec%:*}"
    local tool_name="${tool_spec#*:}"

    if ! category_exists "$category"; then
        print_error "分類 '$category' 不存在"
        {
            echo ""
            echo "可用分類"
            for cat in $(get_categories); do
                echo "  $cat"
            done
        } >&2
        return 1
    fi

    local found_tool
    found_tool=$(get_category_tools "$category" | grep "^${tool_name}|")

    if [ -z "$found_tool" ]; then
        print_error "工具 '$tool_spec' 不存在"
        {
            echo ""
            echo "${category} 可用工具"
            get_category_tools "$category" | while IFS='|' read -r name path desc; do
                echo "  devkit ${category}:${name}"
            done
        } >&2
        return 1
    fi

    local script_path
    local description
    script_path=$(echo "$found_tool" | cut -d'|' -f2)
    description=$(echo "$found_tool" | cut -d'|' -f3)

    echo -e "${BLUE}執行：${tool_spec}${NC} — ${description}"
    echo ""

    if [ ! -f "$script_path" ]; then
        print_error "腳本檔案不存在：$script_path"
        return 1
    fi

    if [[ "$script_path" == *"/bash-tools/"* ]]; then
        execute_bash_tool "$script_path" $args
    elif [[ "$script_path" == *"/node-tools/"* ]]; then
        execute_node_tool "$category" "$tool_name" $args
    else
        print_error "無法識別工具類型：$script_path"
        return 1
    fi
}
```

Note: the simplified pre-execution line `執行：<tool_spec> — <description>` keeps the identifier visible (per spec) while collapsing the previous two-line emoji block into one.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all CLI tests pass.

Also visually:

Run: `./devkit git:definitely-not-a-tool; echo "exit=$?"`
Expected: red `錯誤：工具 'git:definitely-not-a-tool' 不存在` on stderr, then `git 可用工具` and the three `devkit git:<name>` hints, then `exit=1`.

Run: `./devkit foo:bar; echo "exit=$?"`
Expected: red `錯誤：分類 'foo' 不存在`, then `可用分類` with `git` and `env`, then `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add devkit tests/devkit-cli.test.js
git commit -m "feat: [devkit] cleaner errors for unknown tools and categories"
```

---

### Task 7: Trim non-error decorations in `execute_bash_tool` / `execute_node_tool`

These functions still use `⚠️` / `🚀` decorations on the *normal* path (`設定腳本執行權限`, `安裝共用依賴`, `安裝工具依賴`, `Node.js 版本 … 可能未經完整測試`) and use raw `❌` for hard errors. Reduce emoji on the normal-output paths and route the hard errors through `print_error`. No behavior change.

**Files:**
- Modify: `devkit` (functions `execute_bash_tool` lines 279–292, `execute_node_tool` lines 295–350)

- [ ] **Step 1: Replace the noisy lines**

Edit `devkit`. In `execute_bash_tool`, replace:

```bash
        echo -e "${YELLOW}⚠️  設定腳本執行權限...${NC}"
```

with:

```bash
        echo -e "${YELLOW}提示：設定腳本執行權限...${NC}"
```

In `execute_node_tool`, replace each of these:

```bash
        echo -e "${YELLOW}⚠️  Node.js 版本 $node_version 可能未經完整測試${NC}"
        echo -e "${CYAN}💡 建議使用 Node.js 18.x、20.x 或 22.x LTS 版本${NC}"
        echo -e "${CYAN}💡 如遇到問題，請參考 scripts/UPGRADE.md${NC}"
```

with:

```bash
        echo -e "${YELLOW}提示：Node.js 版本 $node_version 可能未經完整測試${NC}"
        echo -e "${CYAN}建議使用 Node.js 18.x、20.x 或 22.x LTS 版本${NC}"
        echo -e "${CYAN}如遇問題，請參考 scripts/UPGRADE.md${NC}"
```

And:

```bash
        echo -e "${YELLOW}⚠️  安裝共用依賴...${NC}"
```

with:

```bash
        echo -e "${YELLOW}提示：安裝共用依賴...${NC}"
```

And:

```bash
        echo -e "${YELLOW}⚠️  安裝工具依賴...${NC}"
```

with:

```bash
        echo -e "${YELLOW}提示：安裝工具依賴...${NC}"
```

Also route the two Node-error messages through `print_error`:

```bash
        echo -e "${RED}❌ 需要 Node.js 18+ 才能執行此工具${NC}"
```

becomes:

```bash
        print_error "需要 Node.js 18+ 才能執行此工具"
```

And:

```bash
        echo -e "${RED}❌ 需要 Node.js $min_version 或更高版本，當前版本: $node_version${NC}"
```

becomes:

```bash
        print_error "需要 Node.js $min_version 或更高版本，當前版本: $node_version"
```

- [ ] **Step 2: Syntax + test sweep**

Run: `bash -n devkit && pnpm test`
Expected: clean syntax, all tests still pass — these strings are not asserted on, but a syntax error in the script would break every `runDevkit()` call.

- [ ] **Step 3: Commit**

```bash
git add devkit
git commit -m "style: [devkit] drop decorative emoji from normal-output paths"
```

---

### Task 8: Align help text and interactive-menu headings with the new style

`show_help` and the two interactive-menu functions still use the old emoji-heavy style. The interactive menu is explicitly out of scope for *redesign*, but the broken `Ugit` heading inside it is a bug, and `show_help` is part of the CLI surface — keep both consistent without changing behavior.

**Files:**
- Modify: `devkit` (functions `show_help` lines 42–61, `interactive_menu` lines 353–393, `interactive_category_menu` lines 396–437)

- [ ] **Step 1: Update `show_help`**

Replace the entire `show_help` function with:

```bash
# 顯示使用說明
show_help() {
    show_version
    echo ""
    echo -e "${CYAN}使用方式${NC}"
    echo "  devkit [command] [options]"
    echo ""
    echo -e "${CYAN}命令${NC}"
    echo "  list                     顯示所有可用工具"
    echo "  <category>               顯示特定分類的工具"
    echo "  <category>:<tool>        執行指定工具"
    echo "  --interactive, -i        互動式選單"
    echo "  --help, -h               顯示此說明"
    echo "  --version, -v            顯示版本資訊"
    echo ""
    echo -e "${CYAN}範例${NC}"
    echo "  devkit                   顯示所有工具"
    echo "  devkit git               顯示 git 工具"
    echo "  devkit git:release-tag   執行版本標籤工具"
    echo "  devkit -i                互動式選單"
}
```

Bare cyan section headings, no trailing `：`, no inline `#` comment column on the example lines.

- [ ] **Step 2: Clean the interactive-menu headings**

In `interactive_menu`, replace:

```bash
        echo -e "${BOLD}🛠️  Development Toolkit - 互動式選單${NC}"
```

with:

```bash
        echo -e "${BOLD}DevKit v${VERSION} — 互動式選單${NC}"
```

In `interactive_category_menu`, replace:

```bash
        echo -e "${BOLD}🔧 $category_display 工具選單${NC}"
```

with:

```bash
        echo -e "${BOLD}${category_display} 工具選單${NC}"
```

The title-case fix already landed in Task 2 via `title_case`; this strips the leftover emoji.

- [ ] **Step 3: Syntax check and run tests**

Run: `bash -n devkit && pnpm test`
Expected: clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add devkit
git commit -m "style: [devkit] align help and interactive headings with new section style"
```

---

### Task 9: Final verification — lint and full test sweep

**Files:** none modified.

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: zero errors. (The new test file is the only JS added; the eslintrc allows `_`-prefixed unused vars, and the file has none.)

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: every test passes, including the existing `version-check.test.js`, `clean-branch.test.js`, every `node-tools/env/tests/**/*.test.js`, and all new `devkit-cli.test.js` tests.

- [ ] **Step 3: Manual contract walk**

Run each command and confirm the output matches the spec:

```bash
./devkit
./devkit git
./devkit env
./devkit unknown ; echo "exit=$?"
./devkit git:unknown ; echo "exit=$?"
./devkit --version
./devkit --help
```

Expected highlights:
- Header: `DevKit v1.1.1`
- Sections: bare `分類`, `工具`, `使用方式` (no leading emoji)
- Category labels: `Git`, `Env` (no `Ugit`/`Uenv`)
- Tool counts: `(3)`, `(1)` (no leading whitespace)
- Unknown category/tool: red `錯誤：…` on stderr, exit code `1`
- `./devkit --version`: single bold line `DevKit v1.1.1` + the tagline

- [ ] **Step 4: Nothing left to commit**

If everything is green and no files changed in this task, do **not** create an empty commit. The plan is complete.
