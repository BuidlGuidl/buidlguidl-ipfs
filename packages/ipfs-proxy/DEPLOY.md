# ipfs-proxy deployment

Deploy the worker to Cloudflare with Wrangler. Use the **default** config for production and `--env staging` for a separate staging worker.

## Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) (or npm)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (included as dev dependency)
- Cloudflare account: run `pnpm exec wrangler login` (or `npx wrangler login`) once

## Environments

| Target     | Deploy command              | Worker name           |
| ---------- | --------------------------- | --------------------- |
| Production | `pnpm deploy`               | `ipfs-proxy`          |
| Staging    | `pnpm exec wrangler deploy --env staging` | `ipfs-proxy-staging` |

`wrangler.json` defines:

- **Top-level**: production (default). `vars` include `APP_API_URL` and `MAX_UPLOAD_SIZE`.
- **env.staging**: staging worker. Set `APP_API_URL` (and optionally override other vars) for your staging app; you can override via [secrets](#secrets) so the repo stays generic.

## Secrets (required for both envs)

These are **not** in the config file; set them per environment in the Cloudflare dashboard or via CLI:

| Secret               | Description |
| -------------------- | ----------- |
| `WORKER_AUTH_SECRET` | Shared secret your app uses to verify requests from this worker (`x-worker-auth`). Must match the app’s configured value. |
| `IPFS_AUTH_USERNAME` | Basic auth username for the IPFS node the worker proxies to. |
| `IPFS_AUTH_PASSWORD` | Basic auth password for that IPFS node. |

Optional:

| Secret            | Description |
| ----------------- | ----------- |
| `DEFAULT_API_KEY` | If set, used when the client omits `x-api-key` (e.g. unauthenticated pinning to a single account). |

### Setting secrets via CLI

From `packages/ipfs-proxy`:

```bash
# Production (default)
pnpm exec wrangler secret put WORKER_AUTH_SECRET
pnpm exec wrangler secret put IPFS_AUTH_USERNAME
pnpm exec wrangler secret put IPFS_AUTH_PASSWORD

# Staging (same secrets, but scoped to ipfs-proxy-staging)
pnpm exec wrangler secret put WORKER_AUTH_SECRET --env staging
pnpm exec wrangler secret put IPFS_AUTH_USERNAME --env staging
pnpm exec wrangler secret put IPFS_AUTH_PASSWORD --env staging
```

You will be prompted for each value. To override `APP_API_URL` for an env (e.g. staging) without committing it, you can set it as a secret:

```bash
pnpm exec wrangler secret put APP_API_URL --env staging
```

(If a secret has the same name as a `vars` key, the secret takes precedence.)

## Deploy steps

1. From repo root: `pnpm install`
2. From `packages/ipfs-proxy`: ensure secrets are set for the target env (see above).
3. Deploy:
   - Production: `pnpm deploy`
   - Staging: `pnpm exec wrangler deploy --env staging`
4. Note the worker URL in the deploy output (e.g. `https://ipfs-proxy.<subdomain>.workers.dev` or your custom route).

## Rollback

To roll back to the previous version:

```bash
pnpm exec wrangler rollback
# or for staging:
pnpm exec wrangler rollback --env staging
```

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and fill in values (see README).
2. Run `pnpm dev` and use the printed URL (e.g. `http://localhost:8787`) as the IPFS API URL in your app.

## Deploy from Git (Cloudflare dashboard)

You can connect the worker to this repo so Cloudflare deploys on push: **Workers & Pages** → your worker → **Settings** → **Builds & deployments** → connect your GitHub repo and set the build config (e.g. root directory `packages/ipfs-proxy`, build command `pnpm install && pnpm exec wrangler deploy`). Secrets are configured in the dashboard for that worker.
