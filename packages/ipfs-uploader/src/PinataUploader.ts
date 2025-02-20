import {
  BaseUploader,
  UploadResult,
  PinataUploaderConfig,
  PinataConfig,
  DirectoryInput,
  JsonValue,
} from "./types.js";
import { createErrorResult } from "./utils.js";

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
        if (typeof window === "undefined") {
          const { handleNodeFileUpload } = await import(
            "./PinataUploader/server.js"
          );
          return handleNodeFileUpload(input, this.config.options.jwt);
        }

        if (!(input instanceof File)) {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        const formData = new FormData();
        formData.append("file", input);
        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
            },
            body: formData,
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

    json: async <T extends JsonValue>(content: T): Promise<UploadResult> => {
      try {
        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinJSONToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              pinataOptions: {
                cidVersion: 1,
              },
              pinataContent: content,
            }),
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
        if (typeof window === "undefined") {
          const { handleNodeDirectoryUpload } = await import(
            "./PinataUploader/server.js"
          );
          return handleNodeDirectoryUpload(input, this.config.options.jwt);
        }

        if (!("files" in input)) {
          throw new Error(
            "Directory path uploads are only supported in Node.js environments"
          );
        }

        const formData = new FormData();
        for (const file of input.files) {
          formData.append("file", file, `${input.dirName}/${file.name}`);
        }

        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        const response = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
            },
            body: formData,
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

    url: async (url: string): Promise<UploadResult> => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download from URL: ${response.statusText}`
          );
        }

        const blob = await response.blob();
        const filename = url.split("/").pop() || "url_upload";
        const file = new File([blob], filename);
        return this.add.file(file);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Invalid URL")) {
          throw new Error("Invalid URL provided");
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