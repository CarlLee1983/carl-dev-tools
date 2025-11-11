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

# 安裝選項
INSTALL_METHOD=""
FORCE_INSTALL=false
UNINSTALL=false

# 顯示使用說明
show_help() {
    echo -e "${BOLD}DevKit 安裝腳本${NC}"
    echo ""
    echo -e "${CYAN}功能：${NC}"
    echo "  將 devkit 安裝到系統，支援全域呼叫"
    echo ""
    echo -e "${CYAN}使用方式：${NC}"
    echo "  $0 [選項]"
    echo ""
    echo -e "${CYAN}選項：${NC}"
    echo "  --system          安裝到系統目錄 (/usr/local/bin)"
    echo "  --user            安裝到使用者目錄 (~/.local/bin)"
    echo "  --alias           建立 shell 別名"
    echo "  --force           強制安裝（覆蓋現有檔案）"
    echo "  --uninstall       移除安裝"
    echo "  --help            顯示此說明"
    echo ""
    echo -e "${CYAN}範例：${NC}"
    echo "  $0 --system       # 安裝到系統目錄"
    echo "  $0 --user         # 安裝到使用者目錄"
    echo "  $0 --alias        # 建立別名"
    echo "  $0 --uninstall    # 移除安裝"
}

# 檢查系統環境
check_environment() {
    echo -e "${BLUE}🔍 檢查系統環境...${NC}"
    
    # 檢查作業系統
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${GREEN}✅ 偵測到 macOS${NC}"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo -e "${GREEN}✅ 偵測到 Linux${NC}"
    else
        echo -e "${YELLOW}⚠️  未知作業系統：$OSTYPE${NC}"
        echo -e "${CYAN}💡 將嘗試使用通用安裝方式${NC}"
    fi
    
    # 檢查 devkit 腳本是否存在
    if [ ! -f "$DEVKIT_SCRIPT" ]; then
        echo -e "${RED}❌ 找不到 devkit 腳本：$DEVKIT_SCRIPT${NC}"
        exit 1
    fi
    
    # 檢查 devkit 腳本是否可執行
    if [ ! -x "$DEVKIT_SCRIPT" ]; then
        echo -e "${YELLOW}⚠️  設定 devkit 執行權限...${NC}"
        chmod +x "$DEVKIT_SCRIPT"
    fi
    
    echo -e "${GREEN}✅ 環境檢查完成${NC}"
}

# 系統安裝 (需要 sudo 權限)
install_system() {
    local target_dir="/usr/local/bin"
    local target_file="$target_dir/devkit"
    
    echo -e "${BLUE}🚀 安裝到系統目錄：$target_dir${NC}"
    
    # 檢查目錄是否存在
    if [ ! -d "$target_dir" ]; then
        echo -e "${YELLOW}⚠️  建立目錄：$target_dir${NC}"
        sudo mkdir -p "$target_dir" || {
            echo -e "${RED}❌ 無法建立目錄，請檢查權限${NC}"
            return 1
        }
    fi
    
    # 檢查是否已存在
    if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
        echo -e "${YELLOW}⚠️  檔案已存在：$target_file${NC}"
        read -p "是否要覆蓋？(y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}已取消安裝${NC}"
            return 1
        fi
    fi
    
    # 複製檔案
    if sudo cp "$DEVKIT_SCRIPT" "$target_file"; then
        sudo chmod +x "$target_file"
        echo -e "${GREEN}✅ 成功安裝到：$target_file${NC}"
        
        # 驗證安裝
        if command -v devkit >/dev/null 2>&1; then
            echo -e "${GREEN}✅ devkit 已可全域使用${NC}"
        else
            echo -e "${YELLOW}⚠️  可能需要重新載入 shell 或檢查 PATH 設定${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ 安裝失敗${NC}"
        return 1
    fi
}

# 使用者安裝
install_user() {
    local target_dir="$HOME/.local/bin"
    local target_file="$target_dir/devkit"
    
    echo -e "${BLUE}🚀 安裝到使用者目錄：$target_dir${NC}"
    
    # 建立目錄
    mkdir -p "$target_dir" || {
        echo -e "${RED}❌ 無法建立目錄：$target_dir${NC}"
        return 1
    }
    
    # 檢查是否已存在
    if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
        echo -e "${YELLOW}⚠️  檔案已存在：$target_file${NC}"
        read -p "是否要覆蓋？(y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}已取消安裝${NC}"
            return 1
        fi
    fi
    
    # 複製檔案
    if cp "$DEVKIT_SCRIPT" "$target_file"; then
        chmod +x "$target_file"
        echo -e "${GREEN}✅ 成功安裝到：$target_file${NC}"
        
        # 檢查 PATH 設定
        if [[ ":$PATH:" != *":$target_dir:"* ]]; then
            echo -e "${YELLOW}⚠️  $target_dir 不在 PATH 中${NC}"
            echo -e "${CYAN}💡 請將以下內容加入到 ~/.zshrc 或 ~/.bashrc：${NC}"
            echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
        else
            echo -e "${GREEN}✅ devkit 已可全域使用${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ 安裝失敗${NC}"
        return 1
    fi
}

# 建立別名
install_alias() {
    echo -e "${BLUE}🚀 建立 shell 別名${NC}"
    
    local shell_rc=""
    local alias_line="alias devkit=\"$DEVKIT_SCRIPT\""
    
    # 偵測 shell 類型
    if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
        shell_rc="$HOME/.zshrc"
        echo -e "${CYAN}偵測到 Zsh，使用 $shell_rc${NC}"
    elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
        shell_rc="$HOME/.bashrc"
        echo -e "${CYAN}偵測到 Bash，使用 $shell_rc${NC}"
    else
        echo -e "${YELLOW}⚠️  無法偵測 shell 類型${NC}"
        echo -e "${CYAN}請手動將以下內容加入到您的 shell 設定檔：${NC}"
        echo "$alias_line"
        return 0
    fi
    
    # 檢查別名是否已存在
    if [ -f "$shell_rc" ] && grep -q "alias devkit=" "$shell_rc"; then
        if [ "$FORCE_INSTALL" = false ]; then
            echo -e "${YELLOW}⚠️  別名已存在於 $shell_rc${NC}"
            read -p "是否要更新？(y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}已取消安裝${NC}"
                return 1
            fi
        fi
        
        # 移除舊的別名
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' '/alias devkit=/d' "$shell_rc"
        else
            sed -i '/alias devkit=/d' "$shell_rc"
        fi
    fi
    
    # 加入新的別名
    echo "$alias_line" >> "$shell_rc"
    echo -e "${GREEN}✅ 別名已加入到：$shell_rc${NC}"
    echo -e "${CYAN}💡 請執行以下命令重新載入設定：${NC}"
    echo "source $shell_rc"
    
    return 0
}

# 移除安裝
uninstall() {
    echo -e "${BLUE}🗑️  移除 devkit 安裝...${NC}"
    
    local removed=false
    
    # 移除系統安裝
    if [ -f "/usr/local/bin/devkit" ]; then
        echo -e "${YELLOW}移除系統安裝：/usr/local/bin/devkit${NC}"
        if sudo rm -f "/usr/local/bin/devkit"; then
            echo -e "${GREEN}✅ 已移除系統安裝${NC}"
            removed=true
        else
            echo -e "${RED}❌ 移除系統安裝失敗${NC}"
        fi
    fi
    
    # 移除使用者安裝
    if [ -f "$HOME/.local/bin/devkit" ]; then
        echo -e "${YELLOW}移除使用者安裝：$HOME/.local/bin/devkit${NC}"
        if rm -f "$HOME/.local/bin/devkit"; then
            echo -e "${GREEN}✅ 已移除使用者安裝${NC}"
            removed=true
        else
            echo -e "${RED}❌ 移除使用者安裝失敗${NC}"
        fi
    fi
    
    # 移除別名
    for rc_file in "$HOME/.zshrc" "$HOME/.bashrc"; do
        if [ -f "$rc_file" ] && grep -q "alias devkit=" "$rc_file"; then
            echo -e "${YELLOW}移除別名：$rc_file${NC}"
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' '/alias devkit=/d' "$rc_file"
            else
                sed -i '/alias devkit=/d' "$rc_file"
            fi
            echo -e "${GREEN}✅ 已移除別名${NC}"
            removed=true
        fi
    done
    
    if [ "$removed" = true ]; then
        echo -e "${GREEN}🎉 DevKit 移除完成${NC}"
        echo -e "${CYAN}💡 請重新載入 shell 或重新開啟終端${NC}"
    else
        echo -e "${YELLOW}⚠️  沒有找到已安裝的 devkit${NC}"
    fi
}

# 互動式安裝
interactive_install() {
    echo -e "${BOLD}🛠️  DevKit 互動式安裝${NC}"
    echo ""
    echo -e "${CYAN}請選擇安裝方式：${NC}"
    echo "  1. 系統安裝 (需要 sudo 權限，所有使用者可用)"
    echo "  2. 使用者安裝 (僅當前使用者可用)"
    echo "  3. 建立別名 (最簡單的方式)"
    echo "  4. 取消安裝"
    echo ""
    
    read -p "請輸入選項 (1-4): " choice
    
    case "$choice" in
        1)
            INSTALL_METHOD="system"
            ;;
        2)
            INSTALL_METHOD="user"
            ;;
        3)
            INSTALL_METHOD="alias"
            ;;
        4)
            echo -e "${YELLOW}已取消安裝${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 無效選項${NC}"
            exit 1
            ;;
    esac
}

# 主程式
main() {
    # 解析命令列參數
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
            --uninstall)
                UNINSTALL=true
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
    
    # 檢查環境
    check_environment
    echo ""
    
    # 處理移除安裝
    if [ "$UNINSTALL" = true ]; then
        uninstall
        exit 0
    fi
    
    # 如果沒有指定安裝方式，使用互動式安裝
    if [ -z "$INSTALL_METHOD" ]; then
        interactive_install
        echo ""
    fi
    
    # 執行安裝
    case "$INSTALL_METHOD" in
        "system")
            if install_system; then
                echo ""
                echo -e "${GREEN}🎉 DevKit 系統安裝完成！${NC}"
                echo -e "${CYAN}現在您可以在任何地方使用 'devkit' 命令${NC}"
            fi
            ;;
        "user")
            if install_user; then
                echo ""
                echo -e "${GREEN}🎉 DevKit 使用者安裝完成！${NC}"
                echo -e "${CYAN}現在您可以在任何地方使用 'devkit' 命令${NC}"
            fi
            ;;
        "alias")
            if install_alias; then
                echo ""
                echo -e "${GREEN}🎉 DevKit 別名安裝完成！${NC}"
                echo -e "${CYAN}重新載入 shell 後即可使用 'devkit' 命令${NC}"
            fi
            ;;
        *)
            echo -e "${RED}❌ 無效的安裝方式：$INSTALL_METHOD${NC}"
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${CYAN}💡 測試安裝：${NC}"
    echo "devkit --help"
}

# 執行主程式
main "$@"
