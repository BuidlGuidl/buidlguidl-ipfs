# IPFS Cluster Peer

Docker configuration for running an IPFS node with cluster service that implements the IPFS Pinning Service API specification.

## Components
- IPFS daemon (ipfs/kubo)
- IPFS Cluster service with pinning API endpoint
- Nginx proxy for securing the pinning API endpoint
- Deployment scripts

## Usage

Key functionality is in the `setup.sh` script.

```bash
./setup.sh
```