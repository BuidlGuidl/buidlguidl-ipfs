# bgipfs: BuidlGuidl IPFS CLI

**Note:** This library is currently in development and may undergo significant changes.

This is a CLI for running an IPFS cluster

## Installation

Dependencies:

- Node.js (22+)
- Docker & Docker Compose

```bash
npm install -g bgipfs
```

## Usage
```bash
$ bgipfs install # checks / installs required dependencies
$ bgipfs init # sets up the configuration required for IPFS Cluster
$ bgipfs start # starts IPFS cluster
$ bgipfs stop # stops IPFS cluster
$ bgipfs reset # removes all IPFS & IPFS Cluster data [DANGEROUS]
```

## Commands

```bash
COMMANDS
  auth     Manage authentication credentials
  help     Display help for bgipfs.
  init     Initialize IPFS configuration
  install  Install all required dependencies
  logs     Show container logs
  plugins  List installed plugins.
  reset    Reset IPFS cluster and remove all data
  ssl      Generate SSL certificates using Let's Encrypt
  start    Start IPFS cluster
  stop     Stop IPFS cluster
  version  Show version information
  ```

  ### Files of note

  During the `init` command, an interactive prompt will help you populate the `.env` file and `identity.json` file, and other template files will be downloaded to the root directory.

  .env
  - `PEERNAME` - the name of the peer in the IPFS Cluster
  - `SECRET` - the secret for the IPFS Cluster
  - `PEERADDRESSES` - the addresses of the peers in the IPFS Cluster (for bootstrapping, blank if you're the first)
  - `AUTH_USERNAME` - the username for the IPFS Cluster
  - `AUTH_PASSWORD` - the password for the IPFS Cluster
  - `GATEWAY_DOMAIN` - if using DNS, the domain for the gateway (e.g. `ipfs.bgipfs.com`)
  - `UPLOAD_DOMAIN` - if using DNS, the domain for the upload endpoint (e.g. `upload.bgipfs.com`)

  `identity.json`
  - `id` - the public peer ID
  - `private_key` - the private key for the peer [DO NOT SHARE PUBLICLY]

  #### Docker Compose Files
- `init.docker-compose.yml` - Used during initialization to set up IPFS Cluster configuration
- `docker-compose.yml` - Base configuration for IP-based mode, includes IPFS, IPFS Cluster, and Nginx services
- `docker-compose.dns.yml` - DNS mode overrides, adds SSL/TLS support and domain-based routing

#### Nginx Configurations
- `nginx.ip.conf` - Simple Nginx configuration for IP-based mode
  - Provides basic authentication for the upload endpoint (port 5555)
  - No SSL/TLS support
- `nginx.dns.conf` - Advanced Nginx configuration for DNS-based mode
  - Handles SSL/TLS termination
  - Provides HTTPS gateway and upload endpoints
  - Includes automatic HTTP to HTTPS redirection

#### IPFS Cluster Configuration
- `service.json` - Default IPFS Cluster configuration
  - Defines cluster behavior, API endpoints, and performance settings
  - Configures CRDT consensus settings
  - Sets up monitoring and metrics collection

Changes to these files in the root directory will be reflected in the running cluster (after a restart). A note on priority: environment variables passed into the docker compose file will override the values `service.json`.

### Modes

The cluster can be run in two modes:

- `ip` - IP-based mode
- `dns` - DNS-based mode, if you want to use a domain or subdomain instead of an IP address for your gateway (for node discovery, as well as the gateway / upload endpoint)

Note that if you are using DNS mode, you will need to have a valid SSL certificate for your domain. This can be generated using the `ssl` command. You will also need to ensure that your DNS provider isn't providing a proxy service for your domain / subdomains.

### Ports

The following ports need to be opened depending on your setup:

| Port | Protocol | IP-based Setup | DNS-based Setup | Purpose |
|------|----------|----------------|-----------------|----------|
| 4001 | TCP | Required | Required | IPFS swarm |
| 9096 | TCP | Required | Required | Cluster swarm |
| 8080 | TCP | Required | Not needed | IPFS gateway |
| 5555 | TCP | Required | Not needed | Public Add endpoint |
| 80 | TCP | Not needed | Required | HTTP |
| 443 | TCP | Not needed | Required | HTTPS |
