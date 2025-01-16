#!/bin/bash
# Description: Create new authentication credentials for IPFS API access

source "$(dirname "${BASH_SOURCE[0]}")/../lib/config.sh"

auth_command() {
    # Generate new credentials if not provided
    local username=${AUTH_USERNAME:-"ipfs"}
    local password=${AUTH_PASSWORD:-$(openssl rand -base64 32)}
    
    # Create the auth file
    printf "${username}:$(openssl passwd -apr1 ${password})\n" > htpasswd
    
    # Update .env file
    ensure_newline
    if grep -q "^AUTH_USERNAME=" .env; then
        # Use temp file for sed operations (portable across GNU and BSD sed)
        sed "s/^AUTH_USERNAME=.*/AUTH_USERNAME=$username/" .env > .env.tmp && mv .env.tmp .env
    else
        echo "AUTH_USERNAME=$username" >> .env
    fi
    
    if grep -q "^AUTH_PASSWORD=" .env; then
        sed "s/^AUTH_PASSWORD=.*/AUTH_PASSWORD=$password/" .env > .env.tmp && mv .env.tmp .env
    else
        echo "AUTH_PASSWORD=$password" >> .env
    fi
    
    logger "INFO" "Created auth credentials:"
    logger "INFO" "Username: ${username}"
    logger "INFO" "Password: ${password}"
    logger "WARN" "Store these credentials securely - you'll need them to use the IPFS API"
    logger "INFO" "These credentials have been saved to your .env file"
    logger "INFO" "If you lose them, run 'bgipfs auth create' to generate new ones"
} 