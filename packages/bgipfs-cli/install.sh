#!/bin/sh

# GitHub repository info
REPO="azf20/buidlguidl-ipfs"
GITHUB_API="https://api.github.com/repos/${REPO}"
GITHUB_DOWNLOAD="https://github.com/${REPO}"

# Default version (will be replaced during build)
DEFAULT_VERSION="0.1.0"

# Installation directory
INSTALL_DIR="/usr/local/lib/bgipfs"

# Check if running in non-interactive mode (like through curl pipe)
if [ -t 0 ]; then
    INTERACTIVE=true
else
    INTERACTIVE=false
fi

# Check for existing installation
if [ -d "$INSTALL_DIR" ] && [ "$(ls -A $INSTALL_DIR 2>/dev/null)" ]; then
    echo "Existing bgipfs installation found at $INSTALL_DIR"
    if [ "$INTERACTIVE" = true ]; then
        printf "Do you want to replace it? [y/N] "
        read REPLY
        echo
        if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
            echo "Installation cancelled"
            exit 1
        fi
    else
        # In non-interactive mode, proceed with installation
        echo "Running in non-interactive mode - proceeding with installation"
    fi
    echo "Removing existing installation..."
    sudo rm -rf "$INSTALL_DIR"
fi

# Create installation directory
sudo mkdir -p "$INSTALL_DIR"

# Get latest version from GitHub API
VERSION=$(curl -s "${GITHUB_API}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/' || echo "")

# If version fetch fails, fallback to default
if [ -z "$VERSION" ]; then
    echo "Warning: Could not fetch latest version, falling back to default"
    VERSION="${DEFAULT_VERSION}"
fi

# Set download URL
DOWNLOAD_URL="${GITHUB_DOWNLOAD}/releases/download/v${VERSION}/bgipfs-${VERSION}.tar.gz"

echo "Downloading bgipfs v${VERSION}..."
if ! curl -L "$DOWNLOAD_URL" | sudo tar xz -C "$INSTALL_DIR" 2>/dev/null; then
    echo "Error: Failed to download or extract bgipfs"
    exit 1
fi

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

# Verify binary exists before changing permissions
if [ -f "$INSTALL_DIR/bin/bgipfs" ]; then
    sudo chmod +x "$INSTALL_DIR/bin/bgipfs"
    echo "bgipfs installed successfully!"
    echo "Run 'bgipfs install' to set up dependencies"
else
    echo "Error: Installation failed - binary not found"
    exit 1
fi 

bgipfs help