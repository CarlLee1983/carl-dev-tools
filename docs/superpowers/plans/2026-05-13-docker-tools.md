# Docker Tools 第一版 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `bash-tools/` 新增 `docker` 類別，提供 `docker:doctor`（健康檢查）與 `docker:clean`（保守清理）兩支 Bash 工具，並補上 Node 測試與文件；不動 DevKit dispatcher。

**Architecture:** 沿用 `bash-tools/git/release-tag.sh` 的「`# DEVKIT_DESC` 頭註記 + `DEVKIT_*_BIN` 注入 + `BASH_SOURCE`/`$0` 守衛」模式。`doctor.sh` 與 `clean.sh` 都讀取 `DEVKIT_DOCKER_BIN`（預設 `docker`），測試透過 fake docker 二進位記錄參數呼叫，不依賴本機 Docker daemon。`clean.sh` 對 `--volumes` 採固定片語 `DELETE_DOCKER_VOLUMES` 二次確認，即使 `--force` 也擋。

**Tech Stack:**
- Bash 3.2+（macOS 內建相容，不使用 GNU 擴充）
- Node.js `>=18 <24`、`node:test`、`node:assert/strict`、`node:child_process.spawnSync`
- 沿用 `tests/release-tag.test.js` / `tests/clean-branch.test.js` 的 fake binary 模式

---

## 範圍檢查

本計畫只涵蓋一個獨立子系統：「Docker 類別第一版兩支工具」。屬於原子範圍，不需再拆。Compose 操作、Docker Desktop 自動啟動、Node tool 版本皆屬於非目標，由後續迭代另開計畫。

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `bash-tools/docker/doctor.sh` | Create | 健康檢查：依序呼叫 `docker info` / `version` / `compose version` / `system df`；`docker info` 失敗時 exit 1。檔頭含 `# DEVKIT_DESC`、注入 `DOCKER_BIN`、加 source guard。 |
| `bash-tools/docker/clean.sh` | Create | 保守清理：預設透過 `docker system prune --force` 清掉 stopped containers / unused images / unused networks / build cache；`--dry-run` 只列指令；`--volumes` 一定要先輸入 `DELETE_DOCKER_VOLUMES`；前置檢查 `docker info`。檔頭含 `# DEVKIT_DESC`、注入 `DOCKER_BIN`、加 source guard。 |
| `bash-tools/docker/README.md` | Create | 說明兩支工具功能、參數、`DELETE_DOCKER_VOLUMES` 安全策略、`DEVKIT_DOCKER_BIN` 注入點。 |
| `tests/docker-tools.test.js` | Create | 共用 `makeFakeDocker` / `runDoctor` / `runClean` helper；涵蓋 spec 列出的 6 個必要測試。 |
| `README.md` | Modify | 在「📦 工具分類」加入 Docker 段落，補使用範例與安全策略摘要；目錄結構樹補上 `bash-tools/docker/`。 |

DevKit dispatcher (`devkit`) 不需要修改 ─ `get_categories()` / `get_category_tools()` 會自動掃描 `bash-tools/docker/*.sh` 並讀取 `# DEVKIT_DESC`。

---

## Tasks

### Task 1: 建立測試骨架與 `doctor.sh` skeleton

先把 fake docker 測試 harness 跟 `doctor.sh` 骨架立起來，確認 `--help` 與 source guard 行為正確。後續任務不再動 harness。

**Files:**
- Create: `tests/docker-tools.test.js`
- Create: `bash-tools/docker/doctor.sh`

- [ ] **Step 1: 寫測試檔骨架（含 fake docker 與 runDoctor/runClean）**

建立 `tests/docker-tools.test.js`，內容如下（這個檔案在後續 task 會逐步補 test，先放 harness + 第一個 `--help` 測試）：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const doctorPath = resolve('bash-tools/docker/doctor.sh');
const cleanPath = resolve('bash-tools/docker/clean.sh');

/**
 * 建一支假的 docker binary，依測試情境回應 info/version/compose version/system df/system prune。
 * 所有呼叫的 "$*" 會 append 到 log 檔，測試讀檔比對。
 */
function makeFakeDocker(dir, {
    infoExit = 0,
    versionExit = 0,
    composeExit = 0,
    dfExit = 0,
    pruneExit = 0,
    name = 'docker',
} = {}) {
    const logPath = join(dir, `${name}.log`);
    const binPath = join(dir, name);

    writeFileSync(binPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
case "$1" in
  info) exit ${infoExit} ;;
  version) exit ${versionExit} ;;
  compose)
    case "$2" in
      version) exit ${composeExit} ;;
    esac
    exit 0 ;;
  system)
    case "$2" in
      df) exit ${dfExit} ;;
      prune) exit ${pruneExit} ;;
    esac
    exit 0 ;;
esac
exit 0
`);
    chmodSync(binPath, 0o755);
    return { binPath, logPath };
}

function runScript(scriptPath, { args = [], input = '', fakeOpts = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'docker-tool-test-'));
    const fake = makeFakeDocker(dir, fakeOpts);
    const result = spawnSync('bash', [scriptPath, ...args], {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            DEVKIT_DOCKER_BIN: fake.binPath,
        },
    });
    return {
        ...result,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        log: readFileSync(fake.logPath, 'utf8'),
    };
}

const runDoctor = (opts) => runScript(doctorPath, opts);
const runClean = (opts) => runScript(cleanPath, opts);

test('doctor: --help exits 0 without touching docker', () => {
    const r = spawnSync('bash', [doctorPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Docker 健康狀態檢查/);
});
```

- [ ] **Step 2: 先跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：fail，理由是 `bash-tools/docker/doctor.sh` 不存在（`spawnSync` 的 `r.status` 為 `127` 或 `bash: ... No such file or directory`）。

- [ ] **Step 3: 建立 `bash-tools/docker/doctor.sh` skeleton**

建立檔案 `bash-tools/docker/doctor.sh`，內容如下：

```bash
#!/bin/bash
# ==========================================
# Docker 健康狀態檢查工具
# DEVKIT_DESC: 檢查 Docker 基本健康狀態
# 作者: 李卡爾
# 使用方式: ./bash-tools/docker/doctor.sh
# ==========================================

# 彩色輸出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 可注入的 docker binary（測試用）
DOCKER_BIN="${DEVKIT_DOCKER_BIN:-docker}"

show_help() {
    echo -e "${BOLD}Docker 健康狀態檢查${NC}"
    echo ""
    echo -e "${CYAN}功能：${NC}"
    echo "  依序執行以下檢查："
    echo "    1. docker info（daemon 連線）"
    echo "    2. docker version（client/server 版本）"
    echo "    3. docker compose version（Compose v2 可用性）"
    echo "    4. docker system df（磁碟用量摘要）"
    echo ""
    echo -e "${CYAN}使用方式：${NC}"
    echo "  $0 [選項]"
    echo ""
    echo -e "${CYAN}選項：${NC}"
    echo "  --help, -h        顯示此說明"
    echo ""
    echo -e "${CYAN}Exit Code：${NC}"
    echo "  0  全部必要檢查通過"
    echo "  1  docker 指令不存在或 docker info 失敗"
}

main() {
    echo -e "${BOLD}🐳 Docker 健康檢查${NC}"
    # 真正的檢查在後續 task 補上
    echo -e "${YELLOW}（skeleton：尚未實作檢查邏輯）${NC}"
}

# 僅在被直接執行時跑 CLI；被 source 時保留函式供測試使用
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    while [[ $# -gt 0 ]]; do
        case $1 in
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
    main
fi
```

- [ ] **Step 4: 設執行權限並跑測試確認 GREEN**

執行：

```bash
chmod +x bash-tools/docker/doctor.sh
node --test tests/docker-tools.test.js
```

預期：1/1 通過，輸出含 `tests 1` `pass 1`。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/doctor.sh
git commit -m "test: [docker] add doctor.sh skeleton and fake-docker test harness"
```

---

### Task 2: `doctor` 依序呼叫 info / version / compose version / system df

實作 doctor 成功路徑：依序執行 4 個 docker 子指令。先寫測試驗證呼叫順序，再實作。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Modify: `bash-tools/docker/doctor.sh`

- [ ] **Step 1: 在測試檔追加「依序呼叫」測試**

於 `tests/docker-tools.test.js` 既有 `test(...)` 區塊之後追加：

```javascript
test('doctor: calls info, version, compose version, system df in order', () => {
    const r = runDoctor({ fakeOpts: {} });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.log.split('\n').filter(Boolean);
    assert.deepEqual(lines, ['info', 'version', 'compose version', 'system df']);
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：第一個 `--help` 測試仍通過，新測試 fail（`lines` 為空陣列，因為 skeleton 的 `main` 完全沒呼叫 `DOCKER_BIN`）。

- [ ] **Step 3: 改寫 `doctor.sh` 的 `main()` 依序呼叫 4 個子指令**

打開 `bash-tools/docker/doctor.sh`，把現有的 `main()`：

```bash
main() {
    echo -e "${BOLD}🐳 Docker 健康檢查${NC}"
    # 真正的檢查在後續 task 補上
    echo -e "${YELLOW}（skeleton：尚未實作檢查邏輯）${NC}"
}
```

整段替換為：

```bash
main() {
    echo -e "${BOLD}🐳 Docker 健康檢查${NC}"

    echo -e "\n${BLUE}🔍 docker info（daemon 連線）${NC}"
    "$DOCKER_BIN" info

    echo -e "\n${BLUE}🔍 docker version${NC}"
    "$DOCKER_BIN" version

    echo -e "\n${BLUE}🔍 docker compose version${NC}"
    "$DOCKER_BIN" compose version

    echo -e "\n${BLUE}🔍 docker system df${NC}"
    "$DOCKER_BIN" system df

    echo -e "\n${GREEN}✅ Docker 健康檢查完成${NC}"
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：2/2 通過。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/doctor.sh
git commit -m "feat: [docker] doctor runs info/version/compose-version/system-df in order"
```

---

### Task 3: `doctor` 在 `docker info` 失敗時 exit 1

加上 fail-fast：若 daemon 不可連線，立即 exit 1 並不再執行後續檢查。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Modify: `bash-tools/docker/doctor.sh`

- [ ] **Step 1: 追加 info 失敗測試**

於 `tests/docker-tools.test.js` 結尾追加：

```javascript
test('doctor: exits 1 when docker info fails', () => {
    const r = runDoctor({ fakeOpts: { infoExit: 1 } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    // info 仍會被呼叫一次
    assert.match(r.log, /^info$/m);
    // 但不應該再呼叫 version / compose / df
    assert.doesNotMatch(r.log, /^version$/m);
    assert.doesNotMatch(r.log, /^compose version$/m);
    assert.doesNotMatch(r.log, /^system df$/m);
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：新測試 fail（目前 main() 不檢查 `docker info` 回傳值，仍會跑後續指令並 exit 0）。

- [ ] **Step 3: 在 `doctor.sh` 的 `main()` 加上 info fail-fast**

打開 `bash-tools/docker/doctor.sh`，把這段：

```bash
    echo -e "\n${BLUE}🔍 docker info（daemon 連線）${NC}"
    "$DOCKER_BIN" info
```

替換為：

```bash
    echo -e "\n${BLUE}🔍 docker info（daemon 連線）${NC}"
    if ! "$DOCKER_BIN" info; then
        echo -e "${RED}❌ docker info 失敗，daemon 無法連線${NC}"
        exit 1
    fi
```

- [ ] **Step 4: 跑測試確認 GREEN**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：3/3 通過。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/doctor.sh
git commit -m "feat: [docker] doctor exits 1 on docker info failure"
```

---

### Task 4: 建立 `clean.sh` skeleton 與參數解析

先把 `clean.sh` 的骨架立起：`--help`、`--dry-run`、`--force`、`--volumes` 解析，source guard，前置檢查 `docker info`。先不做 prune 行為。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Create: `bash-tools/docker/clean.sh`

- [ ] **Step 1: 追加 `clean --help` 測試**

於 `tests/docker-tools.test.js` 結尾追加：

```javascript
test('clean: --help exits 0 without touching docker', () => {
    const r = spawnSync('bash', [cleanPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Docker 保守資源清理/);
    assert.match(r.stdout ?? '', /DELETE_DOCKER_VOLUMES/);
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：新測試 fail（`bash-tools/docker/clean.sh` 不存在）。

- [ ] **Step 3: 建立 `bash-tools/docker/clean.sh` skeleton**

建立檔案 `bash-tools/docker/clean.sh`，內容如下：

```bash
#!/bin/bash
# ==========================================
# Docker 保守資源清理工具
# DEVKIT_DESC: 保守清理 Docker 未使用資源
# 作者: 李卡爾
# 使用方式: ./bash-tools/docker/clean.sh [--dry-run|--force|--volumes]
# ==========================================

# 彩色輸出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 可注入的 docker binary（測試用）
DOCKER_BIN="${DEVKIT_DOCKER_BIN:-docker}"

# 危險清理的固定確認片語
VOLUMES_CONFIRMATION_PHRASE="DELETE_DOCKER_VOLUMES"

# 旗標（由 CLI 參數設定）
DRY_RUN=false
FORCE=false
WITH_VOLUMES=false

show_help() {
    echo -e "${BOLD}Docker 保守資源清理${NC}"
    echo ""
    echo -e "${CYAN}預設清理範圍（docker system prune 預設行為）：${NC}"
    echo "  • 已停止的 containers"
    echo "  • dangling / unused images"
    echo "  • unused networks"
    echo "  • build cache"
    echo "  （預設不清 volumes）"
    echo ""
    echo -e "${CYAN}使用方式：${NC}"
    echo "  $0 [選項]"
    echo ""
    echo -e "${CYAN}選項：${NC}"
    echo "  --dry-run         列出將執行的指令，不實際執行"
    echo "  --force           跳過一般 y/N 確認"
    echo "  --volumes         同時清理 volumes（須輸入 ${VOLUMES_CONFIRMATION_PHRASE}）"
    echo "  --help, -h        顯示此說明"
    echo ""
    echo -e "${YELLOW}⚠️  --volumes 即使搭配 --force，仍須輸入 ${VOLUMES_CONFIRMATION_PHRASE} 才會執行${NC}"
}

# 確認 docker 可用
check_docker_available() {
    if ! command -v "$DOCKER_BIN" >/dev/null 2>&1; then
        echo -e "${RED}❌ 找不到 docker 指令（DOCKER_BIN=$DOCKER_BIN）${NC}"
        return 1
    fi
    if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
        echo -e "${RED}❌ docker info 失敗，daemon 無法連線${NC}"
        return 1
    fi
    return 0
}

main() {
    echo -e "${BOLD}🐳 Docker 保守資源清理${NC}"
    check_docker_available || exit 1
    # 後續任務補 prune / dry-run / volumes 邏輯
    echo -e "${YELLOW}（skeleton：尚未實作清理邏輯）${NC}"
}

# 僅在被直接執行時跑 CLI；被 source 時保留函式供測試使用
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --volumes)
                WITH_VOLUMES=true
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
    main
fi
```

- [ ] **Step 4: 設執行權限並跑測試確認 GREEN**

執行：

```bash
chmod +x bash-tools/docker/clean.sh
node --test tests/docker-tools.test.js
```

預期：4/4 通過。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/clean.sh
git commit -m "feat: [docker] add clean.sh skeleton with arg parsing and docker pre-check"
```

---

### Task 5: `clean --dry-run` 列出指令但不執行 prune

實作 dry-run 路徑：印出預計指令，但不呼叫 `docker system prune`。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Modify: `bash-tools/docker/clean.sh`

- [ ] **Step 1: 追加 dry-run 測試**

於 `tests/docker-tools.test.js` 結尾追加：

```javascript
test('clean: --dry-run does not invoke prune; prints planned command', () => {
    const r = runClean({ args: ['--dry-run', '--force'] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // pre-check 會跑一次 info，但不該出現 system prune
    assert.match(r.log, /^info$/m);
    assert.doesNotMatch(r.log, /system prune/);
    // 預計指令仍須在 stdout 列出
    assert.match(r.stdout, /預計指令.*system prune --force/);
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：新測試 fail（skeleton 不會列出預計指令）。

- [ ] **Step 3: 改寫 `clean.sh` 的 `main()` 加上 dry-run 路徑**

打開 `bash-tools/docker/clean.sh`，把現有的 `main()`：

```bash
main() {
    echo -e "${BOLD}🐳 Docker 保守資源清理${NC}"
    check_docker_available || exit 1
    # 後續任務補 prune / dry-run / volumes 邏輯
    echo -e "${YELLOW}（skeleton：尚未實作清理邏輯）${NC}"
}
```

整段替換為：

```bash
main() {
    echo -e "${BOLD}🐳 Docker 保守資源清理${NC}"
    check_docker_available || exit 1

    local prune_cmd=("system" "prune" "--force")

    echo -e "${BLUE}預計指令：${NC}$DOCKER_BIN ${prune_cmd[*]}"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}🟡 --dry-run，僅列出指令，不實際執行${NC}"
        exit 0
    fi

    # 後續任務補 y/N 與實際 prune 呼叫
    echo -e "${YELLOW}（尚未實作實際 prune 呼叫）${NC}"
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：5/5 通過。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/clean.sh
git commit -m "feat: [docker] clean --dry-run prints planned command without pruning"
```

---

### Task 6: `clean --force` 執行 `docker system prune --force`（無 `--volumes`）

實作非 dry-run 路徑：`--force` 跳過 y/N 確認，直接執行 prune。`--volumes` 處理在下個 task。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Modify: `bash-tools/docker/clean.sh`

- [ ] **Step 1: 追加 `--force` 測試**

於 `tests/docker-tools.test.js` 結尾追加：

```javascript
test('clean: --force runs docker system prune --force without --volumes', () => {
    const r = runClean({ args: ['--force'] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.log.split('\n').filter(Boolean);
    // 最後一筆呼叫須是 system prune --force（前面是 pre-check 的 info）
    assert.equal(lines[lines.length - 1], 'system prune --force');
    // 任何呼叫都不該帶 --volumes
    assert.doesNotMatch(r.log, /--volumes/);
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：新測試 fail（目前 main 在非 dry-run 路徑只印佔位文字，沒呼叫 `docker system prune`）。

- [ ] **Step 3: 在 `clean.sh` 的 `main()` 加上 y/N 與實際 prune 呼叫**

打開 `bash-tools/docker/clean.sh`，把現有 `main()` 整段替換為（替換完整 main 函式較直觀，避免片段拼接出錯）：

```bash
main() {
    echo -e "${BOLD}🐳 Docker 保守資源清理${NC}"
    check_docker_available || exit 1

    local prune_cmd=("system" "prune" "--force")

    echo -e "${BLUE}預計指令：${NC}$DOCKER_BIN ${prune_cmd[*]}"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}🟡 --dry-run，僅列出指令，不實際執行${NC}"
        exit 0
    fi

    if [[ "$FORCE" != "true" ]]; then
        echo -ne "${YELLOW}確定要執行清理嗎？(y/N): ${NC}"
        local ans
        read -r ans
        if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
            echo -e "${RED}❌ 已取消${NC}"
            exit 1
        fi
    fi

    "$DOCKER_BIN" "${prune_cmd[@]}"
    echo -e "${GREEN}✅ Docker 清理完成${NC}"
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：6/6 通過。

- [ ] **Step 5: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/clean.sh
git commit -m "feat: [docker] clean --force runs system prune --force without volumes"
```

---

### Task 7: `clean --volumes` 二次確認機制

加入 `--volumes` 路徑與固定片語 `DELETE_DOCKER_VOLUMES` 二次確認。一次蓋兩個必要測試：拒絕路徑（無片語）與通過路徑（正確片語）。

**Files:**
- Modify: `tests/docker-tools.test.js`
- Modify: `bash-tools/docker/clean.sh`

- [ ] **Step 1: 追加兩個 `--volumes` 測試**

於 `tests/docker-tools.test.js` 結尾追加：

```javascript
test('clean: --volumes --force without confirmation phrase aborts without --volumes prune', () => {
    // stdin 空 → read 拿不到任何字元 → 片語不符
    const r = runClean({ args: ['--volumes', '--force'], input: '' });
    assert.notEqual(r.status, 0, '應該以非零 exit code 結束');
    // 任何呼叫都不該帶 --volumes
    assert.doesNotMatch(r.log, /--volumes/);
    // 也不該執行任何 system prune（保守做法）
    assert.doesNotMatch(r.log, /system prune/);
});

test('clean: --volumes --force with DELETE_DOCKER_VOLUMES runs system prune --force --volumes', () => {
    const r = runClean({
        args: ['--volumes', '--force'],
        input: 'DELETE_DOCKER_VOLUMES\n',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.log.split('\n').filter(Boolean);
    assert.equal(lines[lines.length - 1], 'system prune --force --volumes');
});
```

- [ ] **Step 2: 跑測試確認 RED**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：兩個新測試 fail。第一個會 fail（目前 `--volumes` 沒處理，會直接 prune 沒帶 --volumes 並 exit 0）；第二個會 fail（log 末筆會是 `system prune --force` 而不是 `--force --volumes`）。

- [ ] **Step 3: 在 `clean.sh` 加入 `confirm_volumes_phrase` 並串到 `main()`**

打開 `bash-tools/docker/clean.sh`，在 `check_docker_available()` 函式定義之後（緊接其 `}` 後、`main()` 之前），新增 helper：

```bash
# 危險路徑：要求輸入固定片語才允許清 volumes
confirm_volumes_phrase() {
    echo -e "${RED}⚠️  即將清理 volumes，將永久刪除未使用的資料卷。${NC}"
    echo -e "${YELLOW}請輸入 ${BOLD}${VOLUMES_CONFIRMATION_PHRASE}${NC}${YELLOW} 以確認：${NC}"
    local phrase
    read -r phrase
    if [[ "$phrase" == "$VOLUMES_CONFIRMATION_PHRASE" ]]; then
        return 0
    fi
    echo -e "${RED}❌ 輸入不符，取消 volumes 清理${NC}"
    return 1
}
```

接著把 `main()` 中這段：

```bash
    local prune_cmd=("system" "prune" "--force")

    echo -e "${BLUE}預計指令：${NC}$DOCKER_BIN ${prune_cmd[*]}"
```

替換為：

```bash
    local prune_cmd=("system" "prune" "--force")

    if [[ "$WITH_VOLUMES" == "true" ]]; then
        if ! confirm_volumes_phrase; then
            exit 1
        fi
        prune_cmd+=("--volumes")
    fi

    echo -e "${BLUE}預計指令：${NC}$DOCKER_BIN ${prune_cmd[*]}"
```

- [ ] **Step 4: 跑測試確認 GREEN**

執行：

```bash
node --test tests/docker-tools.test.js
```

預期：8/8 通過。

- [ ] **Step 5: 額外手動 sanity check（不需另寫測試）**

執行以下指令逐一檢查（不需提交）：

```bash
# (a) --help 永遠 exit 0
bash bash-tools/docker/clean.sh --help >/dev/null; echo "exit=$?"
# (b) 在沒 docker 的環境，pre-check 會擋；在有 docker 的環境會走到 dry-run path
DEVKIT_DOCKER_BIN=/usr/bin/false bash bash-tools/docker/clean.sh --dry-run --force </dev/null; echo "exit=$?"
# (c) --volumes 配空 stdin：因為片語不符 → 應 exit 1
DEVKIT_DOCKER_BIN=/usr/bin/true bash bash-tools/docker/clean.sh --volumes --force </dev/null; echo "exit=$?"
```

預期：
- (a) `exit=0`
- (b) `exit=1`（`/usr/bin/false` 走 pre-check 即失敗）
- (c) `exit=1`（pre-check 過，但片語不符）

- [ ] **Step 6: Commit**

```bash
git add tests/docker-tools.test.js bash-tools/docker/clean.sh
git commit -m "feat: [docker] clean --volumes requires DELETE_DOCKER_VOLUMES phrase"
```

---

### Task 8: 文件 — 新增 `bash-tools/docker/README.md` 與更新根 `README.md`

把功能、參數、安全策略寫進文件。

**Files:**
- Create: `bash-tools/docker/README.md`
- Modify: `README.md`

- [ ] **Step 1: 建立 `bash-tools/docker/README.md`**

建立檔案 `bash-tools/docker/README.md`，內容如下（寫入時把 `~~~bash` 還原為三個反引號 + `bash`；計畫文件用 `~~~` 是為了避免內嵌 fenced block 衝突）：

~~~markdown
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

~~~bash
./bash-tools/docker/doctor.sh
./bash-tools/docker/doctor.sh --help
~~~

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

~~~
DELETE_DOCKER_VOLUMES
~~~

未輸入正確片語時，**腳本不會執行任何 prune 指令**，並以非零 exit code 結束。

**使用方式：**

~~~bash
# 預設互動式清理（會 y/N 確認）
./bash-tools/docker/clean.sh

# 只看會跑哪些指令
./bash-tools/docker/clean.sh --dry-run

# 跳過 y/N，但不清 volumes
./bash-tools/docker/clean.sh --force

# 連 volumes 一起清（需手動輸入片語）
./bash-tools/docker/clean.sh --volumes --force
~~~

## 🧪 可測試性

兩支腳本都讀取可注入的 docker binary：

~~~bash
DOCKER_BIN="${DEVKIT_DOCKER_BIN:-docker}"
~~~

`tests/docker-tools.test.js` 透過 fake docker binary（暫存目錄）記錄參數與模擬退出碼，**不依賴本機 Docker daemon**。

## 🔒 安全特性

- 預設保守：不刪 volumes、不操作 Compose 專案
- 二次確認片語擋 `--volumes`，避免「打了 `--force` 就完蛋」
- 前置 `docker info` 檢查；daemon 不可連線時不進入清理流程
- 所有指令支援 `--help` 與 source guard，方便測試與單獨呼叫
~~~

> 寫檔時把上面所有 `~~~` 還原成三個反引號（` ``` `），保持 markdown fenced code 語法一致。

- [ ] **Step 2: 在根 `README.md` 加入 Docker 段落**

打開 `README.md`，找到「📂 目錄結構」區塊（約第 15–29 行）的目錄樹，把：

```
├── bash-tools/git/           # Git 相關工具
│   ├── README.md            # Git 工具說明
│   ├── clean-branch.sh      # 分支清理工具
│   ├── sync-all.sh          # 分支同步工具
│   └── release-tag.sh       # 智慧版本標籤工具
├── node-tools/env/           # 環境檔案管理工具
```

替換為：

```
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
```

接著在 `### 🔧 Git 工具 (\`git/\`)` 整段結尾、`### 🚀 未來擴展計劃` 標題之前，插入下列新段落（內嵌 `~~~bash` 寫入時請還原為三個反引號 + `bash`）：

~~~markdown
### 🐳 Docker 工具 (`docker/`)

針對 Docker daemon 的安全運維工具。第一版只提供 doctor 與 clean 兩支 Bash tool。

#### doctor.sh - Docker 健康狀態檢查
依序執行 `docker info` / `version` / `compose version` / `system df`，daemon 不可連線時 exit 1。

**使用方式：**

~~~bash
./bash-tools/docker/doctor.sh
~~~

#### clean.sh - Docker 保守資源清理
預設透過 `docker system prune --force` 清掉 stopped containers、unused images、unused networks、build cache（**不清 volumes**）。

**主要參數：**

- `--dry-run`：只列指令，不執行 prune
- `--force`：跳過 y/N 確認
- `--volumes`：同時清 volumes，**即使 `--force` 也要再輸入 `DELETE_DOCKER_VOLUMES` 片語**

**使用方式：**

~~~bash
./bash-tools/docker/clean.sh --dry-run
./bash-tools/docker/clean.sh --force
./bash-tools/docker/clean.sh --volumes --force
~~~

> ⚠️ 任何含 `--volumes` 的清理都會永久刪除未使用的資料卷；片語錯誤時腳本不會執行任何 prune 指令。
~~~

最後在「🔒 安全特性」段落最末（既有的「• 錯誤處理：完整的錯誤捕獲和友善的錯誤訊息」之後）追加一行：

```markdown
- **Docker 清理雙重確認：** `clean.sh --volumes` 一律需要輸入 `DELETE_DOCKER_VOLUMES` 片語，否則不執行任何 prune
```

- [ ] **Step 3: 跑全套測試確認沒回歸**

執行：

```bash
pnpm test
```

預期：所有測試（包含既有 `release-tag.test.js`、`clean-branch.test.js`、`devkit-cli.test.js`、`install-sh.test.js`、`version-check.test.js`、新的 `docker-tools.test.js`）通過。

- [ ] **Step 4: 跑 lint**

執行：

```bash
pnpm lint
```

預期：通過（lint 範圍是 `src/**/*.js` 與 `node-tools/*/src/**/*.js`，不涵蓋 `tests/`，所以新檔不會被檢查；既有檔案應無回歸）。

- [ ] **Step 5: Commit**

```bash
git add bash-tools/docker/README.md README.md
git commit -m "docs: [docker] document doctor and clean tools with safety policy"
```

---

### Task 9: 整合驗證

最終確認 spec 列的成功標準全部達成。本任務不需要提交（除非發現問題需要追補修正）。

**Files:** （無檔案修改，純驗證）

- [ ] **Step 1: 驗證 `./devkit docker` 列出兩支工具**

執行：

```bash
./devkit docker
```

預期：輸出中包含 `clean`（描述 `保守清理 Docker 未使用資源`）與 `doctor`（描述 `檢查 Docker 基本健康狀態`）。

- [ ] **Step 2: 驗證單獨工具 dispatcher 入口**

執行：

```bash
./devkit docker:doctor --help
./devkit docker:clean --help
```

預期：兩者皆 exit 0，分別輸出 doctor / clean 的說明文字。

- [ ] **Step 3: 驗證 `./devkit` 列出 `docker` 類別**

執行：

```bash
./devkit
```

預期：工具列表中出現 `docker` 類別，並列出 `clean` 與 `doctor`。

- [ ] **Step 4: 最終 `pnpm test` + `pnpm lint` 雙綠**

執行：

```bash
pnpm test && pnpm lint
```

預期：兩個指令都 exit 0。

- [ ] **Step 5: 確認 spec 成功標準逐項對齊**

對照 `docs/superpowers/specs/2026-05-13-docker-tools-design.md` 的「成功標準」段落：

- [ ] `./devkit docker` 能列出 `clean` 與 `doctor`（Step 1）
- [ ] `./devkit docker:doctor` 在 Docker 可用時完成基本檢查（Step 2 驗證 `--help`；實機檢查需要本地 Docker daemon）
- [ ] `./devkit docker:clean` 預設不清 volumes（Task 6 測試覆蓋）
- [ ] `--volumes` 一律需要固定片語確認（Task 7 兩個測試覆蓋）
- [ ] 新增測試通過、既有測試不回歸（Step 4）
- [ ] `pnpm lint` 通過（Step 4）

若任一條未過，回到對應 task 修正。
