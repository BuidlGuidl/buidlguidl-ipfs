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
          const { createReadStream } = await import("fs");
          const stream = createReadStream(input);
          const filename = input.split("/").pop() || "file";
          formData.append("file", stream);
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

        // Create a single async generator for both sources
        const source = input.files?.length
          ? (async function* () {
              for (const file of input.files!) {
                yield file;
              }
            })()
          : typeof window !== "undefined"
            ? (() => {
                throw new Error(
                  "Directory path uploads are only supported in Node.js environments"
                );
              })()
            : globSource(input.dirPath, input.pattern ?? "**/*");

        // Process files from either source
        for await (const file of source) {
          if (file.content) {
            formData.append("file", file.content, {
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