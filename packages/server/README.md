# IPFS Pinner Gateway

Express server providing HTTP endpoints for IPFS pinning service operations.

## Endpoints
- /upload/file - Single file upload
- /upload/text - Text content
- /upload/files - Multiple files
- /upload/directory - Directory upload

Uses ipfs-uploader for pinning service communication 