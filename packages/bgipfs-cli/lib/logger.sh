#!/bin/bash

# Logging levels with colors
logger() {
    local level=$1
    shift
    local color
    case "$level" in
        INFO)  color="\033[0;36m" ;; # Cyan
        WARN)  color="\033[0;33m" ;; # Yellow
        ERROR) color="\033[0;31m" ;; # Red
        *)     color="\033[0m"    ;; # No Color
    esac
    echo -e "${color}[$level] $*\033[0m" >&2
} 