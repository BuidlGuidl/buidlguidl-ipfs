#!/bin/bash
# Description: Stop and remove all containers and volumes

clean_command() {
    docker compose down --remove-orphans -v
    
    # Force remove the network if it still exists
    if docker network ls | grep -q ipfs-cluster-peer_default; then
        logger "INFO" "Removing network..."
        docker network rm ipfs-cluster-peer_default || true
    fi
    logger "INFO" "Docker containers stopped and removed"
} 