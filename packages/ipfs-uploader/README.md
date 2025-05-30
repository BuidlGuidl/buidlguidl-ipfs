# IPFS Uploader

**Note:** This library is currently in development and may undergo significant changes.

Library for uploading and pinning content to IPFS. Supports multiple backends including IPFS nodes, Pinata, and S3-compatible storage.

## Features
- Upload and pin single files
- Upload and pin text content
- Upload and pin JSON content
- Upload and pin raw buffer data
- Upload and pin directories (with path or file array)
- Upload from URLs
- Support for both Node.js and browser environments
- Support for multiple pinners - IPFS nodes, Pinata, and S3-compatible endpoints (Filebase, 4everland, etc.)
- Support for Pinata presigned URLs for secure client-side uploads

## Installation

```bash
pnpm add ipfs-uploader
```

## Usage

```typescript
import { createUploader, createPresignedUrl } from "ipfs-uploader";

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
const bufferResult = await uploader.add.buffer(Buffer.from("Hello IPFS!"));

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

## Using Presigned URLs with Pinata

For secure client-side uploads, you can use Pinata's presigned URL functionality. This allows you to upload files without exposing your JWT token to the client.

First, create an API endpoint that generates presigned URLs:

```typescript
// Next.js API route example
import { createPresignedUrl } from "ipfs-uploader";

export async function GET(request: Request) {
  const filename = new URL(request.url).searchParams.get("filename") || "upload";
  const url = await createPresignedUrl({
    jwt: process.env.PINATA_JWT!,
    groupId: "my-group-id", // optional
    expires: 30, // optional, defaults to 30 seconds
    defaultFilename: filename
  });
  return Response.json({ url });
}
```

Then use the presigned URL endpoint with the PinataUploader:

```typescript
const uploader = createUploader({
  signingEndpoint: "/api/pinata/sign" // Your presigned URL endpoint
});

// Upload a file using the presigned URL
const result = await uploader.add.file(new File(["Hello IPFS!"], "test.txt"));
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

## Testing

The library includes a comprehensive test suite that verifies functionality across different uploaders and scenarios. To run the tests:

```bash
# Run all tests
pnpm test

# Run tests for a specific uploader
pnpm test -t "S3Uploader"
pnpm test -t "PinataUploader"

# Run specific test cases
pnpm test -t "should upload a directory of files"
pnpm test -t "should upload a file"
```

### Test Coverage

The test suite covers:

1. **File Uploads**
   - Single file uploads
   - File path uploads (Node.js)
   - File object uploads (Browser)

2. **Content Uploads**
   - Text content
   - JSON content
   - Buffer data

3. **Directory Uploads**
   - Directory path uploads (Node.js)
   - File array uploads (Browser)
   - Directory structure preservation

4. **URL Uploads**
   - URL validation
   - Content type handling
   - Error handling for invalid URLs

5. **Provider-Specific Tests**
   - Filebase S3 compatibility
   - Pinata JWT authentication
   - Pinata presigned URLs
   - IPFS node integration

### Environment Setup

Tests require environment variables to be set up in `.env.test`:

```env
# Filebase configuration
FILEBASE_ENDPOINT=https://s3.filebase.com
FILEBASE_ACCESS_KEY=your-access-key
FILEBASE_SECRET_KEY=your-secret-key
FILEBASE_BUCKET=your-bucket

# Pinata configuration
PINATA_JWT=your-jwt-token
PINATA_GATEWAY=https://gateway.pinata.cloud

# BGIPFS configuration
BGIPFS_URL=http://localhost:5555
BGIPFS_X_API_KEY=your-api-key
```

Make sure to set up these environment variables before running the tests.



