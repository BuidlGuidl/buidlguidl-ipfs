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
  ipfs     Commands for managing IPFS node configuration and peering
  sync     Sync pins from an origin IPFS node to a destination IPFS node
  upload   Commands for uploading files to IPFS

COMMANDS
  help     Display help for bgipfs.
  sync     Sync pins from an origin IPFS node to a destination IPFS node
  upload   Upload a file or directory to IPFS
  version  Show version information
```

## IPFS Commands
```bash
bgipfs ipfs
  announce  Configure IPFS to announce its public domain for peering
  peer     Connect to another IPFS node
```

## Cluster Commands
```bash
bgipfs cluster
  ipfs-announce  Configure IPFS to announce its public domain for peering
  auth          Manage authentication credentials
  backup        Create a backup of IPFS cluster data and configuration
  config        Set up or update the necessary configuration
  install       Install all required dependencies
  logs          Show container logs
  ipfs-peer     Connect to another IPFS node
  reset         Reset IPFS cluster and remove all data
  start         Start IPFS cluster
  stop          Stop IPFS cluster
  restart       Restart a running IPFS cluster
  update        Update IPFS and IPFS Cluster to their latest versions
```

### Configuration

During cluster setup, the `cluster config` command will help you populate:

#### Environment Variables (.env)
- `PEERNAME` - Peer name in the IPFS Cluster
- `SECRET` - Cluster secret
- `PEERADDRESSES` - Bootstrap peer addresses
- `ADMIN_USERNAME` - Admin username for dashboard access
- `ADMIN_PASSWORD` - Admin password for dashboard access
- `USER_USERNAME` - User username for upload endpoint
- `USER_PASSWORD` - User password for upload endpoint
- `GATEWAY_DOMAIN` - Gateway domain (dns mode)
- `UPLOAD_DOMAIN` - Upload endpoint domain (dns mode)

#### Configuration Files
- `identity.json` - Cluster peer identity [DO NOT SHARE]
- `service.json` - Cluster service configuration
- `ipfs.config.json` - IPFS node configuration
- `auth/admin-htpasswd` - Admin credentials for dashboard access
- `auth/user-htpasswd` - User credentials for upload endpoint

#### Backup
The `cluster backup` command creates a complete backup of your IPFS cluster, including:
- IPFS node data
- IPFS Cluster data
- All configuration files
- Authentication files

Usage:
```bash
# Create backup with automatic timestamped directory
bgipfs cluster backup

# Create backup in a specific directory
bgipfs cluster backup --output ./my-backup
```

### Updating

The `cluster update` command helps you update IPFS and IPFS Cluster to their latest versions:

```bash
# Update with automatic backup
bgipfs cluster update

# Update without backup
bgipfs cluster update --no-backup

# Update with backup to specific directory
bgipfs cluster update --backup-dir ./my-backup
```

The update process:
1. Creates a backup of all data and configuration (unless --no-backup is specified)
2. Stops the running services
3. Pulls the latest Docker images
4. Starts the services with the new versions
5. Verifies all services are running correctly

### IPFS Peering

To enable peering between IPFS nodes in your cluster:

1. **Announce Your Node**
   ```bash
   # Configure with interactive prompt
   bgipfs cluster ipfs-announce

   # Configure with specific domain
   bgipfs cluster ipfs-announce --domain example.com
   ```
   This will:
   - Configure IPFS to listen on all interfaces
   - Announce your public domain for peering
   - Clear any no-announce filters
   - Restart IPFS to apply changes
   - Display your Peer ID

2. **Connect to Another Node**
   ```bash
   # Connect with interactive prompts
   bgipfs cluster ipfs-peer

   # Connect with specific details
   bgipfs cluster ipfs-peer --domain example.com --peer-id QmPeerId
   ```
   This will:
   - Connect to the specified IPFS node
   - Verify the connection was successful
   - Display all connected peers

The domain will be saved in your `.env` file as `IPFS_PEERING_DOMAIN`.

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
