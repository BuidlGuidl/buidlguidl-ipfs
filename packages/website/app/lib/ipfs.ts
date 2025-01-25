import { createUploader } from "ipfs-uploader";

if (!process.env.IPFS_PROXY_URL) {
  throw new Error("IPFS_PROXY_URL environment variable is not set");
}

export const pinningAuth = Buffer.from(
  `${process.env.IPFS_AUTH_USERNAME}:${process.env.IPFS_AUTH_PASSWORD}`
).toString("base64");

export const pinner = createUploader({
  url: process.env.IPFS_PROXY_URL,
});
