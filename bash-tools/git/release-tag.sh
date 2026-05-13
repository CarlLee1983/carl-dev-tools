#!/bin/bash
# ==========================================
# Git 智慧版本標籤工具
# 作者: 李卡爾
# 功能: 智慧掃描現有標籤前綴，互動式版本遞增
# 使用方式: ./git/release-tag.sh
# ==========================================

# 彩色輸出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 全域變數
FORCE_MODE=false
PUSH_TO_REMOTE=false
SELECTED_PREFIX=""
CURRENT_VERSION=""
NEW_VERSION=""
AVAILABLE_MAIN_BRANCHES=()
GIT_BIN="${DEVKIT_GIT_BIN:-git}"

# 顯示使用說明
show_help() {
    echo -e "${BOLD}Git 智慧版本標籤工具${NC}"
    echo ""
    echo -e "${CYAN}功能：${NC}"
    echo "  • 自動掃描專案中的標籤前綴"
    echo "  • 互動式選擇前綴和版本遞增類型"
    echo "  • 智慧生成下一個版本標籤"
    echo "  • 自動同步遠端標籤，避免重複標籤"
    echo "  • 檢查 commit SHA1，防止在同一 commit 重複建標籤"
    echo "  • 智慧分支檢查，可切換到主要分支進行標籤操作"
    echo ""
    echo -e "${CYAN}使用方式：${NC}"
    echo "  $0 [選項]"
    echo ""
    echo -e "${CYAN}選項：${NC}"
    echo "  --push          建立標籤後自動推送到遠端"
    echo "  --force         強制模式，跳過確認"
    echo "  --help          顯示此說明"
    echo ""
    echo -e "${CYAN}範例：${NC}"
    echo "  $0                    # 互動式模式"
    echo "  $0 --push            # 建立標籤並推送"
    echo "  $0 --force --push    # 強制模式並推送"
}

# 檢查工作目錄是否乾淨
check_working_directory() {
    local status_output
    status_output=$("$GIT_BIN" status --porcelain 2>/dev/null)
    
    if [ -n "$status_output" ]; then
        echo -e "${RED}⚠️  工作目錄有未提交的變更${NC}"
        echo -e "${YELLOW}未提交的檔案：${NC}"
        echo "$status_output" | while read -r line; do
            echo -e "   $line"
        done
        
        if [ "$FORCE_MODE" = false ]; then
            echo ""
            read -p "是否要繼續？(y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}已取消操作${NC}"
                exit 1
            fi
        fi
    fi
}

# 獲取遠端最新標籤
fetch_remote_tags() {
    echo -e "${BLUE}🔄 獲取遠端最新標籤...${NC}"
    
    # 檢查是否有遠端倉庫
    if ! "$GIT_BIN" remote -v | grep -q .; then
        echo -e "${YELLOW}⚠️  沒有設定遠端倉庫，跳過標籤同步${NC}"
        return 0
    fi
    
    # 嘗試 fetch 標籤
    if "$GIT_BIN" fetch --tags --prune-tags &>/dev/null; then
        echo -e "${GREEN}✅ 成功獲取遠端標籤${NC}"
    else
        echo -e "${YELLOW}⚠️  無法連接到遠端倉庫，使用本地標籤${NC}"
        echo -e "${CYAN}💡 建議檢查網路連線或遠端倉庫設定${NC}"
    fi
}

# 檢查 SHA1 碼是否與最新標籤相同
check_commit_sha() {
    local prefix="$1"
    
    # 獲取當前 commit 的 SHA1
    local current_sha
    current_sha=$("$GIT_BIN" rev-parse HEAD)
    
    # 獲取該前綴下的最新標籤
    local latest_tag
    latest_tag=$("$GIT_BIN" tag -l "${prefix}/v*" 2>/dev/null | sort -V | tail -n1)
    
    if [ -z "$latest_tag" ]; then
        # 沒有現有標籤，可以建立
        echo -e "${BLUE}📍 沒有現有標籤，可以建立新標籤${NC}"
        return 0
    fi
    
    # 獲取最新標籤的 commit SHA1
    local tag_sha
    tag_sha=$("$GIT_BIN" rev-list -n 1 "$latest_tag" 2>/dev/null)
    
    if [ -z "$tag_sha" ]; then
        echo -e "${YELLOW}⚠️  無法獲取標籤 ${latest_tag} 的 commit 資訊${NC}"
        return 0
    fi
    
    # 比較 SHA1
    if [ "$current_sha" = "$tag_sha" ]; then
        echo -e "${RED}❌ 當前 commit (${current_sha:0:8}) 與最新標籤 ${latest_tag} 的 commit 相同${NC}"
        echo -e "${CYAN}💡 不能在同一個 commit 上建立多個相同前綴的標籤${NC}"
        echo -e "${YELLOW}建議：先進行新的 commit 或選擇不同的標籤前綴${NC}"
        return 1
    else
        echo -e "${GREEN}✅ 當前 commit (${current_sha:0:8}) 與最新標籤 ${latest_tag} (${tag_sha:0:8}) 不同，可以建立新標籤${NC}"
        return 0
    fi
}

# 掃描可用的主要分支
scan_main_branches() {
    echo -e "${BLUE}🔍 掃描可用的主要分支...${NC}"
    
    # 主要分支候選清單
    local main_branch_candidates=("main" "master" "develop" "testing" "staging" "release")
    local available_branches=()
    
    # 獲取所有本地和遠端分支
    local all_branches
    all_branches=$("$GIT_BIN" branch -a 2>/dev/null | sed 's/^[* ] //' | sed 's/remotes\/origin\///' | sort -u | grep -v HEAD || true)
    
    # 檢查哪些主要分支存在
    for candidate in "${main_branch_candidates[@]}"; do
        if echo "$all_branches" | grep -q "^${candidate}$"; then
            available_branches+=("$candidate")
        fi
    done
    
    if [ ${#available_branches[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️  沒有找到常見的主要分支${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ 找到以下主要分支：${NC}"
    for i in "${!available_branches[@]}"; do
        echo "  $((i+1)). ${available_branches[i]}"
    done
    
    # 將結果存到全域變數供其他函數使用
    AVAILABLE_MAIN_BRANCHES=("${available_branches[@]}")
    return 0
}

# 檢查並選擇分支
check_and_select_branch() {
    local current_branch
    current_branch=$("$GIT_BIN" branch --show-current 2>/dev/null)
    
    echo -e "${BLUE}📍 當前分支：${current_branch}${NC}"
    
    # 掃描主要分支
    if ! scan_main_branches; then
        echo -e "${CYAN}💡 繼續在當前分支 ${current_branch} 上操作${NC}"
        return 0
    fi
    
    # 檢查當前分支是否為主要分支
    local is_main_branch=false
    for branch in "${AVAILABLE_MAIN_BRANCHES[@]}"; do
        if [ "$current_branch" = "$branch" ]; then
            is_main_branch=true
            break
        fi
    done
    
    if [ "$is_main_branch" = true ]; then
        echo -e "${GREEN}✅ 當前已在主要分支上${NC}"
        
        if [ "$FORCE_MODE" = false ]; then
            echo ""
            read -p "是否要切換到其他分支？(y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${BLUE}✓ 繼續在當前分支 ${current_branch} 上操作${NC}"
                return 0
            fi
        else
            return 0
        fi
    else
        echo -e "${YELLOW}⚠️  當前分支 ${current_branch} 不是常見的主要分支${NC}"
        
        if [ "$FORCE_MODE" = false ]; then
            echo ""
            read -p "是否要切換到主要分支？(Y/n): " -r
            if [[ $REPLY =~ ^[Nn]$ ]]; then
                echo -e "${BLUE}✓ 繼續在當前分支 ${current_branch} 上操作${NC}"
                return 0
            fi
        else
            return 0
        fi
    fi
    
    # 選擇要切換的分支
    select_and_switch_branch
}

# 選擇並切換分支
select_and_switch_branch() {
    echo ""
    echo -e "${CYAN}請選擇要切換的分支：${NC}"
    
    for i in "${!AVAILABLE_MAIN_BRANCHES[@]}"; do
        echo "  $((i+1)). ${AVAILABLE_MAIN_BRANCHES[i]}"
    done
    echo "  $((${#AVAILABLE_MAIN_BRANCHES[@]}+1)). 取消切換"
    
    while true; do
        read -p "請輸入編號 (1-$((${#AVAILABLE_MAIN_BRANCHES[@]}+1))): " -r choice
        
        if [[ "$choice" =~ ^[0-9]+$ ]]; then
            if [ "$choice" -ge 1 ] && [ "$choice" -le "${#AVAILABLE_MAIN_BRANCHES[@]}" ]; then
                local selected_branch="${AVAILABLE_MAIN_BRANCHES[$((choice-1))]}"
                
                echo -e "${BLUE}🔄 切換到分支：${selected_branch}${NC}"
                
                # 檢查工作目錄是否乾淨
                local status_output
                status_output=$("$GIT_BIN" status --porcelain 2>/dev/null)
                
                if [ -n "$status_output" ]; then
                    echo -e "${RED}❌ 工作目錄有未提交的變更，無法切換分支${NC}"
                    echo -e "${YELLOW}請先提交或暫存變更後再執行此腳本${NC}"
                    exit 1
                fi
                
                # 切換分支
                if "$GIT_BIN" checkout "$selected_branch" &>/dev/null; then
                    echo -e "${GREEN}✅ 成功切換到分支：${selected_branch}${NC}"
                    
                    # 嘗試拉取最新變更
                    echo -e "${BLUE}🔄 拉取最新變更...${NC}"
                    if "$GIT_BIN" pull origin "$selected_branch" &>/dev/null; then
                        echo -e "${GREEN}✅ 成功拉取最新變更${NC}"
                    else
                        echo -e "${YELLOW}⚠️  無法拉取最新變更，繼續使用本地版本${NC}"
                    fi
                else
                    echo -e "${RED}❌ 切換分支失敗${NC}"
                    exit 1
                fi
                break
            elif [ "$choice" -eq $((${#AVAILABLE_MAIN_BRANCHES[@]}+1)) ]; then
                echo -e "${YELLOW}✓ 取消切換，繼續在當前分支上操作${NC}"
                break
            else
                echo -e "${RED}❌ 請輸入有效的編號 (1-$((${#AVAILABLE_MAIN_BRANCHES[@]}+1)))${NC}"
            fi
        else
            echo -e "${RED}❌ 請輸入有效的編號 (1-$((${#AVAILABLE_MAIN_BRANCHES[@]}+1)))${NC}"
        fi
    done
}

# 掃描所有標籤前綴
scan_tag_prefixes() {
    echo -e "${BLUE}🔍 掃描專案標籤前綴...${NC}"
    
    # 獲取所有標籤
    local all_tags
    all_tags=$("$GIT_BIN" tag -l 2>/dev/null | sort -V)
    
    if [ -z "$all_tags" ]; then
        echo -e "${YELLOW}⚠️  專案中沒有任何標籤${NC}"
        echo -e "${CYAN}💡 將建立第一個標籤${NC}"
        return 1
    fi
    
    # 解析前綴（格式：prefix/vX.Y.Z）
    local prefixes
    prefixes=$(echo "$all_tags" | grep -E '^[^/]+/v[0-9]+\.[0-9]+\.[0-9]+' | cut -d'/' -f1 | sort -u)
    
    if [ -z "$prefixes" ]; then
        echo -e "${YELLOW}⚠️  沒有找到符合格式的標籤（格式：prefix/vX.Y.Z）${NC}"
        echo -e "${CYAN}💡 將建立第一個標籤${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ 找到以下標籤前綴：${NC}"
    echo "$prefixes" | nl -w2 -s'. '
    
    return 0
}

# 選擇標籤前綴
select_prefix() {
    local prefixes
    prefixes=$("$GIT_BIN" tag -l 2>/dev/null | grep -E '^[^/]+/v[0-9]+\.[0-9]+\.[0-9]+' | cut -d'/' -f1 | sort -u)
    
    if [ -z "$prefixes" ]; then
        # 沒有現有標籤，讓使用者輸入新前綴
        echo ""
        echo -e "${CYAN}請輸入新的標籤前綴（例如：release, testing, hotfix）：${NC}"
        read -r SELECTED_PREFIX
        
        if [ -z "$SELECTED_PREFIX" ]; then
            echo -e "${RED}❌ 前綴不能為空${NC}"
            exit 1
        fi
        
        CURRENT_VERSION="0.0.0"
        echo -e "${BLUE}📍 將建立第一個標籤：${SELECTED_PREFIX}/v0.0.1${NC}"
        return 0
    fi
    
    local prefix_array=()
    while IFS= read -r line; do
        prefix_array+=("$line")
    done <<< "$prefixes"
    
    echo ""
    echo -e "${CYAN}請選擇要操作的標籤前綴：${NC}"
    
    while true; do
        read -p "請輸入編號 (1-${#prefix_array[@]}): " -r choice
        
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#prefix_array[@]}" ]; then
            SELECTED_PREFIX="${prefix_array[$((choice-1))]}"
            break
        else
            echo -e "${RED}❌ 請輸入有效的編號 (1-${#prefix_array[@]})${NC}"
        fi
    done
    
    echo -e "${GREEN}✅ 已選擇前綴：${SELECTED_PREFIX}${NC}"
}

# 獲取指定前綴的最新版本
get_latest_version() {
    local prefix="$1"
    local latest_tag
    
    latest_tag=$("$GIT_BIN" tag -l "${prefix}/v*" 2>/dev/null | sort -V | tail -n1)
    
    if [ -z "$latest_tag" ]; then
        CURRENT_VERSION="0.0.0"
    else
        CURRENT_VERSION=$(echo "$latest_tag" | sed "s|^${prefix}/v||")
    fi
    
    echo -e "${BLUE}📍 當前最新版本：${prefix}/v${CURRENT_VERSION}${NC}"
}

# 解析版本號
parse_version() {
    local version="$1"
    local major minor patch
    
    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        major="${BASH_REMATCH[1]}"
        minor="${BASH_REMATCH[2]}"
        patch="${BASH_REMATCH[3]}"
        echo "$major $minor $patch"
    else
        echo "0 0 0"
    fi
}

# 遞增版本號
increment_version() {
    local increment_type="$1"
    local version_parts
    local major minor patch
    
    version_parts=($(parse_version "$CURRENT_VERSION"))
    major="${version_parts[0]}"
    minor="${version_parts[1]}"
    patch="${version_parts[2]}"
    
    case "$increment_type" in
        "patch")
            patch=$((patch + 1))
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        *)
            echo -e "${RED}❌ 無效的遞增類型：$increment_type${NC}"
            exit 1
            ;;
    esac
    
    NEW_VERSION="${major}.${minor}.${patch}"
}

# 選擇版本遞增類型
select_increment_type() {
    echo ""
    echo -e "${CYAN}請選擇版本遞增類型：${NC}"
    echo "1. patch  - 修復版本 (${CURRENT_VERSION} → $(increment_version "patch" && echo "$NEW_VERSION"))"
    echo "2. minor  - 功能版本 (${CURRENT_VERSION} → $(increment_version "minor" && echo "$NEW_VERSION"))"  
    echo "3. major  - 重大版本 (${CURRENT_VERSION} → $(increment_version "major" && echo "$NEW_VERSION"))"
    
    while true; do
        read -p "請輸入編號 (1-3): " -r choice
        
        case "$choice" in
            1)
                increment_version "patch"
                echo -e "${GREEN}✅ 已選擇 patch 遞增：${CURRENT_VERSION} → ${NEW_VERSION}${NC}"
                break
                ;;
            2)
                increment_version "minor"
                echo -e "${GREEN}✅ 已選擇 minor 遞增：${CURRENT_VERSION} → ${NEW_VERSION}${NC}"
                break
                ;;
            3)
                increment_version "major"
                echo -e "${GREEN}✅ 已選擇 major 遞增：${CURRENT_VERSION} → ${NEW_VERSION}${NC}"
                break
                ;;
            *)
                echo -e "${RED}❌ 請輸入有效的編號 (1-3)${NC}"
                ;;
        esac
    done
}

# 建立標籤
create_tag() {
    local tag_name="${SELECTED_PREFIX}/v${NEW_VERSION}"
    
    # 再次 fetch 確保最新狀態
    echo -e "${BLUE}🔄 最終檢查遠端標籤狀態...${NC}"
    "$GIT_BIN" fetch --tags &>/dev/null
    
    # 檢查標籤是否已存在（本地）
    if "$GIT_BIN" tag -l | grep -q "^${tag_name}$"; then
        echo -e "${RED}❌ 標籤 ${tag_name} 已存在於本地${NC}"
        exit 1
    fi
    
    # 檢查遠端是否有此標籤
    if "$GIT_BIN" ls-remote --tags origin 2>/dev/null | grep -q "refs/tags/${tag_name}$"; then
        echo -e "${RED}❌ 標籤 ${tag_name} 已存在於遠端${NC}"
        echo -e "${CYAN}💡 請重新執行腳本以獲取最新版本資訊${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${CYAN}即將建立標籤：${tag_name}${NC}"
    
    if [ "$FORCE_MODE" = false ]; then
        read -p "確定要建立此標籤嗎？(y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}已取消操作${NC}"
            exit 1
        fi
        
        # 如果沒有透過參數指定推送，則詢問是否要推送
        if [ "$PUSH_TO_REMOTE" = false ]; then
            echo ""
            read -p "是否要同時推送標籤到遠端？(y/N): " -r
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                PUSH_TO_REMOTE=true
                echo -e "${BLUE}✓ 將會推送標籤到遠端${NC}"
            else
                echo -e "${YELLOW}✓ 僅建立本地標籤${NC}"
            fi
        fi
    fi
    
    # 建立標籤
    if "$GIT_BIN" tag -a "$tag_name" -m "Release version ${NEW_VERSION}"; then
        echo -e "${GREEN}✅ 成功建立標籤：${tag_name}${NC}"
        
        # 推送到遠端（如果需要）
        if [ "$PUSH_TO_REMOTE" = true ]; then
            echo -e "${BLUE}🚀 推送標籤到遠端...${NC}"
            if "$GIT_BIN" push origin "$tag_name"; then
                echo -e "${GREEN}✅ 成功推送標籤到遠端${NC}"
            else
                echo -e "${YELLOW}⚠️  推送標籤失敗，但本地標籤已建立${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ 建立標籤失敗${NC}"
        exit 1
    fi
}

# 主程式
main() {
    echo -e "${BOLD}🏷️  Git 智慧版本標籤工具${NC}"
    echo ""
    
    # 檢查是否在 git 專案中
    if ! "$GIT_BIN" rev-parse --git-dir >/dev/null 2>&1; then
        echo -e "${RED}❌ 當前目錄不是 Git 專案${NC}"
        exit 1
    fi
    
    # 檢查工作目錄
    check_working_directory
    
    # 檢查並選擇分支
    echo ""
    echo -e "${BLUE}🌿 檢查分支狀態...${NC}"
    check_and_select_branch
    
    # 獲取遠端最新標籤
    fetch_remote_tags
    
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
    
    # 檢查 commit SHA1 是否與最新標籤相同
    echo ""
    echo -e "${BLUE}🔍 檢查 commit 狀態...${NC}"
    if ! check_commit_sha "$SELECTED_PREFIX"; then
        exit 1
    fi
    
    # 選擇遞增類型
    select_increment_type
    
    # 建立標籤
    create_tag
    
    echo ""
    echo -e "${GREEN}🎉 版本標籤操作完成！${NC}"
}

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
