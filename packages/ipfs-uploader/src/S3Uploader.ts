import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { CarWriter } from "@ipld/car";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { unixfs } from "@helia/unixfs";
import { mfs } from "@helia/mfs";
import {
  BaseUploader,
  UploadResult,
  FileArrayResult,
  S3UploaderConfig,
  S3Config,
  S3Options,
} from "./types.js";
import { createErrorResult } from "./utils.js";

export class S3Uploader implements BaseUploader {
  private client: S3Client;
  private config: S3UploaderConfig;

  constructor(config: S3Config) {
    this.config = {
      options: "id" in config ? config.options : (config as S3Options),
      id: "id" in config ? config.id : undefined,
    };

    this.client = new S3Client({
      endpoint: this.config.options.endpoint,
      region: this.config.options.region || "us-east-1",
      credentials: {
        accessKeyId: this.config.options.accessKeyId,
        secretAccessKey: this.config.options.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  get id(): string {
    return this.config.id ?? this.config.options.endpoint;
  }

  private async getCidFromMetadata(key: string): Promise<string> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.options.bucket,
        Key: key,
      });

      const response = await this.client.send(headCommand);

      if (
        !response.$metadata.httpStatusCode ||
        response.$metadata.httpStatusCode !== 200
      ) {
        throw new Error("Failed to get object metadata");
      }

      // Try both metadata formats
      const cidStr =
        response.Metadata?.["ipfs-hash"] || // 4EVERLAND
        response.Metadata?.["cid"] || // Filebase
        response.Metadata?.["x-amz-meta-cid"]; // Filebase alternative

      if (!cidStr) {
        throw new Error("Could not find IPFS CID in object metadata");
      }

      return cidStr;
    } catch (error) {
      throw new Error(
        `Failed to get CID: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async uploadDirectory(
    files: { path: string; content: Buffer | Uint8Array }[]
  ): Promise<UploadResult> {
    // Sort files by path depth (deeper paths first)
    files.sort((a, b) => {
      return (
        (b.path.match(/\//g) || []).length - (a.path.match(/\//g) || []).length
      );
    });

    // Setup temporary stores
    const blockstore = new MemoryBlockstore();
    const datastore = new MemoryDatastore();

    // Create UnixFS instance
    const fs = unixfs({ blockstore });
    const heliaFs = mfs({ blockstore, datastore });

    // Add all files to UnixFS
    for (const file of files) {
      const normalizedPath = file.path.startsWith("/")
        ? file.path
        : `/${file.path}`;

      // Create parent directories if needed
      const parentDirs = normalizedPath.split("/").slice(0, -1);
      let currentPath = "";
      for (const dir of parentDirs) {
        if (dir) {
          currentPath += "/" + dir;
          try {
            await heliaFs.mkdir(currentPath);
          } catch (error) {
            // Directory might already exist, continue
          }
        }
      }

      // Add file content
      const cid = await fs.addBytes(file.content);
      await heliaFs.cp(cid.toString(), normalizedPath);
    }

    // Get root CID
    const rootStat = await heliaFs.stat("/");

    // Create CAR file
    const { writer, out } = CarWriter.create([rootStat.cid]);
    const chunks: Uint8Array[] = [];
    for await (const chunk of out) {
      chunks.push(chunk);
    }
    const carFile = new Blob(chunks);

    // Upload CAR file
    const key = `dir-${Date.now()}.car`;
    const command = new PutObjectCommand({
      Bucket: this.config.options.bucket,
      Key: key,
      Body: carFile,
      Metadata: {
        import: "car", // Signal to provider this is a CAR file
      },
    });

    const putResponse = await this.client.send(command);
    if (
      !putResponse.$metadata.httpStatusCode ||
      putResponse.$metadata.httpStatusCode !== 200
    ) {
      throw new Error("Failed to upload to S3");
    }

    const cid = await this.getCidFromMetadata(key);

    return { success: true, cid };
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      try {
        let key: string;
        let body: Buffer | Uint8Array | string | Blob;

        if (input instanceof File) {
          key = input.name;
          body = input;
        } else if (typeof window === "undefined") {
          const { readFile } = await import("fs/promises");
          body = await readFile(input);
          key = input.split("/").pop() || "file";
        } else {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        const command = new PutObjectCommand({
          Bucket: this.config.options.bucket,
          Key: key,
          Body: body,
        });

        const putResponse = await this.client.send(command);
        if (
          !putResponse.$metadata.httpStatusCode ||
          putResponse.$metadata.httpStatusCode !== 200
        ) {
          throw new Error("Failed to upload to S3");
        }

        const cid = await this.getCidFromMetadata(key);

        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    text: async (content: string): Promise<UploadResult> => {
      try {
        const key = `text-${Date.now()}.txt`;
        const command = new PutObjectCommand({
          Bucket: this.config.options.bucket,
          Key: key,
          Body: content,
          ContentType: "text/plain",
        });

        const putResponse = await this.client.send(command);
        if (
          !putResponse.$metadata.httpStatusCode ||
          putResponse.$metadata.httpStatusCode !== 200
        ) {
          throw new Error("Failed to upload to S3");
        }

        const cid = await this.getCidFromMetadata(key);
        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async (content: any): Promise<UploadResult> => {
      try {
        const key = `json-${Date.now()}.json`;
        const command = new PutObjectCommand({
          Bucket: this.config.options.bucket,
          Key: key,
          Body: JSON.stringify(content),
          ContentType: "application/json",
        });

        const putResponse = await this.client.send(command);
        if (
          !putResponse.$metadata.httpStatusCode ||
          putResponse.$metadata.httpStatusCode !== 200
        ) {
          throw new Error("Failed to upload to S3");
        }

        const cid = await this.getCidFromMetadata(key);
        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    url: async (url: string): Promise<UploadResult> => {
      try {
        // Validate URL
        const parsedUrl = new URL(url);
        const filename = parsedUrl.pathname.split("/").pop() || "download";
        const key = `url-${Date.now()}-${filename}`;

        // Download the file
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download from URL: ${response.statusText}`
          );
        }

        // Get content type and blob
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";
        const blob = await response.blob();

        // Upload to S3
        const command = new PutObjectCommand({
          Bucket: this.config.options.bucket,
          Key: key,
          Body: blob,
          ContentType: contentType,
        });

        const putResponse = await this.client.send(command);
        if (
          !putResponse.$metadata.httpStatusCode ||
          putResponse.$metadata.httpStatusCode !== 200
        ) {
          throw new Error("Failed to upload to S3");
        }

        const cid = await this.getCidFromMetadata(key);

        return { success: true, cid };
      } catch (error) {
        if (error instanceof Error && error.message.includes("Invalid URL")) {
          throw new Error("Invalid URL provided");
        }
        return createErrorResult<UploadResult>(error);
      }
    },

    directory: async (path: string): Promise<UploadResult> => {
      try {
        if (typeof window !== "undefined") {
          throw new Error(
            "Directory uploads are only supported in Node.js environments"
          );
        }

        const { readFile } = await import("fs/promises");
        const { readdir } = await import("fs/promises");
        const { join } = await import("path");

        const files = await readdir(path, {
          recursive: true,
          withFileTypes: true,
        });
        const entries = await Promise.all(
          files
            .filter((file) => file.isFile())
            .map(async (file) => ({
              path: file.path,
              content: await readFile(join(path, file.path)),
            }))
        );

        return this.uploadDirectory(entries);
      } catch (error) {
        console.log("error!", error);
        return createErrorResult<UploadResult>(error);
      }
    },

    files: async (files: File[]): Promise<FileArrayResult> => {
      try {
        const entries = await Promise.all(
          files.map(async (file) => ({
            path: file.name,
            content: new Uint8Array(await file.arrayBuffer()),
          }))
        );

        const result = await this.uploadDirectory(entries);
        return {
          success: true,
          cid: result.cid,
          files: files.map((f) => ({ name: f.name, cid: result.cid })),
        };
      } catch (error) {
        return createErrorResult<FileArrayResult>(error, true);
      }
    },

    globFiles: async (): Promise<FileArrayResult> => {
      return createErrorResult<FileArrayResult>(
        "GlobFiles are not supported in S3Uploader",
        true
      );
    },
  };
}
