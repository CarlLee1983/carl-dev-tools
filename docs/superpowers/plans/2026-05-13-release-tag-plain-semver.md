# Release Tag — 純 SemVer 軌道支援 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `bash-tools/git/release-tag.sh` 上加上「無前綴 (plain SemVer)」版本軌道，與現有 `prefix/vX.Y.Z` 軌道並列，並補上對應的單元 + 整合測試與 README 範例。

**Architecture:** `SELECTED_PREFIX=""` 為「無前綴」哨兵語意，所有 tag 字串組裝統一走三個新 helper（`tag_glob` / `format_tag` / `parse_tag_version`）。`scan_tag_prefixes` / `select_prefix` 改名為 `scan_tag_tracks` / `select_track`，後者在所有路徑都把「(無前綴)」置頂。腳本同時加上 `DEVKIT_GIT_BIN` 注入點（沿用 `clean-branch.sh` 模式）與 `BASH_SOURCE`/`$0` 守衛，讓測試能 fake `git` 並能 `source` 腳本做 helper 單元測試。

**Tech Stack:**
- Bash 3.2+（macOS 相容；無 GNU 擴充）
- Node.js `>=18 <24`、`node:test`、`node:assert/strict`、`node:child_process.spawnSync`
- 沿用 `tests/clean-branch.test.js` 的 fake git binary 模式

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `bash-tools/git/release-tag.sh` | Modify | 加上 `DEVKIT_GIT_BIN` 注入、source guard、三個 helper、改名 `scan_tag_tracks` / `select_track`、把 `get_latest_version` / `check_commit_sha` / `create_tag` 內的硬編碼 prefix 換成 helper 呼叫；`main()` 重新串接 |
| `tests/release-tag.test.js` | Create | 三組測試：helper 單元（`tag_glob` / `format_tag` / `parse_tag_version`）、選單行為（5 種 tag 分布）、整合（驗證 `git tag -a` 收到的最終參數） |
| `bash-tools/git/README.md` | Modify | 更新「版本標籤範例」與功能特色段落，反映新的軌道選單輸出 |

互動式主流程 (`check_working_directory` / `check_and_select_branch` / `fetch_remote_tags` / `select_increment_type` / `create_tag` 的確認流程) 行為不變，只在 tag 名稱字串組裝這層做替換。

---

## Tasks

### Task 1: 注入 `DEVKIT_GIT_BIN` 並加上 source guard

只做機械替換 + 結構性 guard，不動任何業務邏輯；先讓後續任務能 fake git 並能 `source` 腳本驗 helper。

**Files:**
- Modify: `bash-tools/git/release-tag.sh`
- Create: `tests/release-tag.test.js`

- [ ] **Step 1: 在 `bash-tools/git/release-tag.sh` 加入 `GIT_BIN` 變數**

於全域變數區塊（目前第 18–24 行）末尾新增一行，緊接在 `AVAILABLE_MAIN_BRANCHES=()` 之後：

```bash
GIT_BIN="${DEVKIT_GIT_BIN:-git}"
```

- [ ] **Step 2: 把腳本內所有 `git ` 指令替換為 `"$GIT_BIN" `**

在 `release-tag.sh` 中需替換的位置（共 20 處，行號以目前檔案為準）：

```
55  git status --porcelain          → "$GIT_BIN" status --porcelain
80  git remote -v                    → "$GIT_BIN" remote -v
86  git fetch --tags --prune-tags    → "$GIT_BIN" fetch --tags --prune-tags
100 git rev-parse HEAD               → "$GIT_BIN" rev-parse HEAD
104 git tag -l "${prefix}/v*"        → "$GIT_BIN" tag -l "${prefix}/v*"
114 git rev-list -n 1 "$latest_tag"  → "$GIT_BIN" rev-list -n 1 "$latest_tag"
143 git branch -a                    → "$GIT_BIN" branch -a
170 git branch --show-current        → "$GIT_BIN" branch --show-current
242 git status --porcelain           → "$GIT_BIN" status --porcelain
251 git checkout "$selected_branch"  → "$GIT_BIN" checkout "$selected_branch"
256 git pull origin "$selected_branch" → "$GIT_BIN" pull origin "$selected_branch"
284 git tag -l                       → "$GIT_BIN" tag -l
311 git tag -l                       → "$GIT_BIN" tag -l
356 git tag -l "${prefix}/v*"        → "$GIT_BIN" tag -l "${prefix}/v*"
455 git fetch --tags                 → "$GIT_BIN" fetch --tags
458 git tag -l                       → "$GIT_BIN" tag -l
464 git ls-remote --tags origin      → "$GIT_BIN" ls-remote --tags origin
494 git tag -a "$tag_name" -m ...    → "$GIT_BIN" tag -a "$tag_name" -m ...
500 git push origin "$tag_name"      → "$GIT_BIN" push origin "$tag_name"
518 git rev-parse --git-dir          → "$GIT_BIN" rev-parse --git-dir
```

實作方式：對 `bash-tools/git/release-tag.sh` 執行下列 sed 命令（macOS BSD sed 語法），然後手動驗證沒有誤傷：

```bash
sed -i '' -E 's/(^|[^"$])\bgit ([a-z-]+|--git-dir)/\1"$GIT_BIN" \2/g' bash-tools/git/release-tag.sh
```

- [ ] **Step 3: 驗證替換完整且沒有誤傷**

Run: `grep -nE '(^|[^"$])\bgit ' bash-tools/git/release-tag.sh | grep -v '\./git/release-tag\.sh' | grep -v 'Git ' | grep -v '在 git '`
Expected: 空輸出。任何剩下的 `git ` 都是註解內的中文敘述或 path（例如 `./git/release-tag.sh`），不應被替換。

Run: `grep -nE '"\$GIT_BIN" ' bash-tools/git/release-tag.sh | wc -l | tr -d ' '`
Expected: `20`

- [ ] **Step 4: 包上 source-vs-execute guard**

目前檔案最末段（從 `# 解析命令列參數` 開始到 `main` 為止）是無條件執行的。改成只在「直接執行」時跑：

替換 `bash-tools/git/release-tag.sh` 從 `# 解析命令列參數` 到檔尾的整段為：

```bash
# 僅在被直接執行時跑 CLI；被 source 時保留函式供測試使用
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # 解析命令列參數
    while [[ $# -gt 0 ]]; do
        case $1 in
            --push)
                PUSH_TO_REMOTE=true
                shift
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}❌ 未知參數：$1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    # 執行主程式
    main
fi
```

- [ ] **Step 5: 建立 `tests/release-tag.test.js` 骨架**

新增檔案 `tests/release-tag.test.js`：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('bash-tools/git/release-tag.sh');

/**
 * 建一支假的 git binary，依照測試情境回應 tag/rev-parse/branch 等子指令。
 * tags 透過檔案傳遞，避免 quoting 噩夢。
 */
function makeFakeGit(dir, {
    tags = [],
    head = 'aaaaaaaaaaaa',
    tagSha = 'bbbbbbbbbbbb',
    currentBranch = 'main',
    branches = ['main'],
    remoteTags = [],
    name = 'git',
} = {}) {
    const logPath = join(dir, `${name}.log`);
    const tagsFile = join(dir, `${name}.tags`);
    const remoteTagsFile = join(dir, `${name}.remote-tags`);
    const branchesFile = join(dir, `${name}.branches`);
    const binPath = join(dir, name);

    writeFileSync(tagsFile, tags.length ? tags.join('\n') + '\n' : '');
    writeFileSync(remoteTagsFile, remoteTags.map(t => `deadbeef refs/tags/${t}`).join('\n') + (remoteTags.length ? '\n' : ''));
    writeFileSync(branchesFile, branches.map(b => `  ${b}`).join('\n') + (branches.length ? '\n' : ''));

    writeFileSync(binPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
TAGS_FILE=${JSON.stringify(tagsFile)}
REMOTE_TAGS_FILE=${JSON.stringify(remoteTagsFile)}
BRANCHES_FILE=${JSON.stringify(branchesFile)}
case "$1" in
  rev-parse)
    case "$2" in
      --git-dir) echo ".git" ;;
      HEAD) echo ${JSON.stringify(head)} ;;
    esac
    exit 0 ;;
  status) exit 0 ;;
  branch)
    case "$2" in
      --show-current) echo ${JSON.stringify(currentBranch)} ;;
      -a) cat "$BRANCHES_FILE" ;;
    esac
    exit 0 ;;
  remote)
    [[ "$2" == -v ]] && echo "origin git@example.com:repo.git (fetch)"
    exit 0 ;;
  fetch) exit 0 ;;
  tag)
    if [[ "$2" == -l ]]; then
      if [[ -n "\${3:-}" ]]; then
        pattern="$3"
        regex=$(printf '%s' "$pattern" | sed 's/\\./\\\\./g; s/\\*/.*/g')
        grep -E "^\${regex}\\$" "$TAGS_FILE" 2>/dev/null || true
      else
        cat "$TAGS_FILE"
      fi
      exit 0
    fi
    if [[ "$2" == -a ]]; then exit 0; fi
    ;;
  rev-list) echo ${JSON.stringify(tagSha)}; exit 0 ;;
  ls-remote) cat "$REMOTE_TAGS_FILE"; exit 0 ;;
  push|checkout|pull) exit 0 ;;
esac
exit 0
`);
    chmodSync(binPath, 0o755);
    return { binPath, logPath, tagsFile };
}

function runReleaseTag({ args = ['--force'], input = '', fakeOpts = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'release-tag-test-'));
    const fake = makeFakeGit(dir, fakeOpts);
    const result = spawnSync('bash', [scriptPath, ...args], {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            DEVKIT_GIT_BIN: fake.binPath,
        },
    });
    return {
        ...result,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        log: readFileSync(fake.logPath, 'utf8'),
    };
}

function runHelper(snippet) {
    return spawnSync('bash', ['-c', `source "${scriptPath}"; ${snippet}`], {
        encoding: 'utf8',
    });
}

test('release-tag scaffold: --help exits 0 without touching git', () => {
    const r = spawnSync('bash', [scriptPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Git 智慧版本標籤工具/);
});

test('release-tag scaffold: source guard prevents main() from running when sourced', () => {
    const r = runHelper('echo "sourced ok"');
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /sourced ok/);
    // 不應該看到 main() 第一行的 banner
    assert.doesNotMatch(r.stdout ?? '', /🏷️/);
});
```

- [ ] **Step 6: 跑測試確認骨架可運作**

Run: `pnpm test`
Expected: 新檔兩個測試全綠；既有 `tests/clean-branch.test.js` / `tests/devkit-cli.test.js` / `tests/install-sh.test.js` / `tests/version-check.test.js` / `node-tools/env/tests/**` 仍全綠。

- [ ] **Step 7: Commit**

```bash
git add bash-tools/git/release-tag.sh tests/release-tag.test.js
git commit -m "test: [release-tag] inject DEVKIT_GIT_BIN and source guard for TDD"
```

---

### Task 2: `tag_glob` helper（TDD）

**Files:**
- Modify: `tests/release-tag.test.js`
- Modify: `bash-tools/git/release-tag.sh`

- [ ] **Step 1: 寫失敗測試**

在 `tests/release-tag.test.js` 末尾附加：

```javascript
test('tag_glob: empty prefix returns v*', () => {
    const r = runHelper('printf "%s" "$(tag_glob "")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'v*');
});

test('tag_glob: non-empty prefix returns prefix/v*', () => {
    const r = runHelper('printf "%s" "$(tag_glob "release")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'release/v*');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test`
Expected: 兩個 `tag_glob` 測試 FAIL，錯誤訊息類似 `tag_glob: command not found`。

- [ ] **Step 3: 實作 `tag_glob`**

在 `bash-tools/git/release-tag.sh` 的全域變數區塊之後（`GIT_BIN=` 那行之後、`# 顯示使用說明` 之前）插入 helper 區塊：

```bash
# --- Tag 字串組裝 helper（空 prefix = 純 SemVer 軌道）---
tag_glob() {
    local prefix="$1"
    if [ -z "$prefix" ]; then
        printf 'v*'
    else
        printf '%s/v*' "$prefix"
    fi
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test`
Expected: `tag_glob` 兩個測試 PASS，其他既有測試仍綠。

- [ ] **Step 5: Commit**

```bash
git add bash-tools/git/release-tag.sh tests/release-tag.test.js
git commit -m "feat: [release-tag] add tag_glob helper for prefix/plain dispatch"
```

---

### Task 3: `format_tag` helper（TDD）

**Files:**
- Modify: `tests/release-tag.test.js`
- Modify: `bash-tools/git/release-tag.sh`

- [ ] **Step 1: 寫失敗測試**

在 `tests/release-tag.test.js` 末尾附加：

```javascript
test('format_tag: empty prefix returns v<version>', () => {
    const r = runHelper('printf "%s" "$(format_tag "" "1.2.3")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'v1.2.3');
});

test('format_tag: non-empty prefix returns prefix/v<version>', () => {
    const r = runHelper('printf "%s" "$(format_tag "release" "1.2.3")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'release/v1.2.3');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test`
Expected: 兩個 `format_tag` 測試 FAIL。

- [ ] **Step 3: 實作 `format_tag`**

在 `tag_glob` 函式之後接著加入：

```bash
format_tag() {
    local prefix="$1"
    local version="$2"
    if [ -z "$prefix" ]; then
        printf 'v%s' "$version"
    else
        printf '%s/v%s' "$prefix" "$version"
    fi
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test`
Expected: `format_tag` 兩個測試 PASS。

- [ ] **Step 5: Commit**

```bash
git add bash-tools/git/release-tag.sh tests/release-tag.test.js
git commit -m "feat: [release-tag] add format_tag helper for tag name assembly"
```

---

### Task 4: `parse_tag_version` helper（TDD）

**Files:**
- Modify: `tests/release-tag.test.js`
- Modify: `bash-tools/git/release-tag.sh`

- [ ] **Step 1: 寫失敗測試**

在 `tests/release-tag.test.js` 末尾附加：

```javascript
test('parse_tag_version: strips leading v from plain semver tag', () => {
    const r = runHelper('printf "%s" "$(parse_tag_version "v1.2.3" "")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '1.2.3');
});

test('parse_tag_version: strips prefix/v from prefixed tag', () => {
    const r = runHelper('printf "%s" "$(parse_tag_version "release/v1.2.3" "release")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '1.2.3');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test`
Expected: 兩個 `parse_tag_version` 測試 FAIL。

- [ ] **Step 3: 實作 `parse_tag_version`**

在 `format_tag` 函式之後接著加入：

```bash
parse_tag_version() {
    local tag="$1"
    local prefix="$2"
    if [ -z "$prefix" ]; then
        printf '%s' "${tag#v}"
    else
        printf '%s' "${tag#${prefix}/v}"
    fi
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test`
Expected: `parse_tag_version` 兩個測試 PASS。三個 helper 都完成。

- [ ] **Step 5: Commit**

```bash
git add bash-tools/git/release-tag.sh tests/release-tag.test.js
git commit -m "feat: [release-tag] add parse_tag_version helper"
```

---

### Task 5: 既有 tag 操作改走 helper（純重構）

把 `get_latest_version` / `check_commit_sha` / `create_tag` 內硬編碼的 `${prefix}/v*` 與 `${SELECTED_PREFIX}/v${NEW_VERSION}` 統一改走 helper。這一步不改外部行為，仍是 prefix-only 流程；只是讓後續 Task 6 的「空 prefix 也能跑」自動成立。

**Files:**
- Modify: `bash-tools/git/release-tag.sh`

- [ ] **Step 1: 修改 `get_latest_version`**

把目前 `get_latest_version` 函式整個（目前約第 352–365 行）替換為：

```bash
# 獲取指定 prefix 的最新版本（prefix 為空 = 純 SemVer 軌道）
get_latest_version() {
    local prefix="$1"
    local glob
    glob=$(tag_glob "$prefix")

    local latest_tag
    latest_tag=$("$GIT_BIN" tag -l "$glob" 2>/dev/null | sort -V | tail -n1)

    if [ -z "$latest_tag" ]; then
        CURRENT_VERSION="0.0.0"
    else
        CURRENT_VERSION=$(parse_tag_version "$latest_tag" "$prefix")
    fi

    local display_tag
    display_tag=$(format_tag "$prefix" "$CURRENT_VERSION")
    echo -e "${BLUE}📍 當前最新版本：${display_tag}${NC}"
}
```

- [ ] **Step 2: 修改 `check_commit_sha`**

把 `check_commit_sha` 函式內這一行：

```bash
    latest_tag=$("$GIT_BIN" tag -l "${prefix}/v*" 2>/dev/null | sort -V | tail -n1)
```

改成：

```bash
    local glob
    glob=$(tag_glob "$prefix")
    latest_tag=$("$GIT_BIN" tag -l "$glob" 2>/dev/null | sort -V | tail -n1)
```

- [ ] **Step 3: 修改 `create_tag`**

把 `create_tag` 函式開頭這一行：

```bash
    local tag_name="${SELECTED_PREFIX}/v${NEW_VERSION}"
```

改成：

```bash
    local tag_name
    tag_name=$(format_tag "$SELECTED_PREFIX" "$NEW_VERSION")
```

`git tag -l | grep -q "^${tag_name}$"` 與 `git ls-remote --tags origin | grep -q "refs/tags/${tag_name}$"` 已經是用變數 `$tag_name`，不需再動。

- [ ] **Step 4: 跑測試確認沒有迴歸**

Run: `pnpm test`
Expected: 既有測試（含 Task 1–4 的）全綠。

也快速肉眼跑一次 `--help`：

Run: `bash bash-tools/git/release-tag.sh --help`
Expected: 顯示說明文字、exit 0。

- [ ] **Step 5: Commit**

```bash
git add bash-tools/git/release-tag.sh
git commit -m "refactor: [release-tag] route tag operations through helpers"
```

---

### Task 6: `scan_tag_tracks` + `select_track`（TDD）

把 `scan_tag_prefixes` 改名 `scan_tag_tracks` 並加上 plain semver 偵測；把 `select_prefix` 改名 `select_track` 並把「(無前綴)」永遠置頂；零 tag 時改先問「是否要加上 prefix?（y/N）」，預設 N 走無前綴。

**Files:**
- Modify: `tests/release-tag.test.js`
- Modify: `bash-tools/git/release-tag.sh`

- [ ] **Step 1: 寫失敗的選單測試**

在 `tests/release-tag.test.js` 末尾附加：

```javascript
test('select_track: mixed tags show (無前綴) first then existing prefixes', () => {
    const r = runReleaseTag({
        input: '1\n1\n', // 選軌道 1 (無前綴)、增量 1 (patch)
        fakeOpts: {
            tags: ['v1.1.0', 'v1.1.1', 'release/v1.2.3'],
        },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // 選單置頂
    assert.match(r.stdout, /1\. \(無前綴\) — 目前 v1\.1\.1/);
    assert.match(r.stdout, /2\. release\/ — 目前 release\/v1\.2\.3/);
    assert.match(r.stdout, /✅ 已選擇軌道：\(無前綴\)/);
});

test('select_track: plain-only tags still show (無前綴) as the lone option', () => {
    const r = runReleaseTag({
        input: '1\n1\n',
        fakeOpts: { tags: ['v1.0.0', 'v1.1.0'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1\. \(無前綴\) — 目前 v1\.1\.0/);
    assert.doesNotMatch(r.stdout, /2\. /);
    assert.match(r.stdout, /✅ 已選擇軌道：\(無前綴\)/);
});

test('select_track: prefix-only tags show (無前綴) — 將建立 v0.0.1 as top entry', () => {
    const r = runReleaseTag({
        input: '2\n1\n', // 選軌道 2 (release/)
        fakeOpts: { tags: ['release/v1.2.3'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1\. \(無前綴\) — 將建立 v0\.0\.1/);
    assert.match(r.stdout, /2\. release\/ — 目前 release\/v1\.2\.3/);
    assert.match(r.stdout, /✅ 已選擇軌道：release\//);
});

test('select_track: zero tags + default N creates plain v0.0.1', () => {
    const r = runReleaseTag({
        input: '\n1\n', // Enter 走預設 N、增量 1
        fakeOpts: { tags: [] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /是否要加上 prefix？\(y\/N\)/);
    assert.match(r.stdout, /將建立第一個標籤：v0\.0\.1/);
});

test('select_track: zero tags + Y prompts for prefix and creates release/v0.0.1', () => {
    const r = runReleaseTag({
        input: 'y\nrelease\n1\n',
        fakeOpts: { tags: [] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /是否要加上 prefix？\(y\/N\)/);
    assert.match(r.stdout, /將建立第一個標籤：release\/v0\.0\.1/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test`
Expected: 五個新測試 FAIL（現有 `scan_tag_prefixes` / `select_prefix` 沒有「(無前綴)」概念，零 tag 路徑也沒有「加 prefix?」提問）。

- [ ] **Step 3: 替換 `scan_tag_prefixes` 為 `scan_tag_tracks`**

把目前 `scan_tag_prefixes` 函式（目前約第 278–306 行）整段替換為：

```bash
# 全域：scan_tag_tracks 寫入下列變數供 select_track / 後續流程使用
HAS_ANY_TAGS=false
HAS_PLAIN_SEMVER=false
PREFIX_LIST=()

# 掃描專案版本軌道（prefix + 純 SemVer）
scan_tag_tracks() {
    echo -e "${BLUE}🔍 掃描專案版本軌道...${NC}"

    HAS_ANY_TAGS=false
    HAS_PLAIN_SEMVER=false
    PREFIX_LIST=()

    local all_tags
    all_tags=$("$GIT_BIN" tag -l 2>/dev/null | sort -V)

    if [ -z "$all_tags" ]; then
        echo -e "${YELLOW}⚠️  專案中沒有任何標籤${NC}"
        return 0
    fi

    HAS_ANY_TAGS=true

    if echo "$all_tags" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
        HAS_PLAIN_SEMVER=true
    fi

    local prefixes
    prefixes=$(echo "$all_tags" | grep -E '^[^/]+/v[0-9]+\.[0-9]+\.[0-9]+' | cut -d'/' -f1 | sort -u)
    if [ -n "$prefixes" ]; then
        while IFS= read -r p; do
            PREFIX_LIST+=("$p")
        done <<< "$prefixes"
    fi

    echo -e "${GREEN}✅ 找到以下版本軌道：${NC}"
    local idx=1
    if [ "$HAS_PLAIN_SEMVER" = true ]; then
        local plain_latest
        plain_latest=$(echo "$all_tags" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1)
        echo "  ${idx}. (無前綴) — 目前 ${plain_latest}"
    else
        echo "  ${idx}. (無前綴) — 將建立 v0.0.1"
    fi
    idx=$((idx+1))
    for p in "${PREFIX_LIST[@]}"; do
        local pl
        pl=$("$GIT_BIN" tag -l "${p}/v*" 2>/dev/null | sort -V | tail -n1)
        echo "  ${idx}. ${p}/ — 目前 ${pl}"
        idx=$((idx+1))
    done

    return 0
}
```

- [ ] **Step 4: 替換 `select_prefix` 為 `select_track`**

把目前 `select_prefix` 函式（目前約第 308–349 行）整段替換為：

```bash
# 選擇要操作的版本軌道（"(無前綴)" 永遠置頂）
select_track() {
    if [ "$HAS_ANY_TAGS" = false ]; then
        # 零 tag：問是否要加 prefix，預設 N → 純 SemVer
        echo ""
        read -p "是否要加上 prefix？(y/N): " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${CYAN}請輸入新的標籤前綴（例如：release, testing, hotfix）：${NC}"
            read -r SELECTED_PREFIX
            if [ -z "$SELECTED_PREFIX" ]; then
                echo -e "${RED}❌ 前綴不能為空${NC}"
                exit 1
            fi
            CURRENT_VERSION="0.0.0"
            echo -e "${BLUE}📍 將建立第一個標籤：${SELECTED_PREFIX}/v0.0.1${NC}"
        else
            SELECTED_PREFIX=""
            CURRENT_VERSION="0.0.0"
            echo -e "${BLUE}📍 將建立第一個標籤：v0.0.1${NC}"
        fi
        return 0
    fi

    # 有 tag：選單第 1 項固定為 (無前綴)，其後接 PREFIX_LIST
    local total=$(( ${#PREFIX_LIST[@]} + 1 ))
    echo ""
    echo -e "${CYAN}請選擇要操作的版本軌道：${NC}"
    while true; do
        read -p "請輸入編號 (1-${total}): " -r choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$total" ]; then
            if [ "$choice" -eq 1 ]; then
                SELECTED_PREFIX=""
                echo -e "${GREEN}✅ 已選擇軌道：(無前綴)${NC}"
            else
                SELECTED_PREFIX="${PREFIX_LIST[$((choice-2))]}"
                echo -e "${GREEN}✅ 已選擇軌道：${SELECTED_PREFIX}/${NC}"
            fi
            break
        else
            echo -e "${RED}❌ 請輸入有效的編號 (1-${total})${NC}"
        fi
    done
}
```

- [ ] **Step 5: 改寫 `main()` 串接新函式**

把 `main()` 內這一段：

```bash
    # 掃描標籤前綴
    if scan_tag_prefixes; then
        # 選擇前綴
        select_prefix

        # 獲取最新版本
        get_latest_version "$SELECTED_PREFIX"
    else
        # 沒有現有標籤，建立第一個
        select_prefix
    fi
```

替換為：

```bash
    # 掃描版本軌道（prefix + 純 SemVer）
    scan_tag_tracks

    # 選擇版本軌道
    select_track

    # 取得目前該軌道的最新版本（軌道為空字串時走純 SemVer）
    if [ "$HAS_ANY_TAGS" = true ]; then
        get_latest_version "$SELECTED_PREFIX"
    fi
```

備註：零 tag 路徑由 `select_track` 自己印「將建立第一個標籤：…」並把 `CURRENT_VERSION` 設為 `0.0.0`，不再需要 `get_latest_version`。

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test`
Expected: Task 6 的五個選單測試 PASS；既有測試全綠。

- [ ] **Step 7: Commit**

```bash
git add bash-tools/git/release-tag.sh tests/release-tag.test.js
git commit -m "feat: [release-tag] add plain SemVer track alongside prefix tracks"
```

---

### Task 7: 整合測試 — 確認 `git tag -a` 收到正確參數

驗證最終 fake git 收到的 `tag -a …` 在兩個軌道下都正確；這是把 Task 2–6 串起來的回歸網。

**Files:**
- Modify: `tests/release-tag.test.js`

- [ ] **Step 1: 寫整合測試**

在 `tests/release-tag.test.js` 末尾附加：

```javascript
test('integration: plain track patch bump runs git tag -a v1.1.2', () => {
    const r = runReleaseTag({
        input: '1\n1\n', // 選軌道 1 (無前綴)、patch
        fakeOpts: { tags: ['v1.1.1'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.log, /^tag -a v1\.1\.2 -m Release version 1\.1\.2$/m);
    assert.doesNotMatch(r.log, /^tag -a \/v/m);
});

test('integration: prefix track patch bump runs git tag -a release/v1.2.4', () => {
    const r = runReleaseTag({
        input: '2\n1\n', // 選軌道 2 (release/)、patch
        fakeOpts: { tags: ['v1.0.0', 'release/v1.2.3'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.log, /^tag -a release\/v1\.2\.4 -m Release version 1\.2\.4$/m);
});
```

- [ ] **Step 2: 跑測試**

Run: `pnpm test`
Expected: 兩個整合測試 PASS（Task 6 完成後即應通過）；其他全綠。

- [ ] **Step 3: Commit**

```bash
git add tests/release-tag.test.js
git commit -m "test: [release-tag] integration coverage for plain and prefix bumps"
```

---

### Task 8: 更新 `bash-tools/git/README.md` 範例與功能說明

讓文件範例反映新的軌道選單，避免後續漂移。

**Files:**
- Modify: `bash-tools/git/README.md`

- [ ] **Step 1: 更新功能特色段落**

把 `bash-tools/git/README.md` 內 release-tag.sh 區塊的功能特色清單（目前第 73–81 行）中：

```
- 🔍 自動掃描標籤前綴（release/, testing/, hotfix/ 等）
- 🎯 互動式前綴選擇和版本遞增
```

替換為：

```
- 🔍 自動掃描標籤軌道：純 SemVer（v1.2.3）與 prefix（release/v1.2.3）並列
- 🎯 互動式軌道選擇與版本遞增（patch / minor / major）
```

- [ ] **Step 2: 改寫範例輸出**

把「### 版本標籤範例」整段（目前第 143–209 行，從開頭的 ```` ```bash ```` 到對應的 ```` ``` ````）整個替換為：

````markdown
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
````

- [ ] **Step 3: 肉眼快檢**

Run: `grep -n "(無前綴)" bash-tools/git/README.md`
Expected: 至少 1 行出現「(無前綴) — 目前 v1.1.1」。

- [ ] **Step 4: Commit**

```bash
git add bash-tools/git/README.md
git commit -m "docs: [release-tag] document plain SemVer track in interactive example"
```

---

## Self-Review

**Spec coverage:**
- 「無前綴」軌道 + 互動式選擇 → Task 6（`select_track` 內 SELECTED_PREFIX="" 路徑）+ Task 7 整合測試
- 兩種軌道並列、可共存 → Task 6 的 mixed-tag 測試 + 範例（Task 8）
- 對既有 `prefix/vX.Y.Z` 流程相容 → Task 7 的 prefix 整合測試
- 三個新 helper（`tag_glob` / `format_tag` / `parse_tag_version`） → Task 2 / 3 / 4
- `scan_tag_prefixes` 改名 + plain semver 偵測 → Task 6 Step 3
- `select_prefix` 改名 + 「(無前綴)」置頂 + 零 tag 詢問 → Task 6 Step 4
- `get_latest_version` / `check_commit_sha` / `create_tag` 改用 helper → Task 5
- `select_increment_type` 不動 → 計畫沒有 touch 該函式 ✓
- `DEVKIT_GIT_BIN` 注入 → Task 1 Step 1–2
- 錯誤處理：零 tag + Y + 空輸入仍 `❌ 前綴不能為空 / exit 1` → Task 6 Step 4 內保留原邏輯
- 測試 1–6（helper）→ Task 2 / 3 / 4；測試 7–11（選單）→ Task 6；測試 12–13（整合）→ Task 7
- README 更新 → Task 8

**Placeholder scan:** 無 TBD / "implement later" / 「Similar to Task N」等模糊指令；每個 code step 都附完整片段。

**Type consistency:**
- `SELECTED_PREFIX` 在所有 task 都是 string，空字串 = 純 SemVer 哨兵 ✓
- `HAS_ANY_TAGS` / `HAS_PLAIN_SEMVER` 統一用 `true` / `false` 字串（Bash 慣例）✓
- `PREFIX_LIST` 是 array，所有迴圈用 `"${PREFIX_LIST[@]}"` 展開 ✓
- helper 名稱 `tag_glob` / `format_tag` / `parse_tag_version` 在每個 task 引用一致 ✓
- 函式新名稱 `scan_tag_tracks` / `select_track` 在 Task 6 內三處（定義 + main() 呼叫）都對齊 ✓
- 測試的 `runReleaseTag` / `runHelper` / `makeFakeGit` 介面跨 task 一致 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-release-tag-plain-semver.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 我每個 task 派一個新 subagent、task 間做 review；快速迭代、context 乾淨。

**2. Inline Execution** — 在本 session 用 executing-plans 直接跑、批次 + checkpoint 介入。

Which approach?
