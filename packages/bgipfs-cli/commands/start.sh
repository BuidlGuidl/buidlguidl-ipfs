#!/bin/bash
# Description: Start the IPFS cluster services (--ip or --dns mode)

source "$(dirname "${BASH_SOURCE[0]}")/../lib/system.sh"
source "$(dirname "${BASH_SOURCE[0]}")/auth.sh"

check_containers_running() {
    local services=("ipfs" "cluster" "nginx")
    local failed_services=()
    
    for service in "${services[@]}"; do
        if ! docker compose ps --quiet "$service" >/dev/null 2>&1 || \
           ! docker compose ps --format '{{.State}}' "$service" 2>/dev/null | grep -q "running"; then
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -ne 0 ]; then
        logger "ERROR" "The following services failed to start or exited: ${failed_services[*]}"
        echo "=== Container Logs ==="
        for service in "${failed_services[@]}"; do
            echo "--- $service logs ---"
            docker compose logs "$service"
        done
        return 1
    fi
    
    return 0
}

start_command() {
    check_docker_permissions

    local mode="ip"
    
    # Parse arguments
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --ip) mode="ip" ;;
            --dns) mode="dns" ;;
            *) logger "ERROR" "Unknown parameter: $1"; return 1 ;;
        esac
        shift
    done

    logger "INFO" "Starting services..."
    
    # Check if PEERADDRESSES is empty and warn
    if [ -z "$PEERADDRESSES" ]; then
        logger "WARN" "No peer addresses specified (PEERADDRESSES is empty) - starting new cluster"
    fi
    
    # Build compose files array
    local compose_files=("-f" "docker-compose.yml")
    
    if [ "$mode" = "dns" ]; then
        # Check for required DNS mode files
        for file in docker-compose.dns.yml nginx.dns.conf; do
            if [ ! -f "$file" ]; then
                logger "ERROR" "Missing required file for DNS mode: $file"
                return 1
            fi
        done
        if [ ! -d "data/certbot/conf" ]; then
            logger "ERROR" "SSL certificates not found. Please run 'bgipfs ssl' first"
            return 1
        fi
        compose_files+=("-f" "docker-compose.dns.yml")
    fi

    # Handle auth file for nginx
    if [ ! -f htpasswd ]; then
        logger "INFO" "No auth credentials found, generating..."
        auth_command
    else
        logger "INFO" "Using existing auth credentials in htpasswd file"
        logger "INFO" "To generate new credentials, run: bgipfs auth create"
    fi

    # Start services with all required compose files
    docker compose "${compose_files[@]}" up -d
    
    # Log startup configuration
    logger "INFO" "Services started with configuration:"
    logger "INFO" "- Mode: ${mode}"
    
    # Wait for services to start
    logger "INFO" "Waiting for services to initialize..."
    sleep 5
    
    # Show recent logs from each service
    logger "INFO" "Recent container logs:"
    echo "--- Nginx logs ---"
    docker compose "${compose_files[@]}" logs nginx | tail -n 5
    echo "--- IPFS Daemon logs ---"
    docker compose "${compose_files[@]}" logs ipfs | tail -n 5
    echo "--- IPFS Cluster logs ---"
    docker compose "${compose_files[@]}" logs cluster | tail -n 5
    
    # Check if all containers are running properly
    if ! check_containers_running; then
        logger "ERROR" "Container startup failed"
        docker compose "${compose_files[@]}" down > /dev/null 2>&1
        return 1
    fi
    
    logger "INFO" "All containers started successfully"
    logger "INFO" "Services are ready!"
    return 0
} 