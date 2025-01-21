import {
  BaseUploader,
  UploadResult,
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
          formData.append("file", stream, filename);
        } else {
          throw new Error(
            "File path strings are only supported in Node.js environments"
          );
        }

        formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

        if (typeof window === "undefined") {
          // Use got for Node.js environment
          const { got } = await import("got");
          const response = await got
            .post("https://api.pinata.cloud/pinning/pinFileToIPFS", {
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
                ...formData.getHeaders(),
              },
              body: formData,
            })
            .on("uploadProgress", (progress) => {
              //   console.log(
              //     `Upload progress: ${Math.round(progress.percent * 100)}%`
              //   );
              //   if (progress.percent === 1) {
              //     console.log("Pinning to IPFS, please wait...");
              //   }
            });

          const result = JSON.parse(response.body);
          return { success: true, cid: result.IpfsHash };
        } else {
          // Browser environment
          const response = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
              },
              body: formData as unknown as BodyInit,
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
        const formData = new FormData();

        if ("files" in input) {
          // Browser path - files are already in memory
          for (const file of input.files) {
            formData.append("file", file, {
              filepath: `${input.dirName}/${file.name}`,
            });
          }

          formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

          // Use simple fetch for browser uploads
          const response = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
              },
              body: formData as unknown as BodyInit,
            }
          );

          if (!response.ok) {
            throw new Error(
              `Failed to upload to Pinata: ${response.statusText}`
            );
          }

          const result = await response.json();
          return { success: true, cid: result.IpfsHash };
        } else {
          // Node.js path - use streaming
          if (typeof window !== "undefined") {
            throw new Error(
              "Directory path uploads are only supported in Node.js environments"
            );
          }

          const dirName = input.dirPath.split("/").pop();
          const source = globSource(input.dirPath, input.pattern ?? "**/*");

          // Process files using streams
          for await (const file of source) {
            if (file.content) {
              formData.append("file", file.content, {
                filepath: `${dirName}${file.path}`,
              });
            }
          }

          formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

          // Use got for streaming upload
          const { got } = await import("got");
          const response = await got
            .post("https://api.pinata.cloud/pinning/pinFileToIPFS", {
              headers: {
                Authorization: `Bearer ${this.config.options.jwt}`,
                ...formData.getHeaders(),
              },
              body: formData,
            })
            .on("uploadProgress", (progress) => {
              //   console.log(
              //     `Upload progress: ${Math.round(progress.percent * 100)}%`
              //   );
              //   if (progress.percent === 1) {
              //     console.log("Pinning to IPFS, please wait...");
              //   }
            });

          const result = JSON.parse(response.body);
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
      return createErrorResult<UploadResult>(
        "URL uploads are not supported in PinataUploader - please download the file first"
      );
    },
  };
}