'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

export default function PinPage() {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ cid: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleFileUpload = async () => {
    if (!file) return
    
    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/upload/file`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const uploadResult = await response.json()
      setResult(uploadResult)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-xl">
        <div className="space-y-4">
          <div className="space-y-2">
            <div
              {...getRootProps()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 transition-colors"
            >
              <input {...getInputProps()} />
              <div className="text-center">
                {isDragActive ? (
                  <p className="text-blue-500">Drop the file here...</p>
                ) : (
                  <p className="text-gray-500">
                    Drag and drop a file here, or click to select a file
                  </p>
                )}
                {file && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {file.name}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleFileUpload}
              disabled={uploading || !file}
              className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
            >
              {uploading ? "Uploading..." : "Upload to IPFS"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4 p-6 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <p className="text-xl font-semibold text-green-800 mb-4">
              Upload successful!
            </p>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-gray-700">CID: </span>
                <code className="bg-white px-3 py-1 rounded-md border border-green-200 text-green-800 font-mono text-sm">
                  {result.cid}
                </code>
              </div>
              <div>
                <span className="font-medium text-gray-700">Status: </span>
                <span
                  className={`${result.status === "failed" ? "text-red-600" : "text-green-600"}`}
                >
                  {result.status}
                </span>
              </div>
              <a
                href={`https://gateway.bgipfs.com/ipfs/${result.cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline"
              >
                View on IPFS Gateway
                <svg
                  className="w-4 h-4 ml-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 