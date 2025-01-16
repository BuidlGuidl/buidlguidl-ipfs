#!/bin/bash
# Description: Set up HTTPS certificates for domains

source "$(dirname "${BASH_SOURCE[0]}")/../lib/config.sh"

# Function to get certificate for a domain
get_certificate() {
    local domain=$1
    logger "INFO" "Getting certificate for ${domain}"
    
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

    # Run certbot
    if [ ! -z "${EMAIL:-}" ]; then
        docker run --rm \
            -v $PWD/data/certbot/conf:/etc/letsencrypt \
            -v $PWD/data/certbot/www:/var/www/certbot \
            certbot/certbot certonly \
            --webroot \
            --webroot-path /var/www/certbot \
            --email ${EMAIL} \
            --agree-tos \
            --no-eff-email \
            -d ${domain}
    else
        docker run --rm \
            -v $PWD/data/certbot/conf:/etc/letsencrypt \
            -v $PWD/data/certbot/www:/var/www/certbot \
            certbot/certbot certonly \
            --webroot \
            --webroot-path /var/www/certbot \
            --register-unsafely-without-email \
            --agree-tos \
            --no-eff-email \
            -d ${domain}
    fi

    local result=$?
    
    # Clean up the temporary nginx container
    docker rm -f certbot-nginx 2>/dev/null || true
    
    # Remove the trap since we've cleaned up
    trap - EXIT
    
    return $result
}

ssl_command() {
    # Check if port 80 is in use
    if lsof -i:80 >/dev/null 2>&1; then
        logger "ERROR" "Port 80 is already in use. Please stop any running containers first:"
        logger "INFO" "Run: bgipfs stop"
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

    # Check/prompt for gateway domain
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

    # Check/prompt for upload domain
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

    logger "INFO" "Setting up SSL certificates..."

    # Get certificates for configured domains
    if [ ! -z "${GATEWAY_DOMAIN}" ]; then
        logger "INFO" "Setting up Gateway domain: ${GATEWAY_DOMAIN}"
        get_certificate "${GATEWAY_DOMAIN}"
    fi

    if [ ! -z "${UPLOAD_DOMAIN}" ]; then
        logger "INFO" "Setting up Upload domain: ${UPLOAD_DOMAIN}"
        get_certificate "${UPLOAD_DOMAIN}"
    fi

    logger "INFO" "HTTPS setup complete for:"
    [ ! -z "${GATEWAY_DOMAIN}" ] && logger "INFO" "- Gateway: ${GATEWAY_DOMAIN}"
    [ ! -z "${UPLOAD_DOMAIN}" ] && logger "INFO" "- Upload: ${UPLOAD_DOMAIN}"
    logger "INFO" "Please ensure your DNS is configured with A records pointing to your IP for each domain"
} 