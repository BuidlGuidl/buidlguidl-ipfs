import {
  BaseUploader,
  UploadResult,
  S3UploaderConfig,
  S3Config,
  S3Options,
  DirectoryInput,
  JsonValue,
} from "./types.js";
import { createErrorResult } from "./utils.js";
import { globSource } from "kubo-rpc-client";
import { createDirectoryEncoderStream, CAREncoderStream } from "ipfs-car";
import { createPresignedUrl, uploadCar } from "@stauro/filebase-upload";
import { CID } from "multiformats/cid";
import { CarWriter } from "@ipld/car/writer";
import { createWriteStream } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";

type FileLike = {
  name: string;
  path?: string;
  // stream should return a ReadableStream as expected by ipfs-car
  stream: () => ReadableStream<Uint8Array>;
};

export class S3Uploader implements BaseUploader {
  private config: S3UploaderConfig;

  constructor(config: S3Config) {
    this.config = {
      options: "id" in config ? config.options : (config as S3Options),
      id: "id" in config ? config.id : undefined,
    };
  }

  get id(): string {
    return this.config.id ?? this.config.options.endpoint;
  }

  private getToken(): string {
    return Buffer.from(
      `${this.config.options.accessKeyId}:${this.config.options.secretAccessKey}`
    ).toString("base64");
  }

  private async uploadFile(file: File): Promise<UploadResult> {
    const url = await createPresignedUrl({
      bucketName: this.config.options.bucket,
      token: this.getToken(),
      file,
    });

    const response = await fetch(decodeURIComponent(url), {
      method: "PUT",
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    // Check multiple possible locations for the CID
    const cid =
      response.headers.get("x-amz-meta-cid") || // Filebase standard
      response.headers.get("x-amz-meta-ipfs-hash") || // 4EVERLAND
      response.headers.get("x-amz-meta-cid") || // Filebase alternative
      response.headers.get("cid"); // Generic

    if (!cid) {
      throw new Error("Failed to get CID from Filebase response");
    }

    return { success: true, cid };
  }

  private async uploadDirectory(
    files: FileLike[],
    rootName?: string
  ): Promise<UploadResult> {
    const tmp = tmpdir();
    const output = `${tmp}/${rootName || "directory"}.car`;

    const placeholderCID = CID.parse(
      "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    );
    let rootCID = placeholderCID;

    await createDirectoryEncoderStream(files)
      .pipeThrough(
        new TransformStream({
          transform(block, controller) {
            rootCID = block.cid as CID;
            controller.enqueue(block);
          },
        })
      )
      .pipeThrough(new CAREncoderStream([placeholderCID]))
      .pipeTo(Writable.toWeb(createWriteStream(output)));

    const fd = await open(output, "r+");
    await CarWriter.updateRootsInFile(fd, [rootCID]);
    await fd.close();

    const fileContent = await readFile(output);
    const file = new File([fileContent], "directory.car", {
      type: "application/vnd.ipld.car",
    });

    const response = await uploadCar({
      bucketName: this.config.options.bucket,
      token: this.getToken(),
      file,
    });

    // Check multiple possible locations for the CID
    const cid =
      response.headers.get("x-amz-meta-cid") || // Filebase standard
      response.headers.get("x-amz-meta-ipfs-hash") || // 4EVERLAND
      response.headers.get("x-amz-meta-cid") || // Filebase alternative
      response.headers.get("cid"); // Generic

    if (!cid) {
      throw new Error("Failed to get CID from Filebase response");
    }

    return { success: true, cid };
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      try {
        let file: File;
        if (input instanceof File) {
          file = input;
        } else if (typeof window === "undefined") {
          const { readFile } = await import("fs/promises");
          const content = await readFile(input);
          file = new File([content], input.split("/").pop() || "file");
        } else {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        return this.uploadFile(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    text: async (content: string): Promise<UploadResult> => {
      try {
        const file = new File([content], `text-${Date.now()}.txt`, {
          type: "text/plain",
        });
        return this.uploadFile(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async <T extends JsonValue>(content: T): Promise<UploadResult> => {
      try {
        const file = new File(
          [JSON.stringify(content)],
          `json-${Date.now()}.json`,
          {
            type: "application/json",
          }
        );
        return this.uploadFile(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    url: async (url: string): Promise<UploadResult> => {
      try {
        // Validate URL
        try {
          new URL(url);
        } catch (error) {
          return createErrorResult<UploadResult>(
            new Error("Invalid URL provided")
          );
        }

        const filename = url.split("/").pop() || "download";

        // Download the file
        const response = await fetch(url);
        if (!response.ok) {
          return createErrorResult<UploadResult>(
            new Error(`Failed to download from URL: ${response.statusText}`)
          );
        }

        const blob = await response.blob();
        const file = new File([blob], `url-${Date.now()}-${filename}`, {
          type:
            response.headers.get("content-type") || "application/octet-stream",
        });

        return this.uploadFile(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    directory: async (input: DirectoryInput): Promise<UploadResult> => {
      try {
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
        const file = new File([content], `buffer-${Date.now()}`, {
          type: "application/octet-stream",
        });
        return this.uploadFile(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },
  };
}
