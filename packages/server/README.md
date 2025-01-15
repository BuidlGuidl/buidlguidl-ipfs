# IPFS Pinner Gateway

Express server providing HTTP endpoints for IPFS pinning service operations.

## Endpoints
- /upload/file - Single file upload
- /upload/text - Text content upload
- /upload/files - Multiple files upload
- /upload/json - JSON content upload
- /upload/glob - Upload multiple files with path structure
- /ping - Health check endpoint

Uses ipfs-uploader for pinning service communication 