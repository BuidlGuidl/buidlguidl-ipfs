#!/bin/bash

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if Node.js is installed
if command_exists node; then
    echo "Node.js detected, installing bgipfs..."
    npm install -g bgipfs
    echo "bgipfs installed successfully!"
    exit 0
fi

# If Node.js is not installed, ask for confirmation
read -p "Node.js is required but not found. Would you like to install it? [y/N] " answer
if [[ $answer != "y" && $answer != "Y" ]]; then
    echo "Installation cancelled. Please install Node.js first and try again."
    exit 1
fi

# Install nvm and Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

# Add nvm initialization to .bashrc if not already present
if ! grep -q "NVM_DIR" ~/.bashrc; then
    echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm' >> ~/.bashrc
    echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion' >> ~/.bashrc
fi

# Load nvm directly in current shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Install Node.js version 22
nvm install 22

# Use Node.js 22
nvm use 22

# Verify Node.js installation
node --version
npm --version

npm install -g bgipfs

echo "Installation complete! Run 'source ~/.bashrc' or restart your terminal to use bgipfs"