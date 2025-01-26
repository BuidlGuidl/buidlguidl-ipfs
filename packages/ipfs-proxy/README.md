# @ipfs-proxy

A Cloudflare Worker that provides a proxy for IPFS file uploads, specifically handling the `/api/v0/add` endpoint, while maintaining authentication and streaming capabilities.

## Features

- Proxies IPFS file upload requests to a specified IPFS node
- Handles large file uploads (up to Cloudflare's limits)
- Maintains authentication
- Streams responses
- CORS support for browser clients
- Compatible with kubo-rpc-client

## Development

```bash
# Install dependencies
pnpm install

# Start local development server
pnpm dev

# Deploy to Cloudflare
pnpm deploy
```

## Configuration

### Environment Variables

Development variables can be set in `.dev.vars`:
```
IPFS_API_URL=http://localhost:5555
IPFS_AUTH_USERNAME=user
IPFS_AUTH_PASSWORD=your_password
```

Production variables:
- `IPFS_API_URL` is set in wrangler.json
- `IPFS_AUTH_USERNAME` and `IPFS_AUTH_PASSWORD` should be set as secrets:
```bash
wrangler secret put IPFS_AUTH_USERNAME
wrangler secret put IPFS_AUTH_PASSWORD
```

## Usage

The worker exposes a single endpoint that accepts POST requests to `/api/v0/add`. It can be used with kubo-rpc-client:

```typescript
import { create } from 'kubo-rpc-client'

const client = create({
  url: process.env.NODE_ENV === 'development' 
    ? 'http://localhost:8787'
    : 'https://your-worker-domain.com'
})

// Upload a file
const result = await client.add(/* your file data */)
```

## API

### POST /api/v0/add

Uploads a file or directory to IPFS. Compatible with the IPFS `api/v0/add` endpoint.

Query Parameters:
- All query parameters are forwarded to the IPFS node

Response:
- Streams back the IPFS node response
- Each line is a JSON object containing upload progress
- Final line contains the root CID

## Error Handling

- 404: Path not found (only /api/v0/add is supported)
- 405: Method not allowed (only POST is supported)
- 500: IPFS node errors or internal errors 