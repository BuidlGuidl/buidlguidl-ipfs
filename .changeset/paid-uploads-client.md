---
"ipfs-uploader": minor
"bgipfs": minor
---

Make keyless uploads to 402-gated endpoints (MPP/x402, e.g. https://upload.bgipfs.com) payable. `ipfs-uploader` node configs accept a `payment` section (`privateKey` or viem `account`, `maxAmount` spend cap, `onPayment` hook): when an upload gets a 402 back, the uploader signs a gasless EIP-3009 USDC authorization for the quoted price and retries once with the payment attached; results carry `payment` details, and unpaid 402s surface as `paymentRequired` with the price instead of an opaque error. `bgipfs upload config init --pay` (with `--keystore` / `--paymentKeyEnv` / `--maxPayment`) writes a config that sources the payer wallet at upload time from a Foundry/geth Ethereum keystore v3 file (password prompted, or `$BGIPFS_KEYSTORE_PASSWORD`) or from an environment variable, and `bgipfs upload` reports what it paid or how to enable payment.
