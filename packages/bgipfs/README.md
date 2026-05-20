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

To preview IPFS config migration changes without writing files:

```bash
bgipfs cluster config --mode ipfs --ipfs-dry-run
```

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
- `data/ipfs/config` - live Kubo configuration used by new and updated clusters
- `ipfs.config.json` - legacy IPFS node configuration only for older compose files that still bind-mount it
- `auth/admin-htpasswd` - Admin credentials for dashboard access
- `auth/user-htpasswd` - User credentials for upload endpoint

For new and updated clusters, Kubo owns its live repository config at `data/ipfs/config`. Use
`bgipfs cluster config --mode ipfs` to apply bgipfs-managed IPFS config changes, or edit
`data/ipfs/config` directly for manual Kubo settings before restarting the cluster.
New clusters do not create `ipfs.config.json`. During legacy upgrades, any old exported
`ipfs.config.json` is archived after the bind mount is removed and the upgraded cluster verifies.

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

The `cluster update` command helps you update Kubo, IPFS Cluster, and Traefik Docker images:

```bash
# Update with automatic backup
bgipfs cluster update

# Update without backup
bgipfs cluster update --no-backup

# Update with backup to specific directory
bgipfs cluster update --backup-dir ./my-backup

# Include data/ipfs and data/ipfs-cluster in the filesystem backup
bgipfs cluster update --backup-data

# Pin specific Docker tags instead of the defaults
bgipfs cluster update --ipfs-version v0.41.0 --cluster-version v1.1.6 --traefik-version v3.6.1
```

The update process:
1. Checks Docker Compose and the local compose file
2. Creates a backup of configuration files (unless --no-backup is specified). Use `--backup-data` or a volume snapshot for IPFS data.
3. Updates managed image tags in `docker-compose.yml` (unless `--skip-compose-update` is specified)
4. Pulls the requested Docker images and reports image changes
5. Restarts or starts services with the new images
6. Verifies IPFS and IPFS Cluster are running and reports their versions

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

### Examples
```bash
# List pins from origin node
bgipfs sync ls

# List pins with a limit
bgipfs sync ls --limit 10

# Pin CIDs from origin to destination
bgipfs sync pin

# Pin with a limit
bgipfs sync pin --limit 5

# Add and pin content from origin to destination
bgipfs sync add

# Add with status tracking and resume capability
bgipfs sync add --statusFile sync-status.csv

# Retry failed pins from previous run
bgipfs sync add --statusFile sync-status.csv --retry

# Customize parallel processing and progress updates
bgipfs sync add --chunkSize 20 --progressUpdate 50

# Set error thresholds for automatic stopping
bgipfs sync add --errorThreshold 25 --errorWindow 50
```

### Options
- `--statusFile`: File to track sync status. If exists, will resume from last state
- `--retry`: Retry failed pins from status file
- `--limit`: Limit the number of pins to process (useful for testing)
- `--chunkSize`: Number of pins to process in parallel (default: 10)
- `--progressUpdate`: Number of pins to process before showing progress (default: 100)
- `--errorThreshold`: Stop if rolling error rate exceeds this percentage (0-100, default: 50)
- `--errorWindow`: Number of pins to consider for rolling error rate (default: 100)
- `--pinSource`: Source of pins: "origin" or path to CSV file (default: "origin")
