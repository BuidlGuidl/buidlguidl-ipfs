# @ipfs-proxy

A Cloudflare Worker that provides a proxy for IPFS file uploads, specifically handling the `/api/v0/add` endpoint. This is designed to be used by the [website](/packages/website/), providing "hooks" for validation of API keys, and tracking of pins in an app database, while maintaining streaming-enabled uploads of large files.

## Features

- Proxies IPFS file upload requests to a specified IPFS node
- Handles large file uploads (operator-specified max size)
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

For **local development**, copy `.dev.vars.example` to `.dev.vars` and set the values (see that file for the full list). The worker expects `APP_API_URL`, `WORKER_AUTH_SECRET`, and IPFS basic auth credentials.

For **production and staging**, see [DEPLOY.md](./DEPLOY.md) for a full runbook and secret checklist. Summary of variables:

- `APP_API_URL` - The domain of the app that will be making the `api/auth` verification, and the callback to `/api/pin`
- `WORKER_AUTH_SECRET` - A secret key for the worker, used to validate requests to the `/api/auth` and `/api/pin` endpoints come from a trusted worker
- `IPFS_AUTH_USERNAME` and `IPFS_AUTH_PASSWORD` are basic auth for authentication of the cloudflare worker by the IPFS node
- `DEFAULT_API_KEY` - A default API key to use if no API key is provided (optional - this enables unauthenticated pinning to the associated account)
- `MAX_UPLOAD_SIZE` - The maximum size of a file to upload, in bytes. Defaults to 100MB.

Set secrets via `wrangler secret put <VARIABLE>` (or in the Cloudflare dashboard). See [DEPLOY.md](./DEPLOY.md).

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
- 401: Unauthorized (invalid API key)
- 413: Payload too large (file too large)
- 405: Method not allowed (only POST is supported)
- **Non-2xx from IPFS** (e.g. IPFS auth failure, node error): Status and body from the IPFS node are forwarded as-is. The client receives the same HTTP status and a JSON body `{ "error": "<message>" }` with the upstream message.
- **Error during stream** (e.g. no CIDs to pin, parse error): The response has already started (200). A single NDJSON line is sent with the error: `{"Error":"<message>"}\n`. Clients should check each line for an `Error` field and treat the upload as failed when present. 