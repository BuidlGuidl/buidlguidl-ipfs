#!/bin/bash

# First, change to the directory where the script is located
cd "$(dirname "$0")"
# Then move up one directory to the project root
cd ..

# Source the version helper
source "lib/version.sh"
VERSION=$(get_bgipfs_version ".")

# Create dist directory
rm -rf dist
mkdir -p dist
mkdir -p "dist/bgipfs-${VERSION}"

# Copy files
cp -r bin lib commands templates package.json README.md "dist/bgipfs-${VERSION}/"

# Create tarball
cd dist
tar -czf "bgipfs-${VERSION}.tar.gz" "bgipfs-${VERSION}"
cd ..

# Clean up
rm -rf "dist/bgipfs-${VERSION}" 