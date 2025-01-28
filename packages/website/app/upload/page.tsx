"use client";

import { useApiKeys } from "@/app/hooks/use-api-keys";
import FileUploader from "../components/FileUploader";
import { usePrivy } from "@privy-io/react-auth";

function CodeExample({ apiKey = "YOUR_API_KEY" }: { apiKey?: string }) {
  return (
    <div className="space-y-6 mt-8 p-6 bg-gray-900 rounded-lg border border-gray-800">
      <h2 className="text-xl font-semibold text-gray-100">Code Examples</h2>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">bgipfs CLI</h3>
          <div className="bg-gray-950 p-4 rounded-md">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>{`# Install bgipfs CLI
npm install -g bgipfs

# Initialize with your API key
bgipfs upload config init --node-url="https://community.bgipfs.com" --api-key="${apiKey}"

# Upload a file
bgipfs upload ./my-file.txt`}</code>
            </pre>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            ipfs-uploader SDK
          </h3>
          <div className="bg-gray-950 p-4 rounded-md">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>{`import { createUploader } from "ipfs-uploader";

const uploader = createUploader({
  url: "https://community.bgipfs.com",
  headers: {
    "X-API-Key": "${apiKey}"
  }
});

// Upload a file
const result = await uploader.add.file(fileObject);
console.log(\`File uploaded: \${result.cid}\`);

// Upload from URL
const urlResult = await uploader.add.url("https://example.com/image.png");
console.log(\`URL content uploaded: \${urlResult.cid}\`);`}</code>
            </pre>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Fetch API</h3>
          <div className="bg-gray-950 p-4 rounded-md">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>{`const formData = new FormData();
formData.append("file", fileObject);

const response = await fetch("https://community.bgipfs.com/api/v0/add", {
  method: "POST",
  headers: {
    "X-API-Key": "${apiKey}"
  },
  body: formData
});

const result = await response.json();
console.log(\`File uploaded: \${result.Hash}\`);`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PinPage() {
  const { authenticated } = usePrivy();
  const { data: keys } = useApiKeys();
  const apiKey = authenticated ? keys?.[0]?.apiKey : undefined;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8">
          <FileUploader apiKey={apiKey} />
        </div>
        <CodeExample apiKey={apiKey} />
      </div>
    </div>
  );
}
