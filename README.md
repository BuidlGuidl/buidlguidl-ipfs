# BuidlGuidl IPFS

A friendly collection of tools for working with IPFS.

## /packages

### ipfs-cluster-peer
A Docker setup that runs both an IPFS node and IPFS Cluster service, which includes a Pinning Service API. Includes scripts for easy deployment and management.

### ipfs-uploader
A TypeScript client library built on [Helia](https://github.com/ipfs/helia) for uploading & pinning content to IPFS. It allows applications to add and pin content through any compatible pinning service, providing a simple interface for multiple content types. Currently optimized for Node.js environments.

### server
An Express gateway server that exposes HTTP endpoints for uploading content to IPFS. It handles file uploads, buffers, and multipart data, then uses the `ipfs-uploader` library to interact with pinning services.

### nextjs
The website for BuidlGuidl's IPFS pinning service. Information, documentation and a demo section showcasing basic pinning service functionality.

## Status
This project is under active development. Each package includes its own README with specific setup instructions and current limitations.

## Development
This is a monorepo managed with pnpm workspaces. See individual package documentation for specific setup instructions.