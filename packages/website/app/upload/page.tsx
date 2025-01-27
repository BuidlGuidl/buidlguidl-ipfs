'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

export default function PinPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ cid: string; status: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleFileUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/upload/file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const uploadResult = await response.json();
      setResult(uploadResult);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-xl">

        <div className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  For demonstration purposes only. Files uploaded will not be
                  retained.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div
              {...getRootProps()}
              className="border-2 border-dashed border-gray-600 rounded-lg p-6 cursor-pointer hover:border-blue-500 transition-colors"
            >
              <input {...getInputProps()} />
              <div className="text-center">
                {isDragActive ? (
                  <p className="text-blue-500">Drop the file here...</p>
                ) : (
                  <p className="text-gray-400">
                    Drag and drop a file here, or click to select a file
                  </p>
                )}
                {file && (
                  <p className="mt-2 text-sm text-gray-400">
                    Selected: {file.name}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleFileUpload}
              disabled={uploading || !file}
              className="w-full py-2 px-4 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 disabled:bg-gray-600 disabled:text-gray-400"
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