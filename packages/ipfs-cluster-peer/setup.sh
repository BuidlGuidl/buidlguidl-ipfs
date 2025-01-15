#!/bin/bash

# Exit on error, undefined vars, and pipe failures
set -euo pipefail

# Add logging function
logger() {
    local level=$1
    shift
    echo "[$level] $*" >&2
}

# Install dependencies
install_deps() {
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
    logger "INFO" "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    logger "WARN" "Please log out and back in for docker group changes to take effect"
}

# Install docker-compose
install_compose() {
    logger "INFO" "Installing Docker Compose V2..."
    if [ "$(uname)" = "Darwin" ]; then
        logger "INFO" "On macOS, Docker Compose V2 is included with Docker Desktop"
    else
        if ! { docker compose version > /dev/null 2>&1; }; then
            logger "INFO" "Docker Compose plugin not found, installing..."
            DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
            mkdir -p $DOCKER_CONFIG/cli-plugins
            curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) -o $DOCKER_CONFIG/cli-plugins/docker-compose
            chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
        else
            logger "INFO" "Docker Compose V2 is already installed"
        fi
    fi
}

# Fetch configuration files if not present
fetch_configuration_files() {
    logger "INFO" "Installing configuration files..."
    local base_url="https://bgipfs.com/peer-setup"
    local files=("docker-compose.yml" "init.docker-compose.yml" "init.service.json" "nginx.conf")
    
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            logger "INFO" "Downloading $file..."
            if curl -sf "$base_url/$file" -o "$file"; then
                logger "INFO" "Successfully downloaded $file"
            else
                logger "ERROR" "Failed to download $file"
                return 1
            fi
        else
            logger "INFO" "$file already exists, skipping..."
        fi
    done
}

# Install IPFS Cluster Control
install_cluster_ctl() {
    logger "INFO" "Installing IPFS Cluster Control..."
    wget https://dist.ipfs.tech/ipfs-cluster-ctl/v1.0.6/ipfs-cluster-ctl_v1.0.6_linux-amd64.tar.gz
    tar xvzf ipfs-cluster-ctl_v1.0.6_linux-amd64.tar.gz
    sudo mv ipfs-cluster-ctl/ipfs-cluster-ctl /usr/local/bin/
    rm -rf ipfs-cluster-ctl*
}

# Helper function to ensure newline before adding new entries
ensure_newline() {
    if [ -s .env ] && [ "$(tail -c1 .env)" != "" ]; then
        printf "\n" >> .env
    fi
}

# Create temporary docker-compose override file for identity mounting
create_identity_override() {
    cat > docker-compose.override.yml <<-EOF
services:
  cluster:
    volumes:
      - ./identity.json:/data/ipfs-cluster/identity.json
EOF
}

# Initialize identity
init() {
    # Check if containers are running - use temporary env for first run
    if [ ! -f ".env" ]; then
        # Create temporary env with default values for container check
        TMP_ENV=$(mktemp)
        echo "PEERNAME=temp" > "$TMP_ENV"
        echo "SECRET=temp" >> "$TMP_ENV"
        echo "PEERADDRESSES=" >> "$TMP_ENV"
        
        if { docker compose --env-file "$TMP_ENV" ps --quiet | grep -q .; }; then
            rm "$TMP_ENV"
            logger "ERROR" "Containers are currently running. Please stop them first with 'stop_services'"
            return 1
        fi
        rm "$TMP_ENV"
    else
        if { docker compose ps --quiet | grep -q .; }; then
            logger "ERROR" "Containers are currently running. Please stop them first with 'stop_services'"
            return 1
        fi
    fi

    # Create .env file if it doesn't exist
    touch .env

    # Handle PEERNAME
    if ! grep -q "PEERNAME=" .env; then
        ensure_newline
        read -p "Enter peer name (default: cluster0): " input_peername
        if [ -z "$input_peername" ]; then
            printf "PEERNAME=cluster0\n" >> .env
        else
            printf "PEERNAME=$input_peername\n" >> .env
        fi
    else
        current_peername=$(grep PEERNAME .env | cut -d= -f2)
        logger "INFO" "Using existing peer name: $current_peername"
    fi

    # Determine if this is the first node and handle SECRET and PEERADDRESSES accordingly
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
            # First node - generate new secret, skip peer addresses
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

    # Show existing secret/addresses if they exist
    if grep -q "SECRET=" .env; then
        current_secret=$(grep SECRET .env | cut -d= -f2)
        logger "INFO" "Using secret (ends with ...${current_secret: -8})"
    fi
    if grep -q "PEERADDRESSES=" .env; then
        current_peeraddresses=$(grep PEERADDRESSES .env | cut -d= -f2)
        logger "INFO" "Using peer addresses: $current_peeraddresses"
    fi

    logger "INFO" "Environment initialisation complete, you can make subsequent changes to the .env file"
    
    # Handle existing identity.json
    if [ -f "./identity.json" ]; then
        logger "INFO" "identity.json already exists."
        
        create_identity_override
        
        logger "INFO" "Initialising cluster peer..."
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
        logger "INFO" "Initialising cluster peer..."
        if ! docker compose -f init.docker-compose.yml up -d --quiet-pull > /dev/null 2>&1; then
            logger "ERROR" "Docker Compose failed to start"
            return 1
        fi
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
    
    # Log success information
    logger "INFO" "Peer ID: $peer_id"
    logger "INFO" "Identity file has been created at ./identity.json"
    logger "INFO" "Service configuration has been created at ./data/ipfs-cluster/service.json"
}

# Start services
start_services() {
    logger "INFO" "Starting services..."
    docker compose up -d
    logger "INFO" "Waiting for services to start..."
    sleep 5
    
    logger "INFO" "Recent logs from services:"
    logger "INFO" "=== IPFS Logs ==="
    docker compose logs --tail=5 ipfs
    logger "INFO" "=== IPFS Cluster Logs ==="
    docker compose logs --tail=5 cluster
}

# Clone public Git repository
setup_git_repo() {
    logger "INFO" "Setting up Git repository..."
    
    if ! { command -v git &> /dev/null; }; then
        logger "INFO" "Installing Git..."
        sudo apt-get install -y git
    fi
    
    logger "INFO" "Cloning repository..."
    read -p "Enter public Git repository URL: " repo_url
    git clone $repo_url
    
    if [ $? -eq 0 ]; then
        logger "INFO" "Repository cloned successfully"
    else
        logger "ERROR" "Failed to clone repository"
        return 1
    fi
}

# Main execution
main() {
    install_deps
    install_docker
    fetch_configuration_files
    install_compose
    install_cluster_ctl
    init
    start_services
}

# Additional utility functions
stop_services() {
    logger "INFO" "Stopping Docker containers..."
    docker compose down
    logger "INFO" "Docker containers stopped"
}

clean_services() {
    docker compose down --remove-orphans -v
    logger "INFO" "Docker containers stopped and removed"
}

reset() {
    read -p "Are you sure you want to reset? This will remove all IPFS cluster data [y/N]: " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        logger "WARN" "Performing reset..."
        clean_services
        rm -rf data
        logger "INFO" "Reset complete"
    else
        logger "INFO" "Reset cancelled"
    fi
}

show_logs() {
    docker compose logs -f
}

# Format peer address from domain/IP and peerID
get_peer_address() {
    read -p "Enter domain or IP address of the cluster peer: " domain
    read -p "Enter peer ID: " peerid
    
    if [ ! -z "$domain" ] && [ ! -z "$peerid" ]; then
        formatted_address="/dns4/$domain/tcp/9096/ipfs/$peerid"
        logger "INFO" "Formatted peer address:"
        logger "INFO" "$formatted_address"
        
        if { command -v xclip >/dev/null 2>&1; }; then
            echo "$formatted_address" | xclip -selection clipboard
            logger "INFO" "Address copied to clipboard"
        fi
    else
        logger "ERROR" "Both domain/IP and peer ID are required"
    fi
}

show_help() {
    cat << EOF
Usage: $(basename "$0") [COMMAND]

Commands:
    init            Initialize the IPFS cluster peer
    start_services  Start the IPFS cluster services
    stop_services   Stop the IPFS cluster services
    clean_services  Stop and remove all containers and volumes
    reset          Reset all IPFS cluster data
    show_logs      Show container logs
    get_peer_address Generate peer address from domain and ID
    help           Show this help message

If no command is provided, runs the full installation sequence.
EOF
}

# Command line argument handling
if [ $# -gt 0 ]; then
    case "$1" in
        help|-h|--help)
            show_help
            exit 0
            ;;
        init|start_services|stop_services|clean_services|reset|show_logs|get_peer_address)
            "$1"
            ;;
        *)
            logger "ERROR" "Unknown command '$1'"
            show_help
            exit 1
            ;;
    esac
else
    main
fi 