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
    
    # Handle existing identity.json
    if [ -f "./identity.json" ]; then
        logger "INFO" "identity.json already exists."
        
        create_identity_override
        
        logger "INFO" "Initializing cluster peer..."
        # Start containers with identity file mounted
        if ! output=$(docker compose -f init.docker-compose.yml -f docker-compose.override.yml up -d --quiet-pull 2>&1); then
            logger "ERROR" "Docker Compose failed to start"
            logger "ERROR" "Command output:"
            echo "$output"
            rm docker-compose.override.yml
            return 1
        fi
        
        logger "INFO" "Docker compose output:"
        echo "$output"
        
        # Show container logs
        logger "INFO" "Container logs:"
        docker compose -f init.docker-compose.yml logs
        
        # Clean up temporary file and containers
        rm docker-compose.override.yml
        if ! output=$(docker compose -f init.docker-compose.yml down 2>&1); then
            logger "WARN" "Failed to clean up containers:"
            echo "$output"
        fi
    else
        # Start containers without identity file
        logger "INFO" "Initializing cluster peer..."
        if ! output=$(docker compose -f init.docker-compose.yml up -d --quiet-pull 2>&1); then
            logger "ERROR" "Docker Compose failed to start"
            logger "ERROR" "Command output:"
            echo "$output"
            return 1
        fi
        
        logger "INFO" "Docker compose output:"
        echo "$output"
        
        # Show container logs
        logger "INFO" "Container logs:"
        docker compose -f init.docker-compose.yml logs
    fi
    
    # Wait for containers to initialize
    sleep 2
    
    # Copy identity file if it doesn't exist
    if [ ! -f "./identity.json" ]; then
        cp ./data/ipfs-cluster/identity.json ./identity.json
    fi
    
    # Extract and validate peer ID
    if ! peer_id=$(grep '"id":' "./identity.json" | sed 's/.*"id": "\([^"]*\)".*/\1/'); then
        logger "ERROR" "Failed to extract peer ID"
        return 1
    fi
    
    # Clean up initialization containers
    logger "INFO" "Cleaning up initialization containers..."
    if ! output=$(docker compose -f init.docker-compose.yml down 2>&1); then
        logger "WARN" "Failed to clean up containers:"
        echo "$output"
    fi
    
    # Log success information
    logger "INFO" "Peer ID: $peer_id"
    logger "INFO" "Identity file has been created at ./identity.json"
    logger "INFO" "Service configuration has been created at ./data/ipfs-cluster/service.json"
} 