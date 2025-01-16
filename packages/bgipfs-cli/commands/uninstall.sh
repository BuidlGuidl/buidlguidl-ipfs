#!/bin/bash
# Description: Uninstall bgipfs and remove all components

source "$(dirname "${BASH_SOURCE[0]}")/clean.sh"

uninstall_command() {
    # Check if running from system installation
    if [ ! -d "/usr/local/lib/bgipfs" ] && [ ! -L "/usr/local/bin/bgipfs" ]; then
        logger "WARN" "No system installation of bgipfs detected"
        logger "INFO" "If you're running in development mode, use 'bgipfs clean' instead"
        return 1
    fi

    logger "WARN" "This will uninstall bgipfs and remove all components:"
    logger "WARN" "- Removing the installation directory (/usr/local/lib/bgipfs)"
    logger "WARN" "- Removing the global command symlink"
    logger "WARN" "- Stopping and removing all Docker containers (if running)"
    
    read -p "Are you sure you want to uninstall bgipfs? [y/N] " response
    if [[ ! $response =~ ^[Yy]$ ]]; then
        logger "INFO" "Uninstall cancelled"
        return 0
    fi

    # First clean up any running containers
    logger "INFO" "Cleaning up Docker containers..."
    clean_command

    # Remove installation directory
    logger "INFO" "Removing installation directory..."
    if [ -d "/usr/local/lib/bgipfs" ]; then
        sudo rm -rf "/usr/local/lib/bgipfs"
    fi

    # Remove symlink
    logger "INFO" "Removing command symlink..."
    if [ -L "/usr/local/bin/bgipfs" ]; then
        sudo rm -f "/usr/local/bin/bgipfs"
    fi
    
    logger "INFO" "bgipfs has been uninstalled successfully"
} 