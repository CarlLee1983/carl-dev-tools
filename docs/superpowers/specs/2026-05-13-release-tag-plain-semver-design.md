# Release Tag: 支援純 SemVer 軌道

- **Date:** 2026-05-13
- **Target:** `bash-tools/git/release-tag.sh`
- **Status:** Draft (spec)

## 問題

`bash-tools/git/release-tag.sh` 目前強制要求 `prefix/vX.Y.Z` 格式（如 `release/v1.2.3`）。沒有現存 prefix 時必須輸入新 prefix，空字串會 `exit 1`。但本 repo 自己現有的 tag 是純 SemVer（`v1.0.0-beta.1`、`v1.1.0`、`v1.1.1`），工具反而對自己 repo 不適用。

## 目標

- 在現有「prefix 軌道」之外，加上「無前綴 (plain SemVer)」軌道，互動式選擇
- 兩種軌道並列、可共存
- 對既有 `prefix/vX.Y.Z` 流程保持完全相容（既有 tag 仍可繼續 bump）

## 非目標

- 不加 pre-release suffix 支援（`-beta.N`、`-rc.N`）
- 不加 CLI 旗標控制 track 選擇（未來再說）
- 不加 prefix 字元驗證（YAGNI；目前也沒有）

## 設計

### 架構

主流程不變，三個節點導入「無前綴」概念：

```
check_working_directory
  → check_and_select_branch
  → fetch_remote_tags
  → scan_tag_tracks           ← 改名自 scan_tag_prefixes；偵測 plain semver
  → select_track              ← 改名自 select_prefix；含「(無前綴)」置頂選項
  → get_latest_version  (用 tag_glob)
  → check_commit_sha    (用 tag_glob)
  → select_increment_type
  → create_tag          (用 format_tag)
```

`SELECTED_PREFIX=""`（空字串）做為「無前綴」哨兵語意，所有 tag 相關操作走兩個 helper 集中分流。

### 元件

**新增 helper**

| 函式 | 輸入 | 輸出 |
|------|------|------|
| `tag_glob "$prefix"` | prefix（可空） | `v*` 或 `${prefix}/v*` |
| `format_tag "$prefix" "$version"` | prefix + 版本 | `v1.2.3` 或 `release/v1.2.3` |
| `parse_tag_version "$tag" "$prefix"` | 完整 tag + prefix | `X.Y.Z` |

**修改既有**

- `scan_tag_prefixes` → 改名 `scan_tag_tracks`。原 prefix 蒐集邏輯保留；額外偵測 `^v[0-9]+\.[0-9]+\.[0-9]+`，設 `HAS_PLAIN_SEMVER=true`
- `select_prefix` → 改名 `select_track`。清單第一項永遠是「(無前綴) — 目前 vX.Y.Z」或「(無前綴) — 將建立 v0.0.1」；其後接現存 prefix。零 tag 時改先問「是否要加上 prefix？(y/N)」，預設 N → 無前綴
- `get_latest_version` / `check_commit_sha` / `create_tag`：把硬編碼的 `${prefix}/v*` 與 `${SELECTED_PREFIX}/v${NEW_VERSION}` 改為呼叫 helper
- `select_increment_type` 不動

**測試前置（同 slice 內完成）**

`release-tag.sh` 目前沒有 `DEVKIT_GIT_BIN` 注入點（`clean-branch.sh` 有）。加上 `GIT_BIN="${DEVKIT_GIT_BIN:-git}"`，把腳本內所有 `git ...` 改成 `"$GIT_BIN" ...`，讓 TDD 可用 fake git binary。

### 資料流（互動範例）

**情境 1：混合 tag，選無前綴**
```
🔍 掃描專案版本軌道...
✅ 找到以下版本軌道：
  1. (無前綴) — 目前 v1.1.1
  2. release/ — 目前 release/v1.2.3

請選擇要操作的版本軌道：
請輸入編號 (1-2): 1
✅ 已選擇軌道：(無前綴)
📍 當前最新版本：v1.1.1
...
即將建立標籤：v1.1.2
```

**情境 2：零 tag**
```
🔍 掃描專案版本軌道...
⚠️  專案中沒有任何標籤

是否要加上 prefix？(y/N): n
📍 將建立第一個標籤：v0.0.1
```

**情境 3：零 tag，選擇加 prefix**
```
是否要加上 prefix？(y/N): y
請輸入新的標籤前綴（例如：release, testing, hotfix）：release
📍 將建立第一個標籤：release/v0.0.1
```

### 錯誤處理

| 情境 | 行為 |
|------|------|
| 零 tag + 選 Y 加 prefix + 空輸入 | 維持既有 `❌ 前綴不能為空 / exit 1` |
| `tag_glob` / `format_tag` 收到空 prefix | 走無前綴路徑（哨兵語意，非錯誤） |
| 選「(無前綴)」但實際 repo 沒有 plain semver | 視為「將建立第一個 v0.0.1」 |
| SHA1 / 遠端 tag 重複檢查 | 邏輯不變，僅 tag 名稱格式經由 helper 算出 |
| `--force` / `--push` 行為 | 不變 |

### 測試策略

新檔 `tests/release-tag.test.js`，用 Node test runner + `child_process.execFileSync` + fake git binary（沿用 `tests/clean-branch.test.js` 模式）。

**Helper 單元測試**（`bash -c 'source release-tag.sh; tag_glob …'`）
1. `tag_glob ""` → `v*`
2. `tag_glob "release"` → `release/v*`
3. `format_tag "" "1.2.3"` → `v1.2.3`
4. `format_tag "release" "1.2.3"` → `release/v1.2.3`
5. `parse_tag_version "v1.2.3" ""` → `1.2.3`
6. `parse_tag_version "release/v1.2.3" "release"` → `1.2.3`

**選單行為**（fake git 模擬 tag 列表 + 餵 stdin）
7. 混合 tag → 選單第 1 項是 `(無前綴)`，第 2+ 項是現存 prefix
8. 純無前綴 tag → 選單仍含 `(無前綴)` 為唯一項，順利選定
9. 純 prefix tag → 選單仍含 `(無前綴) — 將建立 v0.0.1` 置頂
10. 零 tag → 詢問「加 prefix?」，預設 N 走無前綴並建立 `v0.0.1`
11. 零 tag + 選 Y + 輸入 `release` → 走 prefix 流程，建立 `release/v0.0.1`

**整合**（fake git，不真的建 tag；驗證最終 `git tag -a` 收到的參數）
12. 無前綴 patch bump：v1.1.1 → `git tag -a v1.1.2 ...`
13. prefix patch bump：release/v1.2.3 → `git tag -a release/v1.2.4 ...`

### TDD 順序

1. 注入 `DEVKIT_GIT_BIN`（不改任何業務邏輯）
2. 寫 helper 測試 → 實作 helper
3. 寫 selection 測試 → 實作 `scan_tag_tracks` / `select_track`
4. 寫整合測試 → 串接 `get_latest_version` / `check_commit_sha` / `create_tag` 改用 helper
5. 既有 `bash-tools/git/README.md` 對應段落更新範例輸出

## 風險與緩解

- **正規表示式誤撈**：`scan_tag_tracks` 偵測 plain semver 用 `^v[0-9]+\.[0-9]+\.[0-9]+` 並排除前綴格式，混合 tag 場景要驗證。測試 9 已涵蓋
- **既有用戶記憶肌肉**：選單多了「(無前綴)」可能造成短暫困惑。緩解：置頂、文字清楚註明「目前 vX.Y.Z」或「將建立 v0.0.1」
- **`bash-tools/git/README.md` 與真實流程脫節**：在同一 slice 內更新對應段落，避免後續文件漂移
