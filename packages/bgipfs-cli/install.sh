#!/bin/bash

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Convert architecture names
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    armv7l) ARCH="arm" ;;
esac

# Set version and download URL
VERSION="0.1.0"
# PLACEHOLDER: Update with actual release URL before publishing
DOWNLOAD_URL="[PLACEHOLDER_URL]/bgipfs/v${VERSION}/bgipfs-${OS}-${ARCH}.tar.gz"
# or
# DOWNLOAD_URL="https://github.com/buidlguidl/ipfs-cluster/releases/download/v${VERSION}/bgipfs-${OS}-${ARCH}.tar.gz"

# Create installation directory
INSTALL_DIR="/usr/local/lib/bgipfs"
sudo mkdir -p "$INSTALL_DIR"

echo "Downloading bgipfs v${VERSION}..."
curl -L "$DOWNLOAD_URL" | sudo tar xz -C "$INSTALL_DIR"

# Create symlink
sudo ln -sf "$INSTALL_DIR/bin/bgipfs" /usr/local/bin/bgipfs

echo "bgipfs installed successfully!"
echo "Run 'bgipfs install' to set up dependencies" 