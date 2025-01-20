# BuidlGuidl IPFS Interface

Website for BuidlGuidl's IPFS pinning service.

## Features
- Background & docs
- Demo file upload
- API endpoints for uploading content to IPFS

## API Endpoints

All API endpoints are under `/api/upload/` and accept POST requests.

### `/api/upload/file`
Upload a single file using FormData with a 'file' field.

### `/api/upload/files`
Upload multiple files using FormData with multiple files and a 'dirName' field.

### `/api/upload/text`
Upload plain text content by sending the text directly in the request body.

### `/api/upload/json`
Upload JSON data by sending the JSON object in the request body.

### `/api/upload/glob`
Upload multiple files with paths using a glob-like format. Send an array of objects containing `path` and `content` fields.

## Response Format

All successful uploads return a JSON response with:
- `cid`: The IPFS Content Identifier
- `size`: Size of the uploaded content in bytes
- Additional metadata depending on the upload type

## Error Handling

All endpoints return appropriate HTTP status codes:
- 400 for invalid requests
- 500 for server errors
- Each error response includes an `error` field with a description
