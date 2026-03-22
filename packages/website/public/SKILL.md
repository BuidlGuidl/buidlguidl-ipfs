# bgipfs Upload — AI Agent Guide

## One-line summary
Upload a built web app to bgipfs and get a permanent IPFS URL.

---

## Prerequisites

- `bgipfs` CLI: `npm install -g bgipfs`
- A bgipfs API key from https://bgipfs.com (account → API Keys)

---

## Step 1 — Save credentials

The CLI has an init command:
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

⚠️ Never commit this file. Add `~/.bgipfs/` to your ignore list.

---

## Single file upload

If you just need to upload one file (an image, JSON, PDF, etc.) you do not need a build step:

```bash
bgipfs upload path/to/file.png --config ~/.bgipfs/credentials.json
```

Output on success:
```
✓ File uploaded. CID: bafybeig2zw2u6l3yjoncmvqphl7mywrmoknceflkkvvu3iwivsgndq36k4
```

Access it at:
```
https://{CID}.ipfs.community.bgipfs.com/
```

The CID points directly to the file — no filename path needed.

You can also upload from a URL:
```bash
bgipfs upload https://example.com/image.png --config ~/.bgipfs/credentials.json
```

---

## Step 2 — Build for IPFS

### Next.js / Scaffold-ETH 2

```bash
cd packages/nextjs
rm -rf .next out
NEXT_PUBLIC_IPFS_BUILD=true NODE_OPTIONS="--require ./polyfill-localstorage.cjs" npm run build
```

**Three required flags:**
- `NEXT_PUBLIC_IPFS_BUILD=true` — enables IPFS mode (trailingSlash, correct asset paths)
- `NODE_OPTIONS="--require ./polyfill-localstorage.cjs"` — fixes Node 25+ `localStorage` bug that breaks RainbowKit/next-themes at build time
- `rm -rf .next out` — always clean first; stale chunks are the #1 IPFS bug

The polyfill file (`polyfill-localstorage.cjs`) should live in `packages/nextjs/`:

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

### Other frameworks

Build to a static output directory, then:
```bash
bgipfs upload ./dist --config ~/.bgipfs/credentials.json
```

---

## Step 3 — Upload

```bash
bgipfs upload packages/nextjs/out --config ~/.bgipfs/credentials.json
```

Output on success:
```
✓ File uploaded. CID: bafybeig2zw2u6l3yjoncmvqphl7mywrmoknceflkkvvu3iwivsgndq36k4
```

---

## Step 4 — Access

```
https://{CID}.ipfs.community.bgipfs.com/
```

This is a subdomain gateway. The DNS wildcard resolves `{anything}.ipfs.community.bgipfs.com` to the IPFS gateway. No CNAME setup needed.

---

## Auth — The Gotcha

**Use `X-API-Key` header. NOT `Authorization: Bearer`.**

Wrong:
```bash
curl -H "Authorization: Bearer $KEY" ...
```

Correct:
```json
{ "headers": { "X-API-Key": "$KEY" } }
```

The CLI handles this automatically when you use `--config`.

---

## Verify the Upload

```bash
curl -s https://{CID}.ipfs.community.bgipfs.com/ | grep "your-unique-string"
```

If the string appears, the new build is live. If not, the upload may have failed silently or the build was empty.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: upload failed` | Invalid API key | Verify key at bgipfs.com/account |
| 401 / 403 | Wrong header format | Use `X-API-Key`, not Bearer |
| Stale content | `rm -rf .next out` not run | Clean before every build |
| `localStorage.getItem is not a function` | Node 25+ bug | Add polyfill to `NODE_OPTIONS` |
| Blank page on gateway | `trailingSlash` not enabled | Set `NEXT_PUBLIC_IPFS_BUILD=true` |
