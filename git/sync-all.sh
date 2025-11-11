#!/bin/bash
# ==========================================
# 通用 Git 同步腳本（macOS / Linux 通用）
# 作者: 李卡爾
# 功能: 自動同步指定專案中指定分支
# 使用方式: 在專案目錄下執行 ./scripts/git/sync-all.sh
# 注意: 此腳本會同步所有分支，請確保在專案目錄下執行
# 建議使用方式
# 1. 在專案目錄下執行 ./scripts/git/sync-all.sh
# 2. alias git-sync="~/scripts/git/sync-all.sh" && source ~/.zshrc, then git-sync
# ==========================================

# 使用當前目錄作為專案目錄
PROJECT_DIRS=(
  "$(pwd)"
)

# 基本要同步的分支（會自動檢測主分支是 main 還是 master）
BASE_BRANCHES=(develop)
# 可選的分支（如果存在才同步）
OPTIONAL_BRANCHES=(testing)
# 主分支候選（按優先順序）
MAIN_BRANCH_CANDIDATES=(main master)

# 彩色輸出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'


# 檢查工作目錄是否乾淨
check_working_directory() {
  local project_dir="$1"
  local status_output
  
  status_output=$(git status --porcelain 2>/dev/null)
  
  if [ -n "$status_output" ]; then
    echo -e "   ${RED}⚠️  工作目錄有未提交的變更，跳過同步${NC}"
    echo -e "   ${YELLOW}未提交的檔案：${NC}"
    echo "$status_output" | while read -r line; do
      echo -e "     $line"
    done
    return 1
  fi
  
  return 0
}


# 同步單個專案
sync_project() {
  local dir="$1"
  local original_branch
  
  echo -e "📂  專案：$dir"
  cd "$dir" || {
    echo -e "   ${RED}⚠️  無法進入專案目錄${NC}"
    return
  }

  # 記錄原始分支
  original_branch=$(git branch --show-current 2>/dev/null)
  if [ -z "$original_branch" ]; then
    original_branch="HEAD"
  fi
  echo -e "   ${BLUE}📍 當前分支：$original_branch${NC}"

  # 檢查工作目錄狀態
  if ! check_working_directory "$dir"; then
    return
  fi

  # 嘗試 fetch，同時檢查網路連線
  echo -e "   🔄 獲取遠端分支資訊..."
  if ! git fetch --all --prune &>/dev/null; then
    echo -e "   ${RED}⚠️  無法連接到遠端倉庫，跳過同步${NC}"
    return
  fi
  
  # 一次性獲取所有遠端分支資訊
  echo -e "   🔍 檢測可用分支..."
  remote_branches=$(git branch -r --format='%(refname:short)' | sed 's/origin\///' | grep -v HEAD || true)
  
  # 收集要同步的分支
  branches_to_sync=()
  
  # 自動檢測主分支
  main_branch=""
  for candidate in "${MAIN_BRANCH_CANDIDATES[@]}"; do
    if echo "$remote_branches" | grep -q "^${candidate}$"; then
      main_branch="$candidate"
      break
    fi
  done
  
  if [ -n "$main_branch" ]; then
    branches_to_sync+=("$main_branch")
    echo -e "   ${BLUE}📍 檢測到主分支：$main_branch${NC}"
  else
    echo -e "   ${YELLOW}⚠️  未找到主分支（main 或 master）${NC}"
  fi
  
  # 添加基本分支
  for branch in "${BASE_BRANCHES[@]}"; do
    if echo "$remote_branches" | grep -q "^${branch}$"; then
      branches_to_sync+=("$branch")
    else
      echo -e "   ${YELLOW}⚠️  遠端無基本分支：$branch${NC}"
    fi
  done
  
  # 添加可選分支（如果存在）
  for branch in "${OPTIONAL_BRANCHES[@]}"; do
    if echo "$remote_branches" | grep -q "^${branch}$"; then
      branches_to_sync+=("$branch")
    fi
  done
  
  # 獲取本地分支資訊，避免重複調用
  local_branches=$(git branch --format='%(refname:short)' 2>/dev/null || true)
  
  # 同步所有收集到的分支（已驗證存在）
  for branch in "${branches_to_sync[@]}"; do
    # 檢查本地是否有該分支，若沒有則建立追蹤
    if ! echo "$local_branches" | grep -q "^${branch}$"; then
      echo -e "   🌿 建立本地分支：$branch"
      if ! git checkout -b "$branch" "origin/$branch" &>/dev/null; then
        echo -e "   ${RED}⚠️  無法建立本地分支 $branch，略過${NC}"
        continue
      fi
    fi

    # 嘗試同步
    echo -e "   🌿 同步分支：$branch"
    if git checkout "$branch" &>/dev/null; then
      if git pull --rebase origin "$branch" &>/dev/null; then
        echo -e "   ${GREEN}✅ $branch 同步成功${NC}"
      else
        echo -e "   ${YELLOW}⚠️  同步 $branch 失敗（可能無變更或衝突）${NC}"
      fi
    else
      echo -e "   ${RED}⚠️  無法切換到分支 $branch${NC}"
    fi
  done

  # 恢復原始分支
  if [ "$original_branch" != "HEAD" ]; then
    echo -e "   ${BLUE}🔄 恢復到原始分支：$original_branch${NC}"
    if ! git checkout "$original_branch" &>/dev/null; then
      echo -e "   ${YELLOW}⚠️  無法恢復到原始分支 $original_branch${NC}"
    fi
  fi
}

echo -e "\n🔄 開始同步專案：$(date)\n"

for dir in "${PROJECT_DIRS[@]}"; do
  if [ ! -d "$dir/.git" ]; then
    echo -e "${YELLOW}⚠️  跳過：$dir（不是 git 專案）${NC}"
    continue
  fi

  sync_project "$dir"
done

echo -e "${GREEN}✅ 同步完成！${NC}\n"
