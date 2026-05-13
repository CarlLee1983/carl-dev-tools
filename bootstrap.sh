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
