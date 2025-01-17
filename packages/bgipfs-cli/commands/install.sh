#!/bin/bash
# Description: Install all required dependencies

source "$(dirname "${BASH_SOURCE[0]}")/../lib/system.sh"

install_command() {
    logger "INFO" "This will install all required dependencies."
    read -p "Continue with installation? [y/N] " response
    
    if [[ ! $response =~ ^[Yy]$ ]]; then
        logger "INFO" "Cancelled. Run bgipfs install when you're ready"
        exit 0
    fi
    
    install_all
} 