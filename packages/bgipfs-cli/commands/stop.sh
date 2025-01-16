#!/bin/bash
# Description: Stop the IPFS cluster services

stop_command() {
    logger "INFO" "Stopping Docker containers..."
    docker compose stop
    logger "INFO" "Docker containers stopped"
} 