#!/bin/bash

# Exit on error, undefined vars, and pipe failures
set -euo pipefail

# Load environment variables from .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Add logging function
logger() {
    local level=$1
    shift
    echo "[$level] $*" >&2
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install dependencies
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

# Fetch configuration files if not present
fetch_configuration_files() {
    logger "INFO" "Installing configuration files..."
    local base_url="https://buidlguidl-ipfs.vercel.app/peer-setup"
    
    # Install jq if not present
    if ! command_exists jq; then
        logger "INFO" "Installing jq..."
        sudo apt-get update && sudo apt-get install -y jq
    fi
    
    # Read required files from package.json
    local package_json="package.json"
    if [ -f "$package_json" ]; then
        local files=$(jq -r '.files[]' "$package_json")
    else
        # Fallback to hardcoded list if package.json not found
        local files=(
            "docker-compose.yml"
            "init.docker-compose.yml"
            "init.service.json"
            "docker-compose.secure-upload.yml"
            "nginx.conf"
        )
        printf "%s\n" "${files[@]}"
    fi
    
    # Process each file
    echo "$files" | while read -r file; do
        [ -z "$file" ] && continue
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
    if command_exists ipfs-cluster-ctl; then
        logger "INFO" "IPFS Cluster Control already installed"
        read -p "Reinstall IPFS Cluster Control? [y/N] " response
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

# Check Docker permissions and refresh if needed
check_docker_permissions() {
    if ! docker ps >/dev/null 2>&1; then
        logger "INFO" "Docker permission denied. Refreshing Docker group membership..."
        exec newgrp docker
        # Note: The script will restart in a new shell after this point
    fi
}

# Initialize identity
init() {
    check_docker_permissions

    # Only check for running containers if .env exists
    if [ -f ".env" ] && { docker compose ps --quiet 2>/dev/null | grep -q .; }; then
        logger "ERROR" "Containers are currently running. Please stop them first with 'stop'"
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
            export PEERNAME="cluster0"
        else
            printf "PEERNAME=$input_peername\n" >> .env
            export PEERNAME="$input_peername"
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
start() {
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
            logger "ERROR" "SSL certificates not found. Please run 'setup_dns' first"
            return 1
        fi
        compose_files+=("-f" "docker-compose.dns.yml")
    fi

    # Handle auth file for nginx
    if [ ! -f htpasswd ]; then
        logger "INFO" "No auth credentials found, generating..."
        create_auth
    else
        logger "INFO" "Using existing auth credentials in htpasswd file"
        logger "INFO" "To generate new credentials, run: $0 create_auth"
    fi

    # Start services with all required compose files
    docker compose "${compose_files[@]}" up -d
    
    # Log startup configuration
    logger "INFO" "Services started with configuration:"
    logger "INFO" "- Mode: ${mode}"
    
    # Wait for services to start
    logger "INFO" "Waiting for services to initialize..."
    sleep 5
    
    # Show logs to verify services are running
    logger "INFO" "IPFS Daemon logs:"
    docker compose "${compose_files[@]}" logs ipfs | tail -n 5
    
    logger "INFO" "IPFS Cluster logs:"
    docker compose "${compose_files[@]}" logs cluster | tail -n 5
    
    logger "INFO" "Nginx logs:"
    docker compose "${compose_files[@]}" logs nginx
    
    logger "INFO" "Services are ready!"
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

# Install everything and refresh groups
install() {
    # Check if everything is already installed
    if command_exists curl && \
       command_exists docker && \
       { docker compose version > /dev/null 2>&1; } && \
       command_exists ipfs-cluster-ctl; then
        logger "INFO" "All components appear to be installed"
        read -p "Would you like to reinstall everything? [y/N] " response
        if [[ ! $response =~ ^[Yy]$ ]]; then
            logger "INFO" "Skipping installation. You can now run: $0 init_and_start"
            return 0
        fi
    fi
    
    install_deps
    install_docker
    install_compose
    install_cluster_ctl
    fetch_configuration_files
    
    logger "INFO" "Installation complete!"
    logger "INFO" "Refreshing Docker permissions..."
    
    # Simply execute newgrp docker
    exec newgrp docker
}

# Initialize and start services
init_and_start() {
    if ! groups | grep -q docker; then
        logger "ERROR" "Docker group permissions not available. Please run install first"
        exit 1
    fi
    
    init
    start "$@"
}

# Update main to be simpler
main() {
    logger "INFO" "This will install all dependencies."
    logger "INFO" "After installation completes, run: $0 init_and_start"
    logger "INFO" ""
    read -p "Continue with installation? [y/N] " response
    
    if [[ ! $response =~ ^[Yy]$ ]]; then
        logger "INFO" "Cancelled. Run $0 install when you're ready"
        exit 0
    fi
    
    install
}

# Additional utility functions
stop() {
    logger "INFO" "Stopping Docker containers..."
    docker compose stop
    logger "INFO" "Docker containers stopped"
}

clean() {
    docker compose down --remove-orphans -v
    
    # Force remove the network if it still exists
    if docker network ls | grep -q ipfs-cluster-peer_default; then
        logger "INFO" "Removing network..."
        docker network rm ipfs-cluster-peer_default || true
    fi
    logger "INFO" "Docker containers stopped and removed"
}

reset() {
    read -p "Are you sure you want to reset? This will remove all IPFS cluster data [y/N]: " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        logger "WARN" "Performing reset..."
        clean
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
    install        Install dependencies and configure Docker permissions
    init_and_start Initialize and start all services
    init          Initialize the IPFS cluster peer
    start         Start the IPFS cluster services
                 Options:
                   --ip            IP-based mode (default)
                   --dns          DNS mode with HTTPS gateway
    stop          Stop the IPFS cluster services
    clean         Stop and remove all containers and volumes
    reset         Reset all IPFS cluster data
    show_logs     Show container logs
    create_auth   Create new authentication credentials
    setup_dns     Set up HTTPS certificates for domains
                 Will prompt for domains if not configured in environment
                 Domains must be pointed to your server's public IP first
    get_peer_address Generate peer address from domain and ID
    setup_git_repo Clone a public Git repository
    install_deps   Install system dependencies
    install_docker Install Docker
    install_compose Install Docker Compose
    install_cluster_ctl Install IPFS Cluster Control
    fetch_configuration_files Download required configuration files
    help           Show this help message

For first-time setup, run these commands in order:
    1. $0 install
    2. $0 init_and_start
    3. Optional: $0 create_auth to generate new credentials
    4. Optional: $0 setup_dns for HTTPS (will prompt for domain configuration)

Environment variables for DNS setup (optional):
    GATEWAY_DOMAIN  Domain for IPFS gateway (e.g. gateway.example.com)
    UPLOAD_DOMAIN   Domain for secure upload endpoint (e.g. upload.example.com)
    Set to empty string ("") to explicitly skip a domain
    If not set, setup_dns will prompt for input
    Note: Domains must be configured with A records pointing to your server's public IP
EOF
}

# Function to create new auth credentials
create_auth() {
    echo "Creating new auth credentials..."
    # Generate new credentials if not provided
    local username=${AUTH_USERNAME:-"ipfs"}
    local password=${AUTH_PASSWORD:-$(openssl rand -base64 32)}
    
    # Create the auth file
    printf "${username}:$(openssl passwd -apr1 ${password})\n" > htpasswd
    
    # Update .env file
    ensure_newline
    if grep -q "^AUTH_USERNAME=" .env; then
        sed -i "s/^AUTH_USERNAME=.*/AUTH_USERNAME=$username/" .env
    else
        echo "AUTH_USERNAME=$username" >> .env
    fi
    
    if grep -q "^AUTH_PASSWORD=" .env; then
        sed -i "s/^AUTH_PASSWORD=.*/AUTH_PASSWORD=$password/" .env
    else
        echo "AUTH_PASSWORD=$password" >> .env
    fi
    
    echo "Created auth credentials:"
    echo "Username: ${username}"
    echo "Password: ${password}"
    echo ""
    echo "WARNING: Store these credentials securely - you'll need them to use the IPFS API"
    echo "These credentials have been saved to your .env file"
    echo "If you lose them, run '$0 create_auth' to generate new ones"
}

# Additional utility functions
setup_dns() {
    # Check if port 80 is in use
    if lsof -i:80 >/dev/null 2>&1; then
        logger "ERROR" "Port 80 is already in use. Please stop any running containers first:"
        logger "INFO" "Run: $0 stop"
        return 1
    fi

    # Check/prompt for email if unset
    if [ -z "${EMAIL+x}" ]; then
        read -p "Enter email address for SSL notifications (press enter to skip): " email
        if [ ! -z "$email" ]; then
            ensure_newline
            echo "EMAIL=${email}" >> .env
            export EMAIL="${email}"
        fi
    fi

    # Check/prompt for gateway domain only if unset
    if [ -z "${GATEWAY_DOMAIN+x}" ]; then
        echo "Note: Domain must already be configured with an A record pointing to your server's public IP"
        read -p "Enter gateway domain (e.g. gateway.example.com) or press enter to skip: " gateway_domain
        if [ ! -z "$gateway_domain" ]; then
            ensure_newline
            echo "GATEWAY_DOMAIN=${gateway_domain}" >> .env
            export GATEWAY_DOMAIN="${gateway_domain}"
        else
            export GATEWAY_DOMAIN=""
        fi
    fi

    # Check/prompt for upload domain only if unset
    if [ -z "${UPLOAD_DOMAIN+x}" ]; then
        echo "Note: Domain must already be configured with an A record pointing to your server's public IP"
        read -p "Enter upload domain (e.g. upload.example.com) or press enter to skip: " upload_domain
        if [ ! -z "$upload_domain" ]; then
            ensure_newline
            echo "UPLOAD_DOMAIN=${upload_domain}" >> .env
            export UPLOAD_DOMAIN="${upload_domain}"
        else
            export UPLOAD_DOMAIN=""
        fi
    fi

    # Validate that at least one domain was specified
    if [ -z "${GATEWAY_DOMAIN}" ] && [ -z "${UPLOAD_DOMAIN}" ]; then
        logger "ERROR" "No domains specified. At least one domain is required."
        return 1
    fi

    echo "Setting up DNS environment"

    # Function to get certificate for a domain
    get_certificate() {
        local domain=$1
        echo "Getting certificate for ${domain}"
        
        # Make sure any existing certbot-nginx container is removed
        docker rm -f certbot-nginx 2>/dev/null || true
        
        # Start temporary nginx for this domain
        if ! docker run -d --rm \
            --name certbot-nginx \
            -p 80:80 \
            -v $PWD/certbot.conf:/etc/nginx/conf.d/default.conf:ro \
            -v $PWD/data/certbot/www:/var/www/certbot \
            -e DOMAIN="${domain}" \
            nginx:alpine; then
            logger "ERROR" "Failed to start temporary nginx container"
            return 1
        fi

        # Ensure cleanup on exit
        trap "docker rm -f certbot-nginx 2>/dev/null || true" EXIT

        # Wait for nginx to start and show logs to help debug
        sleep 2
        docker logs certbot-nginx

        # Build certbot command based on whether email is provided
        if [ ! -z "${EMAIL:-}" ]; then
            docker compose run --rm certbot certonly --webroot --webroot-path /var/www/certbot/ \
                --email ${EMAIL} --agree-tos --no-eff-email -d ${domain}
        else
            docker compose run --rm certbot certonly --webroot --webroot-path /var/www/certbot/ \
                --register-unsafely-without-email --agree-tos --no-eff-email -d ${domain}
        fi

        local result=$?
        
        # Clean up the temporary nginx container
        docker rm -f certbot-nginx 2>/dev/null || true
        
        # Remove the trap since we've cleaned up
        trap - EXIT
        
        return $result
    }

    # Get certificates for configured domains
    if [ ! -z "${GATEWAY_DOMAIN}" ]; then
        echo "Setting up Gateway domain: ${GATEWAY_DOMAIN}"
        get_certificate "${GATEWAY_DOMAIN}"
    fi

    if [ ! -z "${UPLOAD_DOMAIN}" ]; then
        echo "Setting up Upload domain: ${UPLOAD_DOMAIN}"
        get_certificate "${UPLOAD_DOMAIN}"
    fi

    echo "HTTPS setup complete for:"
    [ ! -z "${GATEWAY_DOMAIN}" ] && echo "- Gateway: ${GATEWAY_DOMAIN}"
    [ ! -z "${UPLOAD_DOMAIN}" ] && echo "- Upload: ${UPLOAD_DOMAIN}"
    echo "Please ensure your DNS is configured with A records pointing to your IP for each domain"
}

# Command line argument handling
if [ $# -gt 0 ]; then
    case "$1" in
        help|-h|--help)
            show_help
            exit 0
            ;;
        init|start|stop|clean|reset|show_logs|get_peer_address|\
        setup_git_repo|install_deps|install_docker|install_compose|install_cluster_ctl|\
        fetch_configuration_files|install|init_and_start|create_auth|setup_dns)
            cmd="$1"
            shift
            $cmd "$@"
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