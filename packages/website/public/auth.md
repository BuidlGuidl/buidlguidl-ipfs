# Authentication — bgipfs

How to authenticate with the bgipfs upload API at `https://upload.bgipfs.com`.

## Option 1: API key (free tier)

1. Sign in at https://www.bgipfs.com (email or wallet).
2. Create a key on the [API Keys page](https://www.bgipfs.com/api-keys).
3. Send it as the `X-API-Key` header on every request.

```bash
curl -X POST "https://upload.bgipfs.com/api/v0/add" \
  -H "X-API-Key: YOUR_KEY" \
  -F file=@path/to/file.png
```

**Important:** use the `X-API-Key` header. `Authorization: Bearer` is NOT
supported and returns 401/403.

The `bgipfs` CLI and `ipfs-uploader` library handle this for you — see
[/SKILL.md](https://www.bgipfs.com/SKILL.md) for setup.

## Option 2: keyless paid uploads (x402 / MPP)

No account needed. A `POST /api/v0/add` without an API key returns
`HTTP 402 Payment Required` carrying both an [x402](https://www.x402.org)
v2 challenge and an [MPP](https://mpp.dev) challenge.

- Price: flat $0.01 USDC per upload (currently on Base Sepolia)
- Max upload size: 100MB (a `Content-Length` header is required)
- Pay with any x402 v2 client (e.g. `@x402/fetch`), an MPP client (`mppx`),
  the `bgipfs` CLI (`bgipfs upload --pay`), or `ipfs-uploader`'s `payment`
  config.

## Website API

The `/api/*` routes on `www.bgipfs.com` back the web app itself (session
auth via Privy) and are not a public API. Agents should use
`https://upload.bgipfs.com` with one of the options above.
