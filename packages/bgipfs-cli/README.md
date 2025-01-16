# bgipfs-cli

BuidlGuidl IPFS Cluster Management Tool - A command-line interface for managing IPFS cluster nodes.

## Installation

### Quick Install (recommended)
```bash
# PLACEHOLDER: Update with actual install script URL
curl -fsSL https://[PLACEHOLDER_URL]/install.sh | sh
```

### Manual Install
```bash
git clone https://github.com/buidlguidl/ipfs-cluster
cd ipfs-cluster/packages/bgipfs-cli
npm install -g .
```

## Usage

### First-time Setup

1. Install dependencies:
```bash
bgipfs install
```

2. Initialize a new node:
```bash
bgipfs init
```

3. Start services:
```bash
bgipfs start        # IP-based mode (default)
# or
bgipfs start --dns  # DNS mode with HTTPS
```

### Available Commands

- `install` - Install all required dependencies
- `init` - Initialize a new IPFS cluster node
- `start` - Start the IPFS cluster services
  - `--ip` IP-based mode (default)
  - `--dns` DNS mode with HTTPS gateway
- `stop` - Stop the IPFS cluster services
- `clean` - Stop and remove all containers and volumes
- `reset` - Reset all IPFS cluster data
- `logs` - Show container logs
- `auth` - Create new authentication credentials
- `ssl` - Set up HTTPS certificates for domains
- `status` - Show cluster status
- `version` - Show version information for all components

### DNS Mode Setup

1. Configure your domains:
```bash
bgipfs ssl
```

2. Start services in DNS mode:
```bash
bgipfs start --dns
```

### Authentication

Generate new API access credentials:
```bash
bgipfs auth create
```

### Version Information

Check versions of all components:
```bash
bgipfs version
```

Example output:
```
INFO: bgipfs version: 0.1.0
INFO: IPFS Cluster CTL version: v1.1.2
INFO: IPFS version: 0.18.1
INFO: IPFS Cluster version: v1.1.2
```

## Development

### Prerequisites

- `bash` 4.0 or later
- `docker` and `docker compose` for running services
- `curl` for downloading components
- `sudo` access for installation

### Project Structure
```
packages/bgipfs-cli/
├── bin/
│   └── bgipfs              # Main executable
├── lib/
│   ├── logger.sh          # Logging utilities
│   ├── system.sh          # System operations
│   └── config.sh          # Configuration management
├── commands/              # Command implementations
│   ├── install.sh
│   ├── init.sh
│   └── ...
└── templates/             # Configuration templates
    ├── docker-compose.yml
    ├── nginx.ip.conf
    └── ...
```

### Adding New Commands

1. Create a new command file in `commands/`:
```bash
# commands/example.sh
#!/bin/bash
# Description: Example command description

example_command() {
    # Command implementation
}
```

2. The command will be automatically loaded and available as `bgipfs example`

## License

MIT 