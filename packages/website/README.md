# BuidlGuidl IPFS Interface

Website for BuidlGuidl's IPFS pinning service. Provides a web interface and API endpoints for uploading and managing content on IPFS.

## Features

### Authentication & Access Control
- Privy-powered Web3 login

### Database
- PostgreSQL backend using Prisma ORM
- Tracks API keys, pins per user, and IPFS clusters

### Pages
- /api-keys - list API keys, create new keys
- /pins - list pins, linking to the IPFS gateway
- /upload - UI upload, and code snippets
- /clusters - lists IPFS clusters
- /account - user information and usage

### API Endpoints

All API endpoints accept authentication via:
- Privy session token (web interface)
- API key (programmatic access)

#### Upload Endpoints
All upload endpoints are under `/api/upload/` and accept POST requests.

`/api/upload/file`
Upload a single file using FormData with a 'file' field.

`/api/upload/files`
Upload multiple files using FormData with multiple files and a 'dirName' field.

`/api/upload/text`
Upload plain text content by sending the text directly in the request body.

`/api/upload/json`
Upload JSON data by sending the JSON object in the request body.

`/api/upload/glob`
Upload multiple files with paths using a glob-like format. Send an array of objects containing `path` and `content` fields.

#### Pin Management
`GET /api/pins`
List all tracked pins

`GET /api/pins/{cid}`
Get pin details

`POST /api/pin`
Tracks pinned content

`DELETE /api/pins/{cid}`
Soft-deletes tracked pins

#### API Keys
`GET /api/api-keys`
List all API keys

`POST /api/api-keys`
Create new API key

`DELETE /api/api-keys/{id}`
Delete API key

### User Information
`GET /api/user`
Get user information


## Error Handling

All endpoints return appropriate HTTP status codes:
- 400 for invalid requests
- 401 for unauthorized access
- 403 for forbidden actions
- 500 for server errors
- Each error response includes an `error` field with a description

## Environment Variables

Copy `.env.example` to `.env`. For local full stack, defaults assume **ipfs-proxy** on `http://127.0.0.1:8787` and Postgres from the root compose file—see the [root README](../../README.md) **Development** section for `pnpm dev:db` and `pnpm dev:apps`.

```
## IPFS (server uploads via local worker by default)
IPFS_API_URL=http://127.0.0.1:8787

## If you point IPFS_API_URL at a basic-auth cluster instead of the worker, set Kubo basic auth (not read by the worker path):
# IPFS_AUTH_USERNAME=user
# IPFS_AUTH_PASSWORD=your_cluster_upload_password

## Database (matches root docker-compose.dev.yml when using pnpm dev:db)
DATABASE_URL="postgresql://bgipfs:bgipfs_dev@127.0.0.1:5432/bgipfs"

## Must match WORKER_AUTH_SECRET in packages/ipfs-proxy/.dev.vars
WORKER_AUTH_SECRET=dev-shared-secret

## Privy (required for web login)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your_privy_app_secret
PRIVY_VERIFICATION_KEY=your-verification-key-from-dashboard

DEFAULT_PIN_LIMIT=1000
DEFAULT_SIZE_LIMIT=104857600
NEXT_PUBLIC_DEFAULT_CLUSTER_ID=community
```

After `pnpm db:seed`, the default cluster row keeps **upstream** `apiUrl` at `http://localhost:5555` (Traefik) for the worker to proxy to—not the worker URL itself.

## Development

1. Follow the **Local full stack** checklist in the [root README](../../README.md).
2. Install dependencies from repo root: `pnpm install`
3. Copy `.env.example` to `.env` and fill required values
4. Push database schema: `pnpm prisma db push`
5. For day-to-day app + worker only (with DB and cluster already running): from repo root, `pnpm dev:apps`, or from this package: `pnpm dev`
