#!/bin/bash
# Description: Reset all IPFS cluster data (WARNING: destructive)

source "$(dirname "${BASH_SOURCE[0]}")/clean.sh"

reset_command() {
    read -p "Are you sure you want to reset? This will remove all IPFS cluster data [y/N]: " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        logger "WARN" "Performing reset..."
        clean_command
        
        # Check if running on Ubuntu/Debian
        if [ -f /etc/os-release ] && grep -qi "ubuntu\|debian" /etc/os-release; then
            sudo rm -rf data
        else
            rm -rf data
        fi
        
        logger "INFO" "Reset complete"
    else
        logger "INFO" "Reset cancelled"
    fi
} 