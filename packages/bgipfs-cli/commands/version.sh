#!/bin/bash
# Description: Show version information for bgipfs and its components

source "$(dirname "${BASH_SOURCE[0]}")/../lib/system.sh"

version_command() {
    # Show bgipfs version
    logger "INFO" "bgipfs version: ${VERSION}"
    
    # Get IPFS Cluster CTL version (from system installation)
    if command -v ipfs-cluster-ctl >/dev/null 2>&1; then
        # Updated pattern to handle different version string formats
        cluster_ctl_version=$(ipfs-cluster-ctl --version 2>/dev/null | grep -o "[0-9]\+\.[0-9]\+\.[0-9]\+")
        [ ! -z "$cluster_ctl_version" ] && logger "INFO" "IPFS Cluster CTL version: v${cluster_ctl_version}"
    else
        logger "INFO" "IPFS Cluster CTL not installed. Run 'bgipfs install' first"
    fi
    
    # Check if docker is installed and accessible
    if ! command -v docker >/dev/null 2>&1; then
        logger "INFO" "Docker not installed. Run 'bgipfs install' first"
        return
    fi

    if ! check_docker_permissions; then
        return 1
    fi
    
    # Show docker component versions if services are running
    if docker compose ps --quiet 2>/dev/null | grep -q .; then
        # Get IPFS version
        ipfs_version=$(docker compose exec -T ipfs ipfs version --quiet 2>/dev/null)
        [ ! -z "$ipfs_version" ] && logger "INFO" "IPFS version: ${ipfs_version}"
        
        # Get IPFS Cluster version
        cluster_version=$(docker compose exec -T cluster ipfs-cluster-service version 2>/dev/null | grep -o "[0-9]\+\.[0-9]\+\.[0-9]\+")
        [ ! -z "$cluster_version" ] && logger "INFO" "IPFS Cluster version: v${cluster_version}"
    else
        logger "INFO" "Run 'bgipfs start' to see component versions"
    fi
} 