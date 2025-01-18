#!/bin/bash

# Source logger
source "$(dirname "${BASH_SOURCE[0]}")/logger.sh"

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install core dependencies
install_deps() {
    if command_exists curl && command_exists git; then
        logger "INFO" "Core dependencies already installed"
        read -p "Reinstall dependencies? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    
    logger "INFO" "Installing dependencies..."
    sudo apt-get update
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        software-properties-common
    logger "INFO" "Dependencies installed successfully"
}

# Install Docker
install_docker() {
    if command_exists docker; then
        logger "INFO" "Docker already installed"
        read -p "Reinstall Docker? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    
    logger "INFO" "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
}

# Install docker-compose
install_compose() {
    if command_exists docker-compose || { docker compose version > /dev/null 2>&1; }; then
        logger "INFO" "Docker Compose already installed"
        read -p "Reinstall Docker Compose? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    
    logger "INFO" "Installing Docker Compose V2..."
    if [ "$(uname)" = "Darwin" ]; then
        logger "INFO" "On macOS, Docker Compose V2 is included with Docker Desktop"
    else
        DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
        mkdir -p $DOCKER_CONFIG/cli-plugins
        curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) -o $DOCKER_CONFIG/cli-plugins/docker-compose
        chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
    fi
}

# Install IPFS Cluster Control
install_cluster_ctl() {
    if command_exists ipfs-cluster-ctl; then
        logger "INFO" "IPFS Cluster CTL already installed"
        read -p "Reinstall IPFS Cluster CTL? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    
    logger "INFO" "Installing IPFS Cluster Control..."
    
    # Detect OS and architecture
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)
    
    # Convert architecture names to match IPFS naming
    case "$arch" in
        x86_64) arch="amd64" ;;
        aarch64) arch="arm64" ;;
        armv7l) arch="arm" ;;
    esac
    
    local version="v1.1.2"
    local filename="ipfs-cluster-ctl_${version}_${os}-${arch}.tar.gz"
    local download_url="https://dist.ipfs.tech/ipfs-cluster-ctl/${version}/${filename}"
    
    logger "INFO" "Downloading ${filename}..."
    curl -L -o "$filename" "$download_url"
    tar xzf "$filename"
    sudo mv ipfs-cluster-ctl/ipfs-cluster-ctl /usr/local/bin/
    rm -rf ipfs-cluster-ctl*
}

# Check Docker permissions and refresh if needed
check_docker_permissions() {
    if ! docker ps >/dev/null 2>&1; then
        logger "INFO" "Docker permission denied. Refreshing Docker group membership..."
        exec newgrp docker
    fi
}

# Main installation function
install_all() {
    # Check if everything is already installed
    if command_exists curl && \
       command_exists docker && \
       { docker compose version > /dev/null 2>&1; } && \
       command_exists ipfs-cluster-ctl; then
        logger "INFO" "All components appear to be installed"
        read -p "Would you like to reinstall some or all components? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            logger "INFO" "Skipping installation. You can now run: bgipfs init"
            return 0
        fi
    fi
    
    install_deps
    install_docker
    install_compose
    install_cluster_ctl
    
    logger "INFO" "Installation complete!"
    
    # Only refresh Docker permissions on Linux
    if [ "$(uname)" != "Darwin" ]; then
        logger "INFO" "Refreshing Docker permissions..."
        exec newgrp docker
    fi
} 