# IPFS Cluster Peer

Docker configuration for running an IPFS node with cluster service that implements the IPFS Pinning Service API specification.

## Components
- IPFS daemon (ipfs/kubo)
- IPFS Cluster service
- Nginx reverse proxy
- Deployment scripts

## Usage

Key functionality is in the `setup.sh` script.

### Basic Setup
```bash
# Install dependencies and initialize
./setup.sh install
./setup.sh init_and_start
```

### Operating Modes

The peer can run in two modes:

#### IP Mode (default)
- Uses direct IP access
- IPFS gateway available on port 8080
- Secure upload endpoint on port 5555
```bash
./setup.sh start --ip
```

#### DNS Mode 
- Uses domain names with SSL certificates
- IPFS gateway available on gateway.{domain}
- Secure upload endpoint on upload.{domain}
```bash
# Set up SSL certificates first
./setup.sh setup_dns
# Then start in DNS mode
./setup.sh start --dns
```