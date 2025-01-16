#!/bin/bash

# GitHub repository info
REPO="buidlguidl/ipfs-cluster"
GITHUB_API="https://api.github.com/repos/${REPO}"
GITHUB_DOWNLOAD="https://github.com/${REPO}"

# Default version (will be replaced during build)
DEFAULT_VERSION="0.1.0"

# Installation directory
INSTALL_DIR="/usr/local/lib/bgipfs"

# Check for existing installation
if [ -d "$INSTALL_DIR" ] && [ "$(ls -A $INSTALL_DIR)" ]; then
    echo "Existing bgipfs installation found at $INSTALL_DIR"
    read -p "Do you want to replace it? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled"
        exit 1
    fi
    echo "Removing existing installation..."
    sudo rm -rf "$INSTALL_DIR"/*
fi

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
sudo mkdir -p "$INSTALL_DIR"

echo "Downloading bgipfs v${VERSION}..."
curl -L "$DOWNLOAD_URL" | sudo tar xz -C "$INSTALL_DIR" 2>/dev/null

# Move contents up from versioned directory if needed
if [ -d "$INSTALL_DIR/bgipfs-${VERSION}" ]; then
    sudo mv "$INSTALL_DIR/bgipfs-${VERSION}"/* "$INSTALL_DIR"/
    sudo rm -r "$INSTALL_DIR/bgipfs-${VERSION}"
fi

# Create symlink
sudo ln -sf "$INSTALL_DIR/bin/bgipfs" /usr/local/bin/bgipfs

# Remove the macOS artifact
sudo rm -f "$INSTALL_DIR/bin/._bgipfs"

# Fix ownership of the files
sudo chown -R root:root "$INSTALL_DIR"

# Make sure the binary is executable
sudo chmod +x "$INSTALL_DIR/bin/bgipfs"

echo "bgipfs installed successfully!"
echo "Run 'bgipfs install' to set up dependencies" 