#!/bin/bash
# Description: Initialize a new IPFS cluster node

source "$(dirname "${BASH_SOURCE[0]}")/../lib/system.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/config.sh"
source "$(dirname "${BASH_SOURCE[0]}")/auth.sh"

# Create temporary docker-compose override file for identity mounting
create_identity_override() {
    cat > docker-compose.override.yml <<-EOF
services:
  cluster:
    volumes:
      - ./identity.json:/data/ipfs-cluster/identity.json
EOF
}

# Cleanup function to ensure containers are stopped
cleanup_containers() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        logger "INFO" "Showing container logs due to error:"
        echo "=== Cluster Container Logs ==="
        docker compose -f init.docker-compose.yml logs cluster
    fi
    
    logger "INFO" "Cleaning up initialization containers..."
    docker compose -f init.docker-compose.yml down > /dev/null 2>&1
}

init_command() {
    # Check Docker permissions
    check_docker_permissions || return 1

    # Only check for running containers if .env exists
    if [ -f ".env" ] && { docker compose ps --quiet 2>/dev/null | grep -q .; }; then
        logger "ERROR" "Containers are currently running. Please stop them first with 'bgipfs stop'"
        return 1
    fi

    # Fetch configuration files
    fetch_config_files

    # Initialize environment configuration
    init_env_config
    
    logger "INFO" "Environment initialization complete"
    
    # Create initial auth credentials if they don't exist
    if [ ! -f "htpasswd" ]; then
        logger "INFO" "Creating initial authentication credentials..."
        auth_command
    fi
    
    # Set trap for cleanup before starting any containers
    trap 'cleanup_containers' ERR EXIT
    
    # Handle existing identity.json
    if [ -f "./identity.json" ]; then
        logger "INFO" "identity.json already exists."
        
        create_identity_override
        
        logger "INFO" "Initializing cluster peer..."
        # Start containers with identity file mounted
        if ! docker compose -f init.docker-compose.yml -f docker-compose.override.yml up -d --quiet-pull > /dev/null 2>&1; then
            logger "ERROR" "Docker Compose failed to start"
            rm docker-compose.override.yml
            return 1
        fi
        
        # Clean up temporary file
        rm docker-compose.override.yml
    else
        # Start containers without identity file
        logger "INFO" "Initializing cluster peer..."
        if ! docker compose -f init.docker-compose.yml up -d --quiet-pull > /dev/null 2>&1; then
            logger "ERROR" "Docker Compose failed to start"
            return 1
        fi
    fi
    
    # Wait for containers to initialize
    sleep 5
    
    # Copy identity file if it doesn't exist
    if [ ! -f "./identity.json" ]; then
        if ! cp ./data/ipfs-cluster/identity.json ./identity.json; then
            logger "ERROR" "Failed to copy identity.json"
            return 1
        fi
    fi
    
    # Check if identity.json exists and is non-empty
    if [ ! -f "./identity.json" ] || [ ! -s "./identity.json" ]; then
        logger "ERROR" "identity.json file not found or is empty"
        return 1
    fi

    # Extract and validate peer ID
    if ! peer_id=$(grep '"id":' "./identity.json" | sed 's/.*"id": "\([^"]*\)".*/\1/'); then
        logger "ERROR" "Failed to extract peer ID"
        return 1
    fi
    
    # Log success information
    logger "INFO" "Peer ID: $peer_id"
    logger "INFO" "Identity file has been created at ./identity.json"

    if ! cp ./data/ipfs-cluster/service.json ./service.json; then
        logger "ERROR" "Failed to copy service.json"
        return 1
    fi
    logger "INFO" "Service configuration has been created at ./service.json"

    # Note: We don't need explicit cleanup here as it's handled by the trap
    return 0
}