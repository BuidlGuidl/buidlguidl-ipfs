#!/bin/bash

# First, change to the directory where the script is located
cd "$(dirname "$0")"
# Then move up one directory to the project root
cd ..

VERSION=$(node -p "require('./package.json').version")
PLATFORMS=("linux-amd64" "linux-arm64" "darwin-amd64" "darwin-arm64")

# Create dist directory
rm -rf dist
mkdir -p dist

for platform in "${PLATFORMS[@]}"; do
    # Create platform directory
    mkdir -p "dist/bgipfs-$platform"
    
    # Copy files
    cp -r bin lib commands templates package.json README.md "dist/bgipfs-$platform/"
    
    # Create tarball
    cd dist
    tar -czf "bgipfs-$platform.tar.gz" "bgipfs-$platform"
    cd ..
    
    # Clean up
    rm -rf "dist/bgipfs-$platform"
done 