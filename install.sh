#!/bin/bash
# ==========================================
# DevKit 安裝腳本
# 功能: 將 devkit 安裝到系統 PATH，支援全域呼叫
# 使用方式: ./install.sh [選項]
# ==========================================

# 腳本基本路徑
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVKIT_SCRIPT="$SCRIPT_DIR/devkit"

# 彩色輸出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 統一錯誤輸出：紅色 + 「錯誤：」前綴 + stderr
print_error() {
    echo -e "${RED}錯誤：$1${NC}" >&2
}

# 安裝選項
INSTALL_METHOD=""
FORCE_INSTALL=false
NON_INTERACTIVE=false
UNINSTALL=false

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
