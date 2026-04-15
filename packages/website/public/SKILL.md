---
name: bgipfs-upload
description: "Upload files and web apps to IPFS using the bgipfs CLI. Use when deploying a static site to IPFS, uploading individual files for permanent storage, configuring bgipfs API credentials, building Next.js or Scaffold-ETH 2 projects for IPFS, or diagnosing common IPFS upload failures like auth errors and stale content."
---

# bgipfs Upload Guide

Upload a built web app or individual files to IPFS and get a permanent URL via the bgipfs CLI.

## Prerequisites

- `bgipfs` CLI installed: `npm install -g bgipfs`
- A bgipfs API key from https://bgipfs.com (account → API Keys)

## Workflow

### 1. Configure credentials

Run the CLI init command:

```bash
bgipfs upload config init --nodeUrl="https://upload.bgipfs.com" --apiKey="YOUR_KEY"
```

Or manually save to `~/.bgipfs/credentials.json`:

```json
{
  "url": "https://upload.bgipfs.com",
  "headers": {
    "X-API-Key": "YOUR_KEY"
  }
}
```

> **Important**: Never commit credentials. Add `~/.bgipfs/` to `.gitignore`.

### 2. Upload a single file (optional)

For individual files (images, JSON, PDFs) — no build step needed:

```bash
bgipfs upload path/to/file.png --config ~/.bgipfs/credentials.json
```

Upload from a URL:

```bash
bgipfs upload https://example.com/image.png --config ~/.bgipfs/credentials.json
```

Output on success:

```
✓ File uploaded. CID: bafybeig2zw2u6l3yjoncmvqphl7mywrmoknceflkkvvu3iwivsgndq36k4
```

Access at: `https://{CID}.ipfs.community.bgipfs.com/`

### 3. Build for IPFS (web apps)

#### Next.js / Scaffold-ETH 2

```bash
cd packages/nextjs
rm -rf .next out
NEXT_PUBLIC_IPFS_BUILD=true NODE_OPTIONS="--require ./polyfill-localstorage.cjs" npm run build
```

Three required flags:

- `NEXT_PUBLIC_IPFS_BUILD=true` — enables IPFS mode (trailingSlash, correct asset paths)
- `NODE_OPTIONS="--require ./polyfill-localstorage.cjs"` — fixes Node 25+ `localStorage` bug that breaks RainbowKit/next-themes at build time
- `rm -rf .next out` — always clean first; stale chunks are the #1 IPFS deployment bug

The polyfill file (`polyfill-localstorage.cjs`) must exist in `packages/nextjs/`:

```js
// polyfill-localstorage.cjs
if (typeof globalThis.localStorage !== "undefined" &&
    typeof globalThis.localStorage.getItem !== "function") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
}
```

#### Other frameworks

Build to a static output directory, then upload directly:

```bash
bgipfs upload ./dist --config ~/.bgipfs/credentials.json
```

### 4. Upload the build

```bash
bgipfs upload packages/nextjs/out --config ~/.bgipfs/credentials.json
```

Output on success:

```
✓ File uploaded. CID: bafybeig2zw2u6l3yjoncmvqphl7mywrmoknceflkkvvu3iwivsgndq36k4
```

### 5. Access and verify

Access the deployment at:

```
https://{CID}.ipfs.community.bgipfs.com/
```

This is a subdomain gateway — the DNS wildcard resolves `{anything}.ipfs.community.bgipfs.com` to the IPFS gateway. No CNAME setup needed.

Verify the upload:

```bash
curl -s https://{CID}.ipfs.community.bgipfs.com/ | grep "your-unique-string"
```

If the string appears, the new build is live.

## Authentication

Use the `X-API-Key` header — **not** `Authorization: Bearer`:

```json
{ "headers": { "X-API-Key": "YOUR_KEY" } }
```

The CLI handles this automatically when using `--config`.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: upload failed` | Invalid API key | Verify key at bgipfs.com/account |
| 401 / 403 | Wrong header format | Use `X-API-Key`, not Bearer |
| Stale content | Old build artifacts | Run `rm -rf .next out` before every build |
| `localStorage.getItem is not a function` | Node 25+ bug | Add polyfill to `NODE_OPTIONS` |
| Blank page on gateway | `trailingSlash` not enabled | Set `NEXT_PUBLIC_IPFS_BUILD=true` |
