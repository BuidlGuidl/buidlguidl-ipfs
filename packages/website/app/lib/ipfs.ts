import { createUploader } from "ipfs-uploader";
import { headers } from 'next/headers';

export const pinner = async () => { 
  await headers();
  return createUploader({
  url: process.env.IPFS_API_URL,
})};
