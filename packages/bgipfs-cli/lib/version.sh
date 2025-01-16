#!/bin/bash

get_bgipfs_version() {
    local base_dir="$1"
    local version
    version=$(grep '"version"' "$base_dir/package.json" | cut -d'"' -f4)
    echo "${version:-0.1.0}"  # Return fallback if empty
} 