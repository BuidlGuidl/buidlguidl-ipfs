# IPFS Uploader

**Note:** This library is currently in development and may undergo significant changes.

Library for uploading and pinning content of various types to IPFS. Currently allows uploading to a JSON-RPC API compatible with the [IPFS core API](https://github.com/ipfs/js-ipfs/tree/master/docs/core-api), with optional basic auth.

## Functions
- Add and pin files
- Add and pin text/JSON content
- Add and pin directories (Node.js)
- Add and pin an array of files
- Add and pin a glob
- Add and pin a URL

## Installation

```bash
p   npm add ipfs-uploader
```

## Usage

```ts
import IpfsUploader from "ipfs-uploader";

const ipfs = new IpfsUploader({
  url: "http://localhost:5001",
});

const textResult = await ipfs.add.text("Hello IPFS!");
const fileResult = await ipfs.add.file(new File(["Hello IPFS!"], "test.txt"));
const globResult = await ipfs.add.glob("**/*");
const urlResult = await ipfs.add.url("https://example.com");

console.log(textResult, fileResult, globResult, urlResult);
```



