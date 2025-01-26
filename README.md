# BuidlGuidl IPFS

**Note:** This repository is currently in development and may undergo significant changes.

A friendly collection of tools for working with IPFS.

## /packages

### bgipfs
A CLI tool for managing an IPFS cluster, and uploading content to IPFS.

### ipfs-uploader
A TypeScript client library for uploading & pinning content to IPFS. It allows applications to add and pin content to an IPFS cluster, providing a simple interface for multiple content types.

### ipfs-proxy
A Cloudflare Worker that provides a proxy for IPFS file uploads, specifically handling the `/api/v0/add` endpoint.

### website
The website for BuidlGuidl's IPFS products (this repository). Information, documentation and a demo section showcasing basic pinning service functionality.

## Status
This project is under active development. Each package includes its own README with specific setup instructions and current limitations.

## Development
This is a monorepo managed with pnpm workspaces. See individual package documentation for specific setup instructions.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
