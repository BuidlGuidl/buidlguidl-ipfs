#!/bin/bash
# Description: Show cluster status and peer information

status_command() {
    if ! docker compose ps --quiet cluster 2>/dev/null | grep -q .; then
        logger "ERROR" "Cluster is not running"
        return 1
    fi
    
    logger "INFO" "Cluster Status:"
    docker compose exec cluster ipfs-cluster-ctl peers ls
    logger "INFO" ""
    logger "INFO" "Pinned Items:"
    docker compose exec cluster ipfs-cluster-ctl pin ls
} 