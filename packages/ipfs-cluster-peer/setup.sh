#!/bin/bash

# Install dependencies
install_deps() {
    echo "Installing dependencies..."
    sudo apt-get update
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        software-properties-common
}

# Install Docker
install_docker() {
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "Please log out and back in for docker group changes to take effect"
}

# Install docker-compose
install_compose() {
    echo "Installing Docker Compose V2..."
    if [ "$(uname)" = "Darwin" ]; then
        echo "On macOS, Docker Compose V2 is included with Docker Desktop"
    else
        # Docker Compose V2 is now included with Docker Engine
        if ! docker compose version > /dev/null 2>&1; then
            echo "Docker Compose plugin not found, installing..."
            DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
            mkdir -p $DOCKER_CONFIG/cli-plugins
            curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) -o $DOCKER_CONFIG/cli-plugins/docker-compose
            chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
        else
            echo "Docker Compose V2 is already installed"
        fi
    fi
}

# Fetch configuration files if not present
fetch_configuration_files() {
    echo "Installing configuration files..."
    local base_url="https://bgipfs.com/peer-setup"
    local files=("docker-compose.yml" "init.docker-compose.yml" "init.service.json" "nginx.conf")
    
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            echo "Downloading $file..."
            if curl -sf "$base_url/$file" -o "$file"; then
                echo "Successfully downloaded $file"
            else
                echo "Failed to download $file"
                return 1
            fi
        else
            echo "$file already exists, skipping..."
        fi
    done
}

# Install IPFS Cluster Control
install_cluster_ctl() {
    echo "Installing IPFS Cluster Control..."
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

# Initialize identity
init() {
    # Check if containers are running
    if docker compose ps --quiet | grep -q .; then
        echo "Error: Containers are currently running. Please stop them first with 'stop_services'"
        return 1
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
        echo "Using existing peer name: $current_peername"
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
                echo "Generated new secret: $generated_secret"
                echo "Save this secret! You'll need it when adding more nodes to the cluster."
            fi
            if ! grep -q "PEERADDRESSES=" .env; then
                ensure_newline
                printf "PEERADDRESSES=\n" >> .env
            fi
            echo "Skipping peer addresses for first node"
        fi
    fi

    # Show existing secret/addresses if they exist
    if grep -q "SECRET=" .env; then
        current_secret=$(grep SECRET .env | cut -d= -f2)
        echo "Using secret (ends with ...${current_secret: -8})"
    fi
    if grep -q "PEERADDRESSES=" .env; then
        current_peeraddresses=$(grep PEERADDRESSES .env | cut -d= -f2)
        echo "Using peer addresses: $current_peeraddresses"
    fi

    # Handle BASICAUTHCREDENTIALS
    if ! grep -q "BASICAUTHCREDENTIALS=" .env; then
        ensure_newline
        read -p "Enter basic auth credentials (comma-separated, format: user1:password1,user2:password2): " input_auth
        if [ ! -z "$input_auth" ]; then
            printf "BASICAUTHCREDENTIALS=$input_auth\n" >> .env
        fi
    else
        current_auth=$(grep BASICAUTHCREDENTIALS .env | cut -d= -f2)
        echo "Using existing basic auth credentials"
    fi

    echo "Environment initialisation complete, you can make subsequent changes to the .env file"
    
    if [ -f "./data/ipfs-cluster/identity.json" ]; then
        echo "identity.json already exists. Skipping initialization."
        peer_id=$(grep '"id":' "./data/ipfs-cluster/identity.json" | sed 's/.*"id": "\([^"]*\)".*/\1/')
        echo "Peer ID: $peer_id"
    else
        echo "Creating identity.json and service.json"
        docker compose -f init.docker-compose.yml up -d --quiet-pull > /dev/null 2>&1
        echo "Waiting for identity file to be created..."
        sleep 2
        echo "Identity file has been created at ./data/ipfs-cluster/identity.json"
        peer_id=$(grep '"id":' "./data/ipfs-cluster/identity.json" | sed 's/.*"id": "\([^"]*\)".*/\1/')
        echo "Peer ID: $peer_id"
        echo "Service configuration has been created at ./data/ipfs-cluster/service.json"
    fi
}

# Start services
start_services() {
    echo "Starting services..."
    docker compose up -d
    echo "Waiting for services to start..."
    sleep 5
    
    # Show recent logs from each service
    echo "Recent logs from services:"
    echo "=== IPFS Logs ==="
    docker compose logs --tail=5 ipfs
    echo -e "\n=== IPFS Cluster Logs ==="
    docker compose logs --tail=5 cluster
}

# Clone public Git repository
setup_git_repo() {
    echo "Setting up Git repository..."
    
    # Install Git if not present
    if ! command -v git &> /dev/null; then
        echo "Installing Git..."
        sudo apt-get install -y git
    fi
    
    # Clone the repository
    echo "Cloning repository..."
    read -p "Enter public Git repository URL: " repo_url
    git clone $repo_url
    
    if [ $? -eq 0 ]; then
        echo "Repository cloned successfully"
    else
        echo "Failed to clone repository"
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
    docker compose down
    echo "Docker containers stopped"
}

clean_services() {
    docker compose down --remove-orphans -v
    echo "Docker containers stopped and removed"
}

reset() {
    read -p "Are you sure you want to reset? This will remove all IPFS cluster data [y/N]: " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        clean_services
        rm -rf data
        echo "Reset complete"
    else
        echo "Reset cancelled"
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
        echo "Formatted peer address:"
        echo "$formatted_address"
        
        # Optionally copy to clipboard if xclip is available
        if command -v xclip >/dev/null 2>&1; then
            echo "$formatted_address" | xclip -selection clipboard
            echo "Address copied to clipboard"
        fi
    else
        echo "Error: Both domain/IP and peer ID are required"
    fi
}

# Command line argument handling
if [ $# -gt 0 ]; then
    # Get all function names from the script
    functions=$(declare -F | cut -d' ' -f3)
    
    # Check if the argument matches any function
    if echo "$functions" | grep -q "^$1\$"; then
        $1
    else
        echo "Unknown command: $1"
        echo "Available commands:"
        echo "$functions" | grep -v "^_" | sort
    fi
else
    main
fi 