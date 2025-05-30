import {
  BaseUploader,
  UploadResult,
  PinataUploaderConfig,
  PinataConfig,
  DirectoryInput,
  JsonValue,
  PinataOptions,
  PinataJwtOptions,
  PinataPresignedOptions,
} from "./types.js";
import { createErrorResult } from "./utils.js";

export class PinataUploader implements BaseUploader {
  private config: PinataUploaderConfig;

  constructor(config: PinataConfig) {
    const options = "options" in config ? config.options : config;
    this.config = {
      options,
      id: "id" in config ? config.id : undefined,
    };
  }

  private isJwtAuth(options: PinataOptions): options is PinataJwtOptions {
    return "jwt" in options;
  }

  private isPresignedUrlAuth(
    options: PinataOptions
  ): options is PinataPresignedOptions {
    return "signingEndpoint" in options;
  }

  private async getPresignedUrl(): Promise<string> {
    if (!this.isPresignedUrlAuth(this.config.options)) {
      throw new Error("Invalid authentication configuration");
    }

    const response = await fetch(this.config.options.signingEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  }

  private async uploadFile(
    formData: FormData,
    url: string,
    headers: Record<string, string> = {}
  ): Promise<UploadResult> {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to Pinata: ${response.statusText}`);
    }

    const result = await response.json();
    return { success: true, cid: result.IpfsHash };
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
          if (this.isJwtAuth(this.config.options)) {
            return handleNodeFileUpload(input, this.config.options.jwt);
          }
          throw new Error("Node.js file uploads require JWT authentication");
        }

        if (!(input instanceof File)) {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        const formData = new FormData();
        formData.append("file", input);
        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        if (this.isPresignedUrlAuth(this.config.options)) {
          const presignedUrl = await this.getPresignedUrl();
          return this.uploadFile(formData, presignedUrl);
        }

        // JWT authentication flow
        if (!this.isJwtAuth(this.config.options)) {
          throw new Error("Invalid authentication configuration");
        }

        return this.uploadFile(
          formData,
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          { Authorization: `Bearer ${this.config.options.jwt}` }
        );
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async <T extends JsonValue>(content: T): Promise<UploadResult> => {
      try {
        if (this.isPresignedUrlAuth(this.config.options)) {
          // For presigned URLs, convert JSON to a file and use the file upload method
          const jsonString = JSON.stringify(content);
          const file = new File([jsonString], "data.json", {
            type: "application/json",
          });
          return this.add.file(file);
        }

        // JWT authentication flow
        if (!this.isJwtAuth(this.config.options)) {
          throw new Error("Invalid authentication configuration");
        }

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
          if (this.isJwtAuth(this.config.options)) {
            return handleNodeDirectoryUpload(input, this.config.options.jwt);
          }
          throw new Error(
            "Node.js directory uploads require JWT authentication"
          );
        }

        if (!("files" in input)) {
          throw new Error(
            "Directory path uploads are only supported in Node.js environments"
          );
        }

        // For presigned URLs, we need to upload each file individually
        if (this.isPresignedUrlAuth(this.config.options)) {
          const results = await Promise.all(
            input.files.map(async (file) => {
              const presignedUrl = await this.getPresignedUrl();
              const formData = new FormData();
              formData.append("file", file, `${input.dirName}/${file.name}`);
              formData.append(
                "pinataOptions",
                JSON.stringify({ cidVersion: 1 })
              );

              const result = await this.uploadFile(formData, presignedUrl);
              return { name: file.name, cid: result.cid };
            })
          );

          // Return the first file's CID as the directory CID
          // Note: This is a simplification - in a real implementation, you might want to
          // create a directory structure and return that CID instead
          return {
            success: true,
            cid: results[0].cid,
            files: results,
          };
        }

        // JWT authentication flow
        if (!this.isJwtAuth(this.config.options)) {
          throw new Error("Invalid authentication configuration");
        }

        const formData = new FormData();
        for (const file of input.files) {
          formData.append("file", file, `${input.dirName}/${file.name}`);
        }

        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        return this.uploadFile(
          formData,
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          { Authorization: `Bearer ${this.config.options.jwt}` }
        );
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