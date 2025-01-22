# bgipfs: BuidlGuidl IPFS CLI

**Note:** This library is currently in development and may undergo significant changes.

CLI for working with IPFS, with support for running IPFS clusters, uploading files to IPFS, and pin synchronization across nodes.

## Installation

Dependencies:
- Node.js (22+)
- Docker & Docker Compose (for cluster commands)

```bash
npm install -g bgipfs
```

## Commands

```bash
TOPICS
  cluster  Commands for setting up and managing IPFS cluster operations
  sync     Sync pins from an origin IPFS node to a destination IPFS node
  upload   Commands for uploading files to IPFS

COMMANDS
  help     Display help for bgipfs.
  sync     Sync pins from an origin IPFS node to a destination IPFS node
  upload   Upload a file or directory to IPFS
  version  Show version information
```

## Cluster Commands
```bash
bgipfs cluster
  auth     Manage authentication credentials
  config   Set up or update the necessary configuration
  install  Install all required dependencies
  logs     Show container logs
  reset    Reset IPFS cluster and remove all data
  start    Start IPFS cluster
  stop     Stop IPFS cluster
```

### Configuration

During cluster setup, the `cluster config` command will help you populate:

#### Environment Variables (.env)
- `PEERNAME` - Peer name in the IPFS Cluster
- `SECRET` - Cluster secret
- `PEERADDRESSES` - Bootstrap peer addresses
- `AUTH_USERNAME` - Basic auth username
- `AUTH_PASSWORD` - Basic auth password
- `GATEWAY_DOMAIN` - Gateway domain (dns mode)
- `UPLOAD_DOMAIN` - Upload endpoint domain (dns mode)

#### Configuration Files
- `identity.json` - Cluster peer identity [DO NOT SHARE]
- `service.json` - Cluster service configuration
- `ipfs.config.json` - IPFS node configuration
- `htpasswd` - Basic auth credentials

### Cluster Modes

The cluster can run in two modes:
- `ip` - Basic IP-based mode (default)
- `dns` - Domain-based mode with Cloudflare proxy

### DNS Mode Setup

When using DNS mode, you'll need to configure:

1. DNS Records in Cloudflare:
   - `gateway.domain.com` - Points to your server IP
   - `*.gateway.domain.com` - Wildcard for IPFS subdomains
   - `upload.domain.com` - Points to your server IP

2. Cloudflare Settings:
   - SSL/TLS mode: Flexible or Full
   - Enable proxy (orange cloud) for all records
   - Enable WebSockets if using the upload API

### Required Ports

| Port | Protocol | IP Mode | DNS Mode | Purpose |
|------|----------|---------|----------|----------|
| 4001 | TCP | Yes | Yes | IPFS swarm |
| 9096 | TCP | Yes | Yes | Cluster swarm |
| 8080 | TCP | Yes | No | IPFS gateway |
| 5555 | TCP | Yes | No | Upload endpoint |
| 80 | TCP | No | Yes | HTTP proxy |

## Upload Commands
Powered by [ipfs-uploader](../ipfs-uploader/)
```bash
bgipfs upload config init  # Initialize upload configuration
bgipfs upload config get   # Get upload configuration
bgipfs upload [PATH]      # Upload a file, directory, or URL to IPFS
```

### Examples
```bash
# Upload a file
bgipfs upload path/to/file.txt

# Upload a directory
bgipfs upload path/to/directory

# Upload from URL
bgipfs upload https://example.com/image.jpg

# Upload with custom config
bgipfs upload --config ./custom/path/config.json path/to/file.txt
```

## Sync Commands
This is for manually syncing pin lists between nodes. The specified nodes can be Kubo endpoints, or the IPFS proxy endpoint of an IPFS Cluster node. This is powered by [js-kubo-rpc-client](https://github.com/ipfs/js-kubo-rpc-client)

```bash
bgipfs sync config init  # Initialize sync configuration
bgipfs sync config get   # Get sync configuration
bgipfs sync [ls|add|pin] # Sync pins between IPFS nodes - ls just lists, pin lists and pins, add fetches, adds and pins
```