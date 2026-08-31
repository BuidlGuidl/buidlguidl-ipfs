# ipfs-uploader

## 0.1.0

### Minor Changes

- 4a20cb3: Make keyless uploads to 402-gated endpoints (MPP/x402, e.g. https://upload.bgipfs.com) payable. `ipfs-uploader` node configs accept a `payment` section (`privateKey` or viem `account`, `maxAmount` spend cap, `onPayment` hook): when an upload gets a 402 back, the uploader signs a gasless EIP-3009 USDC authorization for the quoted price and retries once with the payment attached; results carry `payment` details, and unpaid 402s surface as `paymentRequired` with the price instead of an opaque error. `bgipfs upload config init --pay` (with `--keystore` / `--paymentKeyEnv` / `--maxPayment`) writes a config that sources the payer wallet at upload time from a Foundry/geth Ethereum keystore v3 file (password prompted, or `$BGIPFS_KEYSTORE_PASSWORD`) or from an environment variable, and `bgipfs upload` reports what it paid or how to enable payment.

## 0.0.12

### Patch Changes

- 00263aa: configurable cidVersion where available, direct file upload

## 0.0.11

### Patch Changes

- 508f7ca: pinata signedUrls, stauro for filebase, tests

## 0.0.10

### Patch Changes

- d7ddc0d: fix server pinata File upload

## 0.0.9

### Patch Changes

- 44e5a55: update multiuploader success to require all nodes

## 0.0.8

### Patch Changes

- 2fc1fd0: add.json consistency & robustness

## 0.0.7

### Patch Changes

- 875e07f: add.buffer method

## 0.0.6

### Patch Changes

- 5b8a5ac: fix s3Config, separate node pinata upload

## 0.0.5

### Patch Changes

- 9a1e333: revert to aws sdk

## 0.0.4

### Patch Changes

- 78a86d3: browser support, lighter s3 lib

## 0.0.3

### Patch Changes

- a378dcb: more informative logging, new repo location

## 0.0.2

### Patch Changes

- d945cac: use ipfs-car for s3 uploads

## 0.0.1

### Patch Changes

- Initial release for testing
