// Mark as server-only
"use server";

import FormData from "form-data";
import got from "got";
import { UploadResult, DirectoryInput } from "../types.js";
import { globSource } from "kubo-rpc-client";
import fs from "fs";
import { Readable } from "stream";

export async function handleNodeFileUpload(
  input: File | string,
  jwt: string
): Promise<UploadResult> {
  const formData = new FormData();

  if (typeof input === "string") {
    const stream = fs.createReadStream(input);
    const filename = input.split("/").pop() || "file";
    formData.append("file", stream, filename);
  } else {
    // Convert File to Buffer and create a stream
    const buffer = Buffer.from(await input.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // Use form-data's append with explicit stream options
    formData.append("file", stream, {
      filename: input.name,
      contentType: input.type || "application/octet-stream",
      knownLength: buffer.length,
    });
  }

  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await got.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...formData.getHeaders(),
      },
      body: formData,
    }
  );

  const result = JSON.parse(response.body);
  return { success: true, cid: result.IpfsHash };
}

export async function handleNodeDirectoryUpload(
  input: DirectoryInput,
  jwt: string
): Promise<UploadResult> {
  const formData = new FormData();

  if ("files" in input) {
    // Handle browser Files in Node.js - convert to streams
    for (const file of input.files) {
      const buffer = await file.arrayBuffer();
      const readableStream = new Readable();
      readableStream.push(Buffer.from(buffer));
      readableStream.push(null);
      formData.append("file", readableStream, {
        filepath: `${input.dirName}/${file.name}`,
      });
    }
  } else {
    // Handle directory path with streaming
    const dirName = input.dirPath.split("/").pop();
    const source = globSource(input.dirPath, input.pattern ?? "**/*");
    for await (const file of source) {
      if (file.content) {
        formData.append("file", file.content, {
          filepath: `${dirName}${file.path}`,
        });
      }
    }
  }

  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await got.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...formData.getHeaders(),
      },
      body: formData,
    }
  );

  const result = JSON.parse(response.body);
  return { success: true, cid: result.IpfsHash };
}
