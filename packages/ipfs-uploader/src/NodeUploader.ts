import { CID } from "multiformats/cid";
import { create, KuboRPCClient, globSource, urlSource } from "kubo-rpc-client";
import * as jsonCodec from "multiformats/codecs/json";
import {
  KuboOptions,
  UploadResult,
  FileArrayResult,
  GlobSourceFile,
  NodeUploaderConfig,
  NodeConfig,
} from "./types.js";
import { BaseUploader } from "./types.js";
import { createErrorResult } from "./utils.js";

export class NodeUploader implements BaseUploader {
  private rpcClient: KuboRPCClient;
  private config: NodeUploaderConfig;

  constructor(config: NodeConfig) {
    this.config = {
      options: "id" in config ? config.options : (config as KuboOptions),
      id: "id" in config ? config.id : undefined,
    };
    this.rpcClient = create(this.config.options);
  }

  get id(): string {
    return this.config.id ?? this.rpcClient.getEndpointConfig().host;
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      try {
        let content: Uint8Array;
        try {
          if (input instanceof File) {
            const buffer = await input.arrayBuffer();
            content = new Uint8Array(buffer);
          } else if (typeof window === "undefined") {
            const { readFile } = await import("fs/promises");
            const buffer = await readFile(input);
            content = new Uint8Array(buffer);
          } else {
            throw new Error(
              "File path strings are only supported in Node.js environments"
            );
          }
        } catch (error) {
          throw new Error(
            `Failed to read file content: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        const add = await this.rpcClient.add(content, {
          cidVersion: 1,
        });
        return { success: true, cid: add.cid.toString() };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    text: async (content: string): Promise<UploadResult> => {
      try {
        const add = await this.rpcClient.add(content, { cidVersion: 1 });
        return { success: true, cid: add.cid.toString() };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    json: async (content: any): Promise<UploadResult> => {
      try {
        let buf = jsonCodec.encode(content);
        const add = await this.rpcClient.add(buf, { cidVersion: 1 });
        return { success: true, cid: add.cid.toString() };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },

    directory: async (
      path: string,
      pattern: string = "**/*"
    ): Promise<UploadResult> => {
      try {
        if (typeof window !== "undefined") {
          throw new Error(
            "Directory uploads are only supported in Node.js environments"
          );
        }

        let rootCid: CID | undefined;
        for await (const file of this.rpcClient.addAll(
          globSource(path, pattern),
          {
            wrapWithDirectory: true,
            cidVersion: 1,
          }
        )) {
          rootCid = file.cid;
        }

        if (!rootCid) {
          throw new Error("No files found in directory or directory is empty");
        }
        return { success: true, cid: rootCid.toString() };
      } catch (error) {
        if (error instanceof Error && error.message.includes("ENOENT")) {
          throw new Error(`Directory not found: ${path}`);
        }
        return createErrorResult<UploadResult>(error);
      }
    },

    files: async (files: File[]): Promise<FileArrayResult> => {
      try {
        if (files.length === 0) {
          throw new Error("No files provided");
        }

        let root: CID | undefined;
        const fileResults: { name: string; cid: CID }[] = [];

        for await (const file of this.rpcClient.addAll(
          files.map((file) => ({ path: file.name, content: file })),
          {
            cidVersion: 1,
            wrapWithDirectory: true,
          }
        )) {
          fileResults.push({ name: file.path, cid: file.cid });
          root = file.cid;
        }

        if (!root) {
          throw new Error("Failed to process files: No root CID generated");
        }

        return {
          success: true,
          cid: root.toString(),
          files: fileResults.map((f) => ({
            name: f.name,
            cid: f.cid.toString(),
          })),
        };
      } catch (error) {
        return createErrorResult<FileArrayResult>(error, true);
      }
    },

    globFiles: async (files: GlobSourceFile[]): Promise<FileArrayResult> => {
      try {
        if (files.length === 0) {
          throw new Error("No files provided");
        }

        let root: CID | undefined;
        const fileResults: { name: string; cid: CID }[] = [];

        for await (const file of this.rpcClient.addAll(files, {
          cidVersion: 1,
          wrapWithDirectory: true,
        })) {
          fileResults.push({ name: file.path, cid: file.cid });
          root = file.cid;
        }

        if (!root) {
          throw new Error("Failed to process files: No root CID generated");
        }

        return {
          success: true,
          cid: root.toString(),
          files: fileResults.map((f) => ({
            name: f.name,
            cid: f.cid.toString(),
          })),
        };
      } catch (error) {
        return createErrorResult<FileArrayResult>(error);
      }
    },

    url: async (url: string): Promise<UploadResult> => {
      try {
        try {
          new URL(url);
        } catch (error) {
          throw new Error("Invalid URL provided");
        }

        const add = await this.rpcClient.add(urlSource(url), {
          cidVersion: 1,
        });
        return { success: true, cid: add.cid.toString() };
      } catch (error) {
        return createErrorResult<UploadResult>(error);
      }
    },
  };
}
