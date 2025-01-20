import {
  BaseUploader,
  UploadResult,
  FileArrayResult,
  PinataUploaderConfig,
  PinataConfig,
} from "./types.js";

export class PinataUploader implements BaseUploader<UploadResult> {
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
      const formData = new FormData();
      if (input instanceof File) {
        formData.append("file", input);
      } else {
        throw new Error(
          "File path strings are not supported in PinataUploader - please provide a File object"
        );
      }

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
      return { cid: result.IpfsHash };
    },

    json: async (content: any): Promise<UploadResult> => {
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
      return { cid: result.IpfsHash };
    },

    // Methods that aren't supported natively by Pinata
    text: async (content: string): Promise<UploadResult> => {
      // We can implement this using file upload
      const file = new File([content], "text.txt", { type: "text/plain" });
      return this.add.file(file);
    },

    directory: async (): Promise<UploadResult> => {
      throw new Error("Directory uploads are not supported in PinataUploader");
    },

    files: async (files: File[]): Promise<FileArrayResult> => {
      if (files.length === 0) {
        throw new Error("No files provided");
      }

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("file", file);
      });

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
          `Failed to upload files to Pinata: ${response.statusText}`
        );
      }

      const result = await response.json();
      return {
        cid: result.IpfsHash,
        files: files.map((f) => ({ name: f.name, cid: result.IpfsHash })),
      };
    },

    globFiles: async (): Promise<FileArrayResult> => {
      throw new Error("GlobFiles are not supported in PinataUploader");
    },

    url: async (url: string): Promise<UploadResult> => {
      throw new Error(
        "URL uploads are not supported in PinataUploader - please download the file first"
      );
    },
  };
}
