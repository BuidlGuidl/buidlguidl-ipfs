import IpfsUploader from "ipfs-uploader";

if (!process.env.IPFS_API_URL) {
  throw new Error("IPFS_API_URL environment variable is not set");
}

if (!process.env.IPFS_AUTH_USERNAME || !process.env.IPFS_AUTH_PASSWORD) {
  throw new Error("IPFS auth credentials are not set");
}

const auth = Buffer.from(
  `${process.env.IPFS_AUTH_USERNAME}:${process.env.IPFS_AUTH_PASSWORD}`
).toString("base64");

export const pinner = new IpfsUploader({
  url: process.env.IPFS_API_URL,
  headers: {
    Authorization: `Basic ${auth}`,
  },
});
