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

main() {
    echo -e "${BOLD}🐳 Docker 保守資源清理${NC}"
    check_docker_available || exit 1

    local prune_cmd=("system" "prune" "--force")

    if [[ "$WITH_VOLUMES" == "true" ]]; then
        if ! confirm_volumes_phrase; then
            exit 1
        fi
        prune_cmd+=("--volumes")
    fi

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
