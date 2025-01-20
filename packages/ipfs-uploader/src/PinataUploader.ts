import {
  BaseUploader,
  UploadResult,
  FileArrayResult,
  PinataUploaderConfig,
  PinataConfig,
  DirectoryInput,
} from "./types.js";
import { createErrorResult } from "./utils.js";
import { globSource } from "kubo-rpc-client";
import FormData from "form-data";

export class PinataUploader implements BaseUploader {
  private config: PinataUploaderConfig;

  constructor(config: PinataConfig) {
    this.config = {
      options: "jwt" in config ? config : config.options,
      id: "id" in config ? config.id : undefined,
    };
  }

  get id(): string {
    return (
      this.config.id ??
      this.config.options.gateway ??
      "https://gateway.pinata.cloud"
    );
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      try {
        const formData = new FormData();
        if (input instanceof File) {
          formData.append("file", input);
        } else if (typeof window === "undefined") {
          const { readFile } = await import("fs/promises");
          const buffer = await readFile(input);
          const filename = input.split("/").pop() || "file";
          const file = new File([buffer], filename);
          formData.append("file", file);
        } else {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        const formBuffer = formData.getBuffer();
        const formHeaders = formData.getHeaders();
        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
              ...formHeaders,
            },
            body: formBuffer,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload to Pinata: ${response.statusText}`);
        }

        const result = await response.json();
        return { success: true, cid: result.IpfsHash };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async (content: any): Promise<UploadResult> => {
      try {
        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinJSONToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(content),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to upload JSON to Pinata: ${response.statusText}`
          );
        }

        const result = await response.json();
        return { success: true, cid: result.IpfsHash };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    // Methods that aren't supported natively by Pinata
    text: async (content: string): Promise<UploadResult> => {
      try {
        const file = new File([content], "text.txt", { type: "text/plain" });
        return this.add.file(file);
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    directory: async (input: DirectoryInput): Promise<UploadResult> => {
      try {
        const dirName = input.dirPath.split("/").pop();
        const formData = new FormData();

        let source: AsyncIterable<{ path: string; content: any }>;
        if (input.files?.length) {
          source = (async function* () {
            for (const file of input.files!) {
              yield file;
            }
          })();
        } else {
          if (typeof window !== "undefined") {
            throw new Error(
              "Directory path uploads are only supported in Node.js environments"
            );
          }
          source = globSource(input.dirPath, input.pattern ?? "**/*");
        }

        // Process files from either source
        for await (const file of source) {
          if (file.content) {
            let content: Buffer;
            if (Buffer.isBuffer(file.content)) {
              content = file.content;
            } else if (file.content instanceof Uint8Array) {
              content = Buffer.from(file.content);
            } else {
              // Handle async iterator from globSource
              const chunks = [];
              for await (const chunk of file.content) {
                chunks.push(chunk);
              }
              content = Buffer.concat(chunks);
            }
            formData.append("file", content, {
              filepath: `${dirName}${file.path}`,
            });
          }
        }

        const formBuffer = formData.getBuffer();
        const formHeaders = formData.getHeaders();

        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
              ...formHeaders,
            },
            body: formBuffer,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload to Pinata: ${response.statusText}`);
        }

        const result = await response.json();
        return { success: true, cid: result.IpfsHash };
      } catch (error) {
        if (
          error instanceof Error &&
          input.dirPath &&
          error.message.includes("ENOENT")
        ) {
          throw new Error(`Directory not found: ${input.dirPath}`);
        }
        return createErrorResult<UploadResult>(error);
      }
    },

    url: async (url: string): Promise<UploadResult> => {
      return createErrorResult<UploadResult>(
        "URL uploads are not supported in PinataUploader - please download the file first"
      );
    },
  };
}