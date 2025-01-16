#!/bin/bash

# First, change to the directory where the script is located
cd "$(dirname "$0")"
cd ..

# Source the version helper
source "lib/version.sh"
VERSION=$(get_bgipfs_version ".")

# Update the default version in install.sh
sed -i "s/DEFAULT_VERSION=\".*\"/DEFAULT_VERSION=\"${VERSION}\"/" install.sh 