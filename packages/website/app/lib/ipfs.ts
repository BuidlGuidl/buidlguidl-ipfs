import { createUploader } from "ipfs-uploader";
import { headers } from 'next/headers';

export const pinningAuth = Buffer.from(
  `${process.env.IPFS_AUTH_USERNAME}:${process.env.IPFS_AUTH_PASSWORD}`
).toString("base64");

export const pinner = async () => { 
  const headersList = await headers();
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const host = `${protocol}://${headersList.get('host')}`;
  return createUploader({
  url: `${host}/api/ipfs-proxy`,
})};
