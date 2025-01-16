#!/bin/bash

source "$(dirname "${BASH_SOURCE[0]}")/logger.sh"

# Helper function to ensure newline before adding new entries
ensure_newline() {
    if [ -s .env ] && [ "$(tail -c1 .env)" != "" ]; then
        printf "\n" >> .env
    fi
}

# Fetch configuration files from templates
fetch_config_files() {
    local force=false
    
    # Parse arguments
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --force) force=true ;;
            *) logger "ERROR" "Unknown parameter: $1"; return 1 ;;
        esac
        shift
    done

    logger "INFO" "Installing configuration files..."
    local template_dir="$BASE_DIR/templates"
    
    # Check if templates directory exists
    if [ ! -d "$template_dir" ]; then
        logger "ERROR" "Templates directory not found: $template_dir"
        return 1
    fi
    
    # Copy each file from templates directory
    for template_file in "$template_dir"/*; do
        if [ -f "$template_file" ]; then
            local file=$(basename "$template_file")
            if [ ! -f "$file" ] || [ "$force" = true ]; then
                logger "INFO" "Installing $file..."
                cp "$template_file" .
                logger "INFO" "Successfully installed $file"
            else
                logger "INFO" "$file already exists, skipping..."
            fi
        fi
    done
}

# Initialize environment configuration
init_env_config() {
    # Handle PEERNAME
    if ! grep -q "PEERNAME=" .env; then
        ensure_newline
        read -p "Enter peer name (default: cluster0): " input_peername
        if [ -z "$input_peername" ]; then
            printf "PEERNAME=cluster0\n" >> .env
            export PEERNAME="cluster0"
        else
            printf "PEERNAME=$input_peername\n" >> .env
            export PEERNAME="$input_peername"
        fi
    else
        current_peername=$(grep PEERNAME .env | cut -d= -f2)
        logger "INFO" "Using existing peer name: $current_peername"
    fi

    # Determine if this is the first node
    if ! grep -q "SECRET=" .env || ! grep -q "PEERADDRESSES=" .env; then
        read -p "Is this the first node in the cluster? [Y/n]: " is_first_node
        
        if [[ $is_first_node == [nN] || $is_first_node == [nN][oO] ]]; then
            # Not the first node - need existing secret and peer addresses
            if ! grep -q "SECRET=" .env; then
                ensure_newline
                read -p "Enter the cluster's secret: " input_secret
                printf "SECRET=$input_secret\n" >> .env
            fi

            if ! grep -q "PEERADDRESSES=" .env; then
                ensure_newline
                read -p "Enter peer addresses (comma-separated, format: /dns4/{ip-or-domain}/tcp/9096/ipfs/{peerid}): " input_peeraddresses
                if [ ! -z "$input_peeraddresses" ]; then
                    printf "PEERADDRESSES=$input_peeraddresses\n" >> .env
                fi
            fi
        else
            # First node - generate new secret
            if ! grep -q "SECRET=" .env; then
                ensure_newline
                generated_secret=$(openssl rand -hex 32)
                printf "SECRET=$generated_secret\n" >> .env
                logger "INFO" "Generated new secret: $generated_secret"
                logger "INFO" "Save this secret! You'll need it when adding more nodes to the cluster."
            fi
            if ! grep -q "PEERADDRESSES=" .env; then
                ensure_newline
                printf "PEERADDRESSES=\n" >> .env
            fi
            logger "INFO" "Skipping peer addresses for first node"
        fi
    fi

    # Show existing configuration
    if grep -q "SECRET=" .env; then
        current_secret=$(grep SECRET .env | cut -d= -f2)
        logger "INFO" "Using secret (ends with ...${current_secret: -8})"
    fi
    if grep -q "PEERADDRESSES=" .env; then
        current_peeraddresses=$(grep PEERADDRESSES .env | cut -d= -f2)
        logger "INFO" "Using peer addresses: $current_peeraddresses"
    fi
} 