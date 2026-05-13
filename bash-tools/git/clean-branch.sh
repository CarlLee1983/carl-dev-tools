#!/bin/bash
# DEVKIT_DESC: 智慧分支清理工具 - 自動清理已合併的功能分支
# 功能: 自動清理已合併到主要分支的功能性分支，支援本地和遠端分支清理
set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 預設值
FORCE_MODE=false
# 預設掃描所有已合併的分支（更安全，因為只掃描已合併的）
SCAN_ALL=true
DEBUG_MODE=false
CUSTOM_PATTERN=""
REMOTE_CLEANUP=false
GIT_BIN="${DEVKIT_GIT_BIN:-git}"
PROTECTED_BRANCH_PATTERNS=("^main$" "^master$" "^develop$" "^testing$" "^staging$" "^production$")

# 解析命令列參數
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_MODE=true
            shift
            ;;
        --pattern|-p)
            CUSTOM_PATTERN="$2"
            SCAN_ALL=false  # 使用自訂模式時，限制掃描範圍
            shift 2
            ;;
        --debug|-d)
            DEBUG_MODE=true
            shift
            ;;
        --remote)
            REMOTE_CLEANUP=true
            shift
            ;;
        --protect)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}✗ --protect 需要提供分支保護正則表達式${NC}" >&2
                exit 1
            fi
            PROTECTED_BRANCH_PATTERNS+=("$2")
            shift 2
            ;;
        -h|--help)
            echo "使用方式: $0 [選項] [基礎分支]"
            echo "選項:"
            echo "  --force, -f          跳過確認直接刪除分支"
            echo "  --pattern, -p PATTERN  只掃描符合自訂模式的分支（正則表達式）"
            echo "  --debug, -d          顯示詳細掃描過程"
            echo "  --remote             啟用遠端分支清理（預設停用，較安全）"
            echo "  --protect PATTERN    額外保護符合正則表達式的分支，可重複指定"
            echo "  --help, -h           顯示此說明"
            echo ""
            echo "說明:"
            echo "  預設會掃描所有已合併到基礎分支的分支（已合併的分支是安全的）"
            echo "  使用 --pattern 可以限制只掃描符合特定命名模式的分支"
            echo ""
            echo "範例:"
            echo "  $0                          # 掃描所有已合併的分支（預設）"
            echo "  $0 develop                  # 使用 develop 作為基礎分支"
            echo "  $0 --force main             # 強制模式，使用 main 分支"
            echo "  $0 --pattern 'bug-|issue-'   # 只掃描符合自訂模式的分支"
            echo "  $0 --debug                 # 顯示詳細掃描資訊"
            echo "  $0 --protect 'release/.*' # 額外保護 release/* 分支"
            echo "  $0 --remote                # 明確啟用遠端分支清理"
            exit 0
            ;;
        *)
            SPECIFIED_BRANCH="$1"
            shift
            ;;
    esac
done

# 自動偵測主要分支函數
detect_main_branch() {
    # 如果使用者指定了分支，優先使用
    if [[ -n "$SPECIFIED_BRANCH" ]]; then
        if "$GIT_BIN" show-ref --verify --quiet refs/heads/"$SPECIFIED_BRANCH" 2>/dev/null || \
           "$GIT_BIN" show-ref --verify --quiet refs/remotes/origin/"$SPECIFIED_BRANCH" 2>/dev/null; then
            echo "$SPECIFIED_BRANCH"
            return 0
        else
            echo -e "${RED}✗ 指定的分支 '$SPECIFIED_BRANCH' 不存在${NC}" >&2
            exit 1
        fi
    fi
    
    # 自動偵測順序：main -> master -> develop
    for branch in main master develop; do
        if "$GIT_BIN" show-ref --verify --quiet refs/heads/"$branch" 2>/dev/null || \
           "$GIT_BIN" show-ref --verify --quiet refs/remotes/origin/"$branch" 2>/dev/null; then
            echo "$branch"
            return 0
        fi
    done
    
    echo -e "${RED}✗ 無法偵測到主要分支 (main, master, develop)${NC}" >&2
    exit 1
}

echo -e "${BLUE}🔍 偵測主要分支...${NC}"
BASE_BRANCH=$(detect_main_branch)
echo -e "${GREEN}✓ 偵測到主要分支: $BASE_BRANCH${NC}"

# 檢查網路連線函數
check_network() {
    echo -e "${BLUE}🌐 檢查網路連線...${NC}"
    if ! "$GIT_BIN" ls-remote --exit-code origin &>/dev/null; then
        echo -e "${RED}✗ 無法連接到遠端儲存庫，將跳過遠端分支清理${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ 網路連線正常${NC}"
    return 0
}

# 判斷是否為受保護分支
is_protected_branch() {
    local branch="$1"
    local pattern

    for pattern in "${PROTECTED_BRANCH_PATTERNS[@]}"; do
        if [[ "$branch" =~ $pattern ]]; then
            return 0
        fi
    done

    return 1
}

# 過濾受保護分支
filter_protected_branches() {
    local branches="$1"
    local branch

    echo "$branches" | while read -r branch; do
        [[ -z "$branch" ]] && continue
        if is_protected_branch "$branch"; then
            echo -e "${YELLOW}🛡️  跳過受保護分支: $branch${NC}" >&2
            continue
        fi
        echo "$branch"
    done
}

# 檢查工作區是否乾淨
ensure_clean_worktree() {
    echo -e "${BLUE}🧹 檢查工作區狀態...${NC}"
    local status_output
    status_output=$("$GIT_BIN" status --porcelain 2>/dev/null || true)

    if [[ -n "$status_output" ]]; then
        echo -e "${RED}✗ 工作區有未提交變更，為避免 checkout/pull 影響目前工作，已停止清理${NC}" >&2
        echo -e "${YELLOW}請先 commit、stash 或清理工作區後再執行。${NC}" >&2
        return 1
    fi

    echo -e "${GREEN}✓ 工作區乾淨${NC}"
    return 0
}

# 取得已合併的本地分支
get_merged_local_branches() {
    local base_branch="$1"
    
    # 獲取所有已合併的分支（排除當前分支和主要分支）
    local all_merged=$("$GIT_BIN" branch --merged "$base_branch" | \
        sed 's/^[[:space:]]*//' | \
        grep -v '^\*' || true)
    all_merged=$(filter_protected_branches "$all_merged")
    
    if [[ "$DEBUG_MODE" == "true" ]]; then
        echo -e "${BLUE}🔍 所有已合併的本地分支：${NC}" >&2
        echo "$all_merged" | while read -r branch; do
            [[ -n "$branch" ]] && echo -e "  ${CYAN}  - $branch${NC}" >&2
        done
    fi
    
    # 預設掃描所有已合併的分支
    if [[ "$SCAN_ALL" == "true" ]]; then
        echo "$all_merged"
        return
    fi
    
    # 如果指定了自訂模式，只返回符合模式的分支
    if [[ -n "$CUSTOM_PATTERN" ]]; then
        local filtered=$(echo "$all_merged" | grep -E "$CUSTOM_PATTERN" || true)
        if [[ "$DEBUG_MODE" == "true" ]]; then
            echo -e "${BLUE}🔍 符合自訂模式的分支：${NC}" >&2
            echo "$filtered" | while read -r branch; do
                [[ -n "$branch" ]] && echo -e "  ${GREEN}  ✓ $branch${NC}" >&2
            done
            local excluded=$(echo "$all_merged" | grep -vE "$CUSTOM_PATTERN" || true)
            if [[ -n "$excluded" ]]; then
                echo -e "${YELLOW}⚠️  被過濾掉的分支（不符合自訂模式）：${NC}" >&2
                echo "$excluded" | while read -r branch; do
                    [[ -n "$branch" ]] && echo -e "  ${YELLOW}  - $branch${NC}" >&2
                done
            fi
        fi
        echo "$filtered"
        return
    fi
}

# 取得已合併的遠端分支
get_merged_remote_branches() {
    local base_branch="$1"
    
    # 獲取所有已合併的遠端分支（排除 HEAD）
    local all_merged=$("$GIT_BIN" branch -r --merged "origin/$base_branch" | \
        grep -v "origin/HEAD" | \
        sed 's/^[[:space:]]*origin\///' || true)
    all_merged=$(filter_protected_branches "$all_merged")
    
    if [[ "$DEBUG_MODE" == "true" ]]; then
        echo -e "${BLUE}🔍 所有已合併的遠端分支：${NC}" >&2
        echo "$all_merged" | while read -r branch; do
            [[ -n "$branch" ]] && echo -e "  ${CYAN}  - $branch${NC}" >&2
        done
    fi
    
    # 預設掃描所有已合併的分支
    if [[ "$SCAN_ALL" == "true" ]]; then
        echo "$all_merged"
        return
    fi
    
    # 如果指定了自訂模式，只返回符合模式的分支
    if [[ -n "$CUSTOM_PATTERN" ]]; then
        local filtered=$(echo "$all_merged" | grep -E "$CUSTOM_PATTERN" || true)
        if [[ "$DEBUG_MODE" == "true" ]]; then
            echo -e "${BLUE}🔍 符合自訂模式的分支：${NC}" >&2
            echo "$filtered" | while read -r branch; do
                [[ -n "$branch" ]] && echo -e "  ${GREEN}  ✓ $branch${NC}" >&2
            done
            local excluded=$(echo "$all_merged" | grep -vE "$CUSTOM_PATTERN" || true)
            if [[ -n "$excluded" ]]; then
                echo -e "${YELLOW}⚠️  被過濾掉的分支（不符合自訂模式）：${NC}" >&2
                echo "$excluded" | while read -r branch; do
                    [[ -n "$branch" ]] && echo -e "  ${YELLOW}  - $branch${NC}" >&2
                done
            fi
        fi
        echo "$filtered"
        return
    fi
}

# 互動式確認函數
confirm_deletion() {
    local branch_type="$1"
    local branches="$2"
    
    if [[ -z "$branches" ]]; then
        echo -e "${YELLOW}ℹ️  沒有找到需要清理的${branch_type}分支${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📋 將要刪除的${branch_type}分支：${NC}"
    echo "$branches" | while read -r branch; do
        [[ -n "$branch" ]] && echo -e "  ${RED}✗${NC} $branch"
    done
    
    if [[ "$FORCE_MODE" == "true" ]]; then
        echo -e "${YELLOW}⚡ 強制模式：跳過確認${NC}"
        return 0
    fi
    
    echo ""
    read -p "確定要刪除這些分支嗎？(y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        echo -e "${BLUE}ℹ️  取消刪除${branch_type}分支${NC}"
        return 1
    fi
}

# 遠端刪除額外確認
confirm_remote_phrase() {
    if [[ "$FORCE_MODE" == "true" ]]; then
        echo -e "${YELLOW}⚡ 強制模式：跳過遠端刪除額外確認${NC}"
        return 0
    fi

    echo -e "${YELLOW}⚠️  遠端分支刪除會影響共享儲存庫，且通常無法只靠本機還原。${NC}"
    read -p "若確認要刪除遠端分支，請輸入 DELETE_REMOTE: " -r remote_reply

    if [[ "$remote_reply" == "DELETE_REMOTE" ]]; then
        return 0
    fi

    echo -e "${BLUE}ℹ️  取消刪除遠端分支${NC}"
    return 1
}

# 主要執行流程
echo -e "${GREEN}🚀 開始 Git 分支清理程序${NC}"
echo -e "${BLUE}📍 基礎分支: $BASE_BRANCH${NC}"

# 檢查網路連線
NETWORK_OK=false
if check_network; then
    NETWORK_OK=true
fi

ensure_clean_worktree

echo -e "${BLUE}📥 更新本地儲存庫...${NC}"
"$GIT_BIN" fetch -p 2>/dev/null || echo -e "${YELLOW}⚠️  fetch 時發生警告，繼續執行...${NC}"

echo -e "${BLUE}🔄 切換到基礎分支...${NC}"
"$GIT_BIN" checkout "$BASE_BRANCH" || {
    echo -e "${RED}✗ 無法切換到分支 $BASE_BRANCH${NC}"
    exit 1
}

if [[ "$NETWORK_OK" == "true" ]]; then
    echo -e "${BLUE}⬇️  更新基礎分支...${NC}"
    "$GIT_BIN" pull origin "$BASE_BRANCH" || echo -e "${YELLOW}⚠️  pull 時發生警告，繼續執行...${NC}"
fi

# 處理本地分支
echo -e "\n${GREEN}🏠 處理本地分支${NC}"
if [[ -n "$CUSTOM_PATTERN" ]]; then
    echo -e "${BLUE}🔍 搜尋已合併的本地分支（自訂模式: $CUSTOM_PATTERN）...${NC}"
else
    echo -e "${BLUE}🔍 搜尋所有已合併的本地分支...${NC}"
fi
local_branches=$(get_merged_local_branches "$BASE_BRANCH")

if confirm_deletion "本地" "$local_branches"; then
    echo -e "${BLUE}🗑️  刪除本地分支...${NC}"
    echo "$local_branches" | while read -r branch; do
        if [[ -n "$branch" ]]; then
            if "$GIT_BIN" branch -d "$branch" 2>/dev/null; then
                echo -e "${GREEN}✓ 已刪除本地分支: $branch${NC}"
            else
                echo -e "${RED}✗ 無法刪除本地分支: $branch${NC}"
            fi
        fi
    done
fi

# 處理遠端分支
if [[ "$REMOTE_CLEANUP" != "true" ]]; then
    echo -e "\n${YELLOW}ℹ️  遠端分支清理預設未啟用；如需清理遠端分支，請明確加入 --remote${NC}"
elif [[ "$NETWORK_OK" == "true" ]]; then
    echo -e "\n${GREEN}🌐 處理遠端分支${NC}"
    if [[ -n "$CUSTOM_PATTERN" ]]; then
        echo -e "${BLUE}🔍 搜尋已合併的遠端分支（自訂模式: $CUSTOM_PATTERN）...${NC}"
    else
        echo -e "${BLUE}🔍 搜尋所有已合併的遠端分支...${NC}"
    fi
    remote_branches=$(get_merged_remote_branches "$BASE_BRANCH")
    
    if confirm_deletion "遠端" "$remote_branches" && confirm_remote_phrase; then
        echo -e "${BLUE}🗑️  刪除遠端分支...${NC}"
        echo "$remote_branches" | while read -r branch; do
            if [[ -n "$branch" ]]; then
                if "$GIT_BIN" push origin --delete "$branch" 2>/dev/null; then
                    echo -e "${GREEN}✓ 已刪除遠端分支: $branch${NC}"
                else
                    echo -e "${RED}✗ 無法刪除遠端分支: $branch${NC}"
                fi
            fi
        done
    fi
else
    echo -e "\n${YELLOW}⚠️  跳過遠端分支清理（網路連線問題）${NC}"
fi

echo -e "\n${GREEN}✅ 分支清理完成！${NC}"
