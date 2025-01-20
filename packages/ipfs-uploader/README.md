# IPFS Uploader

**Note:** This library is currently in development and may undergo significant changes.

Library for uploading and pinning content to IPFS. Supports multiple backends including IPFS nodes, Pinata, and S3-compatible storage.

## Features
- Upload and pin single files
- Upload and pin text content
- Upload and pin JSON content
- Upload and pin directories (with path or file array)
- Upload from URLs (IPFS nodes only)
- Support for both Node.js and browser environments
- Support for multiple backends
## Installation

```bash
pnpm add ipfs-uploader
```

## Usage

```typescript
import { createUploader } from "ipfs-uploader";

// Single backend example
const pinataUploader = createUploader([
  options: {
    url: "http://localhost:5001" // IPFS node options, read more https://github.com/ipfs/js-kubo-rpc-client?tab=readme-ov-file#options
  }
]);

// Or with custom ID
const pinataWithId = createUploader([
  {
    id: "my-ipfs",
    options: {
      url: "http://localhost:5001" // IPFS node options
    }
  }
]);

// Multiple backends example
const multiUploader = createUploader([
  {
    jwt: "your-jwt-token" // Pinata options
    gateway: "https://gateway.pinata.cloud" // Pinata gateway options
  },
  {
    endpoint: "https://s3.filebase.com", // S3 options
    accessKeyId: "your-access-key",
    secretAccessKey: "your-secret-key",
    bucket: "your-bucket"
  },
  {
    id: "my-ipfs",
    options: {
      url: "http://localhost:5001" // IPFS node options
    }
  }
]);

// Upload examples (works with any uploader)
const textResult = await uploader.add.text("Hello IPFS!");
const fileResult = await uploader.add.file(new File(["Hello IPFS!"], "test.txt"));
const jsonResult = await uploader.add.json({ hello: "IPFS" });

// Directory upload (from path - Node.js only)
const dirResult = await uploader.add.directory({
  dirPath: "./my-folder",
  pattern: "**/*" // optional glob pattern
});

// Directory upload (from files array - works in browser)
const filesResult = await uploader.add.directory({
  dirPath: "my-folder",
  files: [
    {
      path: "hello.txt",
      content: Buffer.from("Hello IPFS!")
    }
  ]
});

// URL upload (IPFS nodes only)
const urlResult = await uploader.add.url("https://example.com");
```

## Response Types

All upload methods return a Promise with an UploadResult:

```typescript
interface UploadResult {
  success: boolean;
  cid: string;
  error?: string;
}
```

When using multiple backends, additional metadata about the upload status is included:

```typescript
interface MultiUploadResult extends UploadResult {
  successCount: number;
  errorCount: number;
  totalNodes: number;
  allNodesSucceeded: boolean;
  results: Array<[string, UploadResult]>;
}
```



