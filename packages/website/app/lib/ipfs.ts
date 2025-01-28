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

  if (apiKey) {
    uploaderConfig.headers = {
      "X-API-Key": apiKey,
    };
  }

  return createUploader(uploaderConfig);
};
