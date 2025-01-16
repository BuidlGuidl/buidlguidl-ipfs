#!/bin/bash

# GitHub repository info
REPO="buidlguidl/ipfs-cluster"
GITHUB_API="https://api.github.com/repos/${REPO}"
GITHUB_DOWNLOAD="https://github.com/${REPO}"

# Default version (will be replaced during build)
DEFAULT_VERSION="0.0.1"

# Get latest version from GitHub API
VERSION=$(curl -s "${GITHUB_API}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')

# If version fetch fails, fallback to default
if [ -z "$VERSION" ]; then
    echo "Warning: Could not fetch latest version, falling back to default"
    VERSION="${DEFAULT_VERSION}"
fi

# Set download URL
DOWNLOAD_URL="${GITHUB_DOWNLOAD}/releases/download/v${VERSION}/bgipfs-${VERSION}.tar.gz"

# Create installation directory
INSTALL_DIR="/usr/local/lib/bgipfs"
sudo mkdir -p "$INSTALL_DIR"

echo "Downloading bgipfs v${VERSION}..."
curl -L "$DOWNLOAD_URL" | sudo tar xz -C "$INSTALL_DIR"

# Create symlink
sudo ln -sf "$INSTALL_DIR/bin/bgipfs" /usr/local/bin/bgipfs

echo "bgipfs installed successfully!"
echo "Run 'bgipfs install' to set up dependencies" 