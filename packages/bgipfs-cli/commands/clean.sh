#!/bin/bash
# Description: Stop and remove all containers and volumes

source "$(dirname "${BASH_SOURCE[0]}")/../lib/system.sh"

clean_command() {
    # Check if docker is installed
    if ! command_exists docker; then
        logger "INFO" "Docker is not installed - nothing to clean"
        return 0
    fi

    # Check if docker compose is available
    if ! docker compose version >/dev/null 2>&1; then
        logger "INFO" "Docker Compose is not installed - nothing to clean"
        return 0
    fi

    docker compose down --remove-orphans -v
    
    # Force remove the network if it still exists
    if docker network ls | grep -q ipfs-cluster-peer_default; then
        logger "INFO" "Removing network..."
        docker network rm ipfs-cluster-peer_default || true
    fi
    logger "INFO" "Docker containers stopped and removed"
} 