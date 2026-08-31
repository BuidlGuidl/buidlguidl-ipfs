# bgipfs

## 0.1.0

### Minor Changes

- 4a20cb3: Make keyless uploads to 402-gated endpoints (MPP/x402, e.g. https://upload.bgipfs.com) payable. `ipfs-uploader` node configs accept a `payment` section (`privateKey` or viem `account`, `maxAmount` spend cap, `onPayment` hook): when an upload gets a 402 back, the uploader signs a gasless EIP-3009 USDC authorization for the quoted price and retries once with the payment attached; results carry `payment` details, and unpaid 402s surface as `paymentRequired` with the price instead of an opaque error. `bgipfs upload config init --pay` (with `--keystore` / `--paymentKeyEnv` / `--maxPayment`) writes a config that sources the payer wallet at upload time from a Foundry/geth Ethereum keystore v3 file (password prompted, or `$BGIPFS_KEYSTORE_PASSWORD`) or from an environment variable, and `bgipfs upload` reports what it paid or how to enable payment.

### Patch Changes

- 1da6cee: Post-rollout hardening: fix the DNS template's subdomain-gateway rule for Traefik v3 (v2 `{name:regex}` syntax was silently dropped, breaking subdomain gateway URLs), set `restart: unless-stopped` on template services and inject it during `cluster update` so nodes survive reboots and daemon crashes, report the backup directory accurately (no more "backup was created" after declining), and add an UPGRADING.md runbook.
- Updated dependencies [4a20cb3]
  - ipfs-uploader@0.1.0

## 0.0.21

### Patch Changes

- e656c3b: Overhaul `bgipfs cluster update`: pin Kubo v0.41.0, IPFS Cluster v1.1.6, and Traefik v3.6.1 as managed image tags (single-sourced and template-checked), migrate the live Kubo config and remove the legacy read-only `ipfs.config.json` bind mount, verify the cluster after updating, and fail loudly on backup problems. `cluster backup` now works on clusters without the legacy exported config, and permission errors on the live config point at the `chown` fix.

## 0.0.20

### Patch Changes

- d36e28d: Remove accelerated DHT client from default IPFS config and use entity-level provider records for current Kubo repos.

## 0.0.19

### Patch Changes

- a15ca05: Add IPFS daemon config migration defaults and expose an IPFS-only dry run mode.
- Updated dependencies [00263aa]
  - ipfs-uploader@0.0.12

## 0.0.18

### Patch Changes

- 1d6264b: Added X-Forwarded-Proto=https header to gateway requests

## 0.0.17

### Patch Changes

- 059cc3e: bgipfs sync robustness and performance improvements

## 0.0.16

### Patch Changes

- 508f7ca: ipfs peering (announcing and adding), updating versions
- Updated dependencies [508f7ca]
  - ipfs-uploader@0.0.11

## 0.0.15

### Patch Changes

- Updated dependencies [d7ddc0d]
  - ipfs-uploader@0.0.10

## 0.0.14

### Patch Changes

- Updated dependencies [44e5a55]
  - ipfs-uploader@0.0.9

## 0.0.13

### Patch Changes

- Updated dependencies [2fc1fd0]
  - ipfs-uploader@0.0.8

## 0.0.12

### Patch Changes

- 875e07f: edit files for window support
- Updated dependencies [875e07f]
  - ipfs-uploader@0.0.7

## 0.0.11

### Patch Changes

- Updated dependencies [5b8a5ac]
  - ipfs-uploader@0.0.6

## 0.0.10

### Patch Changes

- Updated dependencies [9a1e333]
  - ipfs-uploader@0.0.5

## 0.0.9

### Patch Changes

- Updated dependencies [78a86d3]
  - ipfs-uploader@0.0.4

## 0.0.8

### Patch Changes

- a378dcb: more informative logging, new repo location
- Updated dependencies [a378dcb]
  - ipfs-uploader@0.0.3

## 0.0.7

### Patch Changes

- Updated dependencies [d945cac]
  - ipfs-uploader@0.0.2

## 0.0.6

### Patch Changes

- eb49e9d: Pass api key to upload config init
- 9804333: Config & restart ux improvements

## 0.0.5

### Patch Changes

- 1d44c88: Fix traefik connection closure

## 0.0.4

### Patch Changes

- 740e628: Simplification and robustness for node initiation & config

## 0.0.2

### Patch Changes

- 1b96d29: Docs fixes & initial install improvements

## 0.0.1

### Patch Changes

- Initial release for testing
- Updated dependencies
  - ipfs-uploader@0.0.1
