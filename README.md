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

This is a monorepo managed with pnpm workspaces.

### Local full stack (Postgres, IPFS cluster, website, ipfs-proxy)

1. From the repo root, install dependencies: `pnpm install`
2. Copy env files: `packages/website/.env.example` → `packages/website/.env`, and `packages/ipfs-proxy/.dev.vars.example` → `packages/ipfs-proxy/.dev.vars`. Fill Privy values in `.env`.
3. Start Postgres: `pnpm dev:db` (uses [docker-compose.dev.yml](docker-compose.dev.yml))
4. Apply the schema: `pnpm --filter app prisma db push` (and optionally `pnpm --filter app db:seed`)
5. One-time in `packages/bgipfs`: `pnpm exec bgipfs cluster config`, then when ready: `pnpm dev:cluster` (or run `bgipfs cluster start` from that directory)
6. Run website and worker together: `pnpm dev:apps`

### Prod-debug (local Next, prod data)

Copy `packages/website/.env.prod-debug.example` to `packages/website/.env.prod-debug.local`, add real production values (never commit this file). Run `pnpm dev:website:prod-debug`. Prefer a read-only or staging database when possible; uploads can affect production pins. You usually do **not** run the local `ipfs-proxy` in this mode.

See [packages/website/README.md](packages/website/README.md) for API and feature documentation.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
