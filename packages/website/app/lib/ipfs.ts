import { createUploader, NodeConfig } from "ipfs-uploader";
import { headers } from "next/headers";

interface PinnerOptions {
  apiKey?: string;
}

export const pinner = async ({ apiKey }: PinnerOptions = {}) => {
  await headers();

  const uploaderConfig: NodeConfig = {
    url: process.env.IPFS_API_URL,
  };

  // Keyless (demo) uploads use the server-side demo account key, so they
  // keep working when the worker gates keyless requests behind payment.
  const key = apiKey || process.env.DEMO_API_KEY;
  if (key) {
    uploaderConfig.headers = {
      "X-API-Key": key,
    };
  }

  return createUploader(uploaderConfig);
};
