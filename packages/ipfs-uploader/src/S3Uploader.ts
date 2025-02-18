import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
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
import { createDirectoryEncoderStream, CAREncoderStream } from "ipfs-car";
import { Upload } from "@aws-sdk/lib-storage";

type FileLike = {
  name: string;
  path?: string;
  // stream should return a ReadableStream as expected by ipfs-car
  stream: () => ReadableStream<Uint8Array>;
};

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
    files: FileLike[],
    rootName?: string
  ): Promise<UploadResult> {
    try {
      let rootCID: any;
      const chunks: Uint8Array[] = [];

      await createDirectoryEncoderStream(files)
        .pipeThrough(
          new TransformStream({
            transform(block, controller) {
              rootCID = block.cid;
              controller.enqueue(block);
            },
          })
        )
        .pipeThrough(new CAREncoderStream())
        .pipeTo(
          new WritableStream({
            write(chunk) {
              chunks.push(chunk);
            },
          })
        );

      if (!rootCID) {
        throw new Error("Failed to generate root CID");
      }

      // Concatenate chunks into single buffer
      const carContent = Buffer.concat(chunks);

      // Use Upload instead of PutObjectCommand
      const key = rootName || rootCID.toString();
      const uploadParams = {
        client: this.client,
        params: {
          Bucket: this.config.options.bucket,
          Key: key,
          Body: carContent,
          Metadata: {
            import: "car",
          },
        },
        queueSize: 4, // Number of concurrent uploads
        partSize: 26843546, // 25.6MB chunk size
      };

      const parallelUpload = new Upload(uploadParams);

      // Optional: Add progress tracking
      parallelUpload.on("httpUploadProgress", (progress) => {
        // You could emit events here if needed
        console.debug("Upload progress:", progress);
      });

      await parallelUpload.done();
      const cid = await this.getCidFromMetadata(key);

      return { success: true, cid };
    } catch (error) {
      return createErrorResult<UploadResult>(error);
    }
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
        if (this.config.options.endpoint.includes("4everland")) {
          throw new Error(
            "Directory uploads via CAR files are not supported with 4everland endpoints."
          );
        }

        let files: FileLike[] = [];

        if ("files" in input) {
          // Convert browser File objects to ReadableStream
          files = input.files.map((file) => ({
            name: file.name,
            stream: () => file.stream(),
          }));
        } else {
          if (typeof window !== "undefined") {
            throw new Error(
              "Directory path uploads are only supported in Node.js environments"
            );
          }
          // Node.js path case stays the same since globSource already gives us the right format
          for await (const file of globSource(
            input.dirPath,
            input.pattern ?? "**/*"
          )) {
            if (file.content) {
              files.push({
                name: file.path,
                // Convert AsyncIterable to ReadableStream
                stream: () =>
                  new ReadableStream({
                    async start(controller) {
                      try {
                        for await (const chunk of file.content!) {
                          controller.enqueue(chunk);
                        }
                        controller.close();
                      } catch (error) {
                        controller.error(error);
                      }
                    },
                  }),
              });
            }
          }
        }

        if (files.length === 0) {
          throw new Error(
            "dirPath" in input
              ? `No files found in directory: ${input.dirPath}`
              : "No files were processed"
          );
        }

        return this.uploadDirectory(
          files,
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

    buffer: async (content: Buffer | Uint8Array): Promise<UploadResult> => {
      try {
        const blob = new Blob([content]);
        const file = new File([blob], `buffer-${Date.now()}`, {
          type: "application/octet-stream",
        });
        return this.add.file(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },
  };
}
