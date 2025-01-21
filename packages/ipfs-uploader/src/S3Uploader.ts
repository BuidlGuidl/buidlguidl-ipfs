import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { CarWriter } from "@ipld/car";
import { mfs } from "@helia/mfs";
import { car } from "@helia/car";
import { createHelia } from "helia";
import {
  BaseUploader,
  UploadResult,
  S3UploaderConfig,
  S3Config,
  S3Options,
  DirectoryInput,
} from "./types.js";
import { createErrorResult } from "./utils.js";
import { globSource } from "kubo-rpc-client";
import all from "it-all";

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
    files: { path: string; content: Buffer | Uint8Array }[],
    rootName?: string
  ): Promise<UploadResult> {
    // Sort files by path depth (deeper paths first)
    files.sort((a, b) => {
      return (
        (b.path.match(/\//g) || []).length - (a.path.match(/\//g) || []).length
      );
    });

    const helia = await createHelia({ start: false });

    const heliaFs = mfs(helia);

    // Add all files to UnixFS
    for (const file of files) {
      // Create directory path if needed
      const pathParts = file.path.split("/").slice(1, -1);
      let currentPath = "";
      for (const part of pathParts) {
        currentPath += "/" + part;
        try {
          await heliaFs.mkdir(currentPath);
        } catch (error) {
          // directory exists
        }
      }

      // Add file content
      const filename = "/" + (file.path.split("/").pop() || "");
      await heliaFs.writeBytes(file.content, filename);
      if (filename !== file.path) {
        await heliaFs.cp(filename, file.path);
        await heliaFs.rm(filename);
      }
    }

    // Get root CID and create CAR file
    const rootStat = await heliaFs.stat("/");

    // Export as CAR file
    const c = car(helia);
    const { writer, out } = await CarWriter.create([rootStat.cid]);

    // Collect CAR chunks in memory
    const chunks: Uint8Array[] = [];
    const collectChunks = async () => {
      for await (const chunk of out) {
        chunks.push(chunk);
      }
    };

    // Start collecting chunks and export simultaneously
    const [_] = await Promise.all([
      collectChunks(),
      c.export(rootStat.cid, writer),
    ]);

    // Concatenate chunks into single buffer
    const carContent = Buffer.concat(chunks);

    // Upload CAR file with proper metadata
    const key = rootName || rootStat.cid.toString();
    const command = new PutObjectCommand({
      Bucket: this.config.options.bucket,
      Key: key,
      Body: carContent,
      Metadata: {
        import: "car",
      },
    });

    await this.client.send(command);
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

        // Convert blob to buffer for S3
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to S3
        const command = new PutObjectCommand({
          Bucket: this.config.options.bucket,
          Key: key,
          Body: buffer,
          ContentType:
            response.headers.get("content-type") || "application/octet-stream",
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

    directory: async (input: DirectoryInput): Promise<UploadResult> => {
      try {
        // Check if using 4everland endpoint
        if (this.config.options.endpoint.includes("4everland")) {
          throw new Error(
            "Directory uploads via CAR files are not supported with 4everland endpoints."
          );
        }

        let entries: { path: string; content: Buffer | Uint8Array }[] = [];

        if ("files" in input) {
          // Handle browser files
          for (const file of input.files) {
            const buffer = await file.arrayBuffer();
            entries.push({
              path: `${file.name}`,
              content: new Uint8Array(buffer),
            });
          }
        } else {
          if (typeof window !== "undefined") {
            throw new Error(
              "Directory path uploads are only supported in Node.js environments"
            );
          }
          // Handle Node.js directory path
          for await (const file of globSource(
            input.dirPath,
            input.pattern ?? "**/*"
          )) {
            if (file.content) {
              const chunks = await all(file.content);
              entries.push({
                path: `${file.path}`,
                content: Buffer.concat(chunks),
              });
            }
          }
        }

        if (entries.length === 0) {
          throw new Error(
            "dirPath" in input
              ? `No files found in directory: ${input.dirPath}`
              : "No files were processed"
          );
        }

        return this.uploadDirectory(
          entries,
          "dirPath" in input ? input.dirPath.split("/").pop() : input.dirName
        );
      } catch (error) {
        if (
          error instanceof Error &&
          "dirPath" in input &&
          error.message.includes("ENOENT")
        ) {
          throw new Error(`Directory not found: ${input.dirPath}`);
        }
        return createErrorResult<UploadResult>(error);
      }
    },
  };
}
