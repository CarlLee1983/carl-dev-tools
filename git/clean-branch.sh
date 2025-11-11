#!/bin/bash
set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 預設值
FORCE_MODE=false

# 解析命令列參數
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_MODE=true
            shift
            ;;
        -h|--help)
            echo "使用方式: $0 [選項] [基礎分支]"
            echo "選項:"
            echo "  --force, -f    跳過確認直接刪除分支"
            echo "  --help, -h     顯示此說明"
            echo ""
            echo "範例:"
            echo "  $0                    # 自動偵測主要分支"
            echo "  $0 develop           # 使用 develop 作為基礎分支"
            echo "  $0 --force main      # 強制模式，使用 main 分支"
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
        if git show-ref --verify --quiet refs/heads/"$SPECIFIED_BRANCH" 2>/dev/null || \
           git show-ref --verify --quiet refs/remotes/origin/"$SPECIFIED_BRANCH" 2>/dev/null; then
            echo "$SPECIFIED_BRANCH"
            return 0
        else
            echo -e "${RED}✗ 指定的分支 '$SPECIFIED_BRANCH' 不存在${NC}" >&2
            exit 1
        fi
    fi
    
    # 自動偵測順序：main -> master -> develop
    for branch in main master develop; do
        if git show-ref --verify --quiet refs/heads/"$branch" 2>/dev/null || \
           git show-ref --verify --quiet refs/remotes/origin/"$branch" 2>/dev/null; then
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
    if ! git ls-remote --exit-code origin &>/dev/null; then
        echo -e "${RED}✗ 無法連接到遠端儲存庫，將跳過遠端分支清理${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ 網路連線正常${NC}"
    return 0
}

# 取得已合併的本地分支
get_merged_local_branches() {
    local base_branch="$1"
    
    # 功能分支模式：feature/, fix/, feat/, test/, hotfix/, bugfix/, chore/
    local branch_patterns="(feature/|fix/|feat/|test/|hotfix/|bugfix/|chore/)"
    
    git branch --merged "$base_branch" | \
        egrep -v "(^\*|master|main|develop|testing|staging|production)" | \
        grep -E "$branch_patterns" | \
        sed 's/^[[:space:]]*//' || true
}

# 取得已合併的遠端分支
get_merged_remote_branches() {
    local base_branch="$1"
    
    # 功能分支模式：feature/, fix/, feat/, test/, hotfix/, bugfix/, chore/
    local branch_patterns="(feature/|fix/|feat/|test/|hotfix/|bugfix/|chore/)"
    
    git branch -r --merged "origin/$base_branch" | \
        grep -E "$branch_patterns" | \
        grep -v "origin/HEAD" | \
        sed 's/^[[:space:]]*origin\///' || true
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
    read -p "確定要刪除這些分支嗎？(y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        echo -e "${BLUE}ℹ️  取消刪除${branch_type}分支${NC}"
        return 1
    fi
}

# 主要執行流程
echo -e "${GREEN}🚀 開始 Git 分支清理程序${NC}"
echo -e "${BLUE}📍 基礎分支: $BASE_BRANCH${NC}"

# 檢查網路連線
NETWORK_OK=false
if check_network; then
    NETWORK_OK=true
fi

echo -e "${BLUE}📥 更新本地儲存庫...${NC}"
git fetch -p 2>/dev/null || echo -e "${YELLOW}⚠️  fetch 時發生警告，繼續執行...${NC}"

echo -e "${BLUE}🔄 切換到基礎分支...${NC}"
git checkout "$BASE_BRANCH" || {
    echo -e "${RED}✗ 無法切換到分支 $BASE_BRANCH${NC}"
    exit 1
}

if [[ "$NETWORK_OK" == "true" ]]; then
    echo -e "${BLUE}⬇️  更新基礎分支...${NC}"
    git pull origin "$BASE_BRANCH" || echo -e "${YELLOW}⚠️  pull 時發生警告，繼續執行...${NC}"
fi

# 處理本地分支
echo -e "\n${GREEN}🏠 處理本地分支${NC}"
echo -e "${BLUE}🔍 搜尋已合併的本地分支...${NC}"
local_branches=$(get_merged_local_branches "$BASE_BRANCH")

if confirm_deletion "本地" "$local_branches"; then
    echo -e "${BLUE}🗑️  刪除本地分支...${NC}"
    echo "$local_branches" | while read -r branch; do
        if [[ -n "$branch" ]]; then
            if git branch -d "$branch" 2>/dev/null; then
                echo -e "${GREEN}✓ 已刪除本地分支: $branch${NC}"
            else
                echo -e "${RED}✗ 無法刪除本地分支: $branch${NC}"
            fi
        fi
    done
fi

# 處理遠端分支
if [[ "$NETWORK_OK" == "true" ]]; then
    echo -e "\n${GREEN}🌐 處理遠端分支${NC}"
    echo -e "${BLUE}🔍 搜尋已合併的遠端分支...${NC}"
    remote_branches=$(get_merged_remote_branches "$BASE_BRANCH")
    
    if confirm_deletion "遠端" "$remote_branches"; then
        echo -e "${BLUE}🗑️  刪除遠端分支...${NC}"
        echo "$remote_branches" | while read -r branch; do
            if [[ -n "$branch" ]]; then
                if git push origin --delete "$branch" 2>/dev/null; then
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
