import {
  BaseUploader,
  UploadResult,
  PinataUploaderConfig,
  PinataConfig,
  DirectoryInput,
} from "./types.js";
import { createErrorResult } from "./utils.js";
import { globSource } from "kubo-rpc-client";
import NodeFormData from "form-data";

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
          // Node.js environment
          const formData = new NodeFormData();

          if (typeof input === "string") {
            // Handle file path
            const { createReadStream } = await import("fs");
            const stream = createReadStream(input);
            const filename = input.split("/").pop() || "file";
            formData.append("file", stream, filename);
          } else {
            // Handle File object - convert to stream for efficient upload
            const buffer = await input.arrayBuffer();
            const stream = require("stream");
            const readableStream = new stream.Readable();
            readableStream.push(Buffer.from(buffer));
            readableStream.push(null);
            formData.append("file", readableStream, input.name);
          }

          formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

          const { got } = await import("got");
          const response = await got.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
                ...formData.getHeaders(),
              },
              body: formData,
            }
          );

          const result = JSON.parse(response.body);
          return { success: true, cid: result.IpfsHash };
        } else {
          // Browser environment
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
            throw new Error(
              `Failed to upload to Pinata: ${response.statusText}`
            );
          }

          const result = await response.json();
          return { success: true, cid: result.IpfsHash };
        }
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
        if (typeof window === "undefined") {
          // Node.js environment
          const formData = new NodeFormData();

          if ("files" in input) {
            // Handle browser Files in Node.js - convert to streams
            for (const file of input.files) {
              const buffer = await file.arrayBuffer();
              const stream = require("stream");
              const readableStream = new stream.Readable();
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

          // Use got for streaming upload
          const { got } = await import("got");
          const response = await got.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
                ...formData.getHeaders(),
              },
              body: formData,
            }
          );

          const result = JSON.parse(response.body);
          return { success: true, cid: result.IpfsHash };
        } else {
          // Browser environment
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
            throw new Error(
              `Failed to upload to Pinata: ${response.statusText}`
            );
          }

          const result = await response.json();
          return { success: true, cid: result.IpfsHash };
        }
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

    url: async (url: string): Promise<UploadResult> => {
      try {
        // Download the file
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download from URL: ${response.statusText}`
          );
        }

        // Get content and create file
        const blob = await response.blob();
        const filename = url.split("/").pop() || "url_upload";
        const file = new File([blob], filename);

        // Create form data
        const formData = new FormData();
        formData.append("file", file);
        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        // Upload to Pinata
        const uploadResponse = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.options.jwt}`,
            },
            body: formData as unknown as BodyInit,
          }
        );

        if (!uploadResponse.ok) {
          throw new Error(
            `Failed to upload to Pinata: ${uploadResponse.statusText}`
          );
        }

        const result = await uploadResponse.json();
        return { success: true, cid: result.IpfsHash };
      } catch (error) {
        if (error instanceof Error && error.message.includes("Invalid URL")) {
          throw new Error("Invalid URL provided");
        }
        return createErrorResult<UploadResult>(error);
      }
    },
  };
}