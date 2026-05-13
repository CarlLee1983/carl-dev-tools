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
