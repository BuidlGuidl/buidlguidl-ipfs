import { S3Client } from "@bradenmacdonald/s3-lite-client";
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

type FileLike = {
  name: string;
  path?: string;
  // stream should return a ReadableStream as expected by ipfs-car
  stream: () => ReadableStream<Uint8Array>;
};

// Add type for custom metadata
interface CustomMetadata {
  [key: `x-amz-meta-${string}`]: string;
  "ipfs-hash"?: string; // 4EVERLAND
  cid?: string; // Filebase
}

export class S3Uploader implements BaseUploader {
  private client: S3Client;
  private config: S3UploaderConfig;

  constructor(config: S3Config) {
    this.config = {
      options: "id" in config ? config.options : (config as S3Options),
      id: "id" in config ? config.id : undefined,
    };

    this.client = new S3Client({
      endPoint: this.config.options.endpoint.replace(/^https?:\/\//, ""),
      region: this.config.options.region || "us-east-1",
      accessKey: this.config.options.accessKeyId,
      secretKey: this.config.options.secretAccessKey,
      pathStyle: true,
      bucket: this.config.options.bucket,
    });
  }

  get id(): string {
    return this.config.id ?? this.config.options.endpoint;
  }

  private async getCidFromMetadata(key: string): Promise<string> {
    try {
      const response = await this.client.statObject(key);
      const metadata = response.metadata as CustomMetadata;

      // Try both metadata formats
      const cidStr =
        metadata["ipfs-hash"] || // 4EVERLAND
        metadata["x-amz-meta-ipfs-hash"] || // 4EVERLAND alternative
        metadata["cid"] || // Filebase
        metadata["x-amz-meta-cid"]; // Filebase alternative

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

      // Upload CAR file with proper metadata
      const key = rootName || rootCID.toString();

      await this.client.putObject(key, carContent, {
        metadata: {
          "x-amz-meta-import": "car",
        },
      });

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
        let body: Buffer | Uint8Array | string | ReadableStream<Uint8Array>;

        if (input instanceof File) {
          key = input.name;
          body = input.stream(); // Convert File to ReadableStream
        } else if (typeof window === "undefined") {
          const { readFile } = await import("fs/promises");
          body = await readFile(input);
          key = input.split("/").pop() || "file";
        } else {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        await this.client.putObject(key, body);
        const cid = await this.getCidFromMetadata(key);

        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    text: async (content: string): Promise<UploadResult> => {
      try {
        const key = `text-${Date.now()}.txt`;
        await this.client.putObject(key, content, {
          metadata: {
            "x-amz-meta-content-type": "text/plain",
            "x-amz-meta-import": "car",
          },
        });

        const cid = await this.getCidFromMetadata(key);
        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async (content: any): Promise<UploadResult> => {
      try {
        const key = `json-${Date.now()}.json`;
        await this.client.putObject(key, JSON.stringify(content), {
          metadata: {
            "x-amz-meta-content-type": "application/json",
            "x-amz-meta-import": "car",
          },
        });

        const cid = await this.getCidFromMetadata(key);
        return { success: true, cid };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    url: async (url: string): Promise<UploadResult> => {
      try {
        const parsedUrl = new URL(url);
        const filename = parsedUrl.pathname.split("/").pop() || "download";
        const key = `url-${Date.now()}-${filename}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download from URL: ${response.statusText}`
          );
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await this.client.putObject(key, buffer, {
          metadata: {
            "x-amz-meta-content-type":
              response.headers.get("content-type") ||
              "application/octet-stream",
            "x-amz-meta-import": "car",
          },
        });

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
  };
}
