# @ipfs-proxy

A Cloudflare Worker that provides a proxy for IPFS file uploads, specifically handling the `/api/v0/add` endpoint. This is designed to be used by the [website](/packages/website/), providing "hooks" for validation of API keys, and tracking of pins in an app database, while maintaining streaming-enabled uploads of large files.

## Features

- Proxies IPFS file upload requests to a specified IPFS node
- Handles large file uploads (up to Cloudflare's limits)
- Validates API keys by calling an "/api/auth" endpoint - success returns a 200 status and an IPFS node URL
- After upload, makes a callback to "/api/pin" with the pinned CIDs & API key
- Streams requests and responses
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
- `APP_API_URL` - The domain of the app that will be making the `api/auth` verification, and the callback to `/api/pin`
- `WORKER_AUTH_SECRET` - A secret key for the worker, used to validate requests to the `/api/auth` and `/api/pin` endpoints come from a trusted worker
- `IPFS_AUTH_USERNAME` and `IPFS_AUTH_PASSWORD` are basic auth for authentication of the cloudflare worker by the IPFS node
- `DEFAULT_API_KEY` - A default API key to use if no API key is provided (optional - this enables unauthenticated pinning to the associated account)

All variables should be set as secrets:
```bash
wrangler secret put <VARIABLE>
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