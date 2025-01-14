import { Helia, createHelia, libp2pDefaults } from "helia";
import { heliaWithRemotePins } from "@helia/remote-pinning";
import { CID } from "multiformats/cid";
import { create, KuboRPCClient, globSource } from "kubo-rpc-client";
import * as jsonCodec from "multiformats/codecs/json";

export interface IpfsPinnerConfig {
  endpointUrl?: string;
  accessToken?: string;
}

export interface UploadResult {
  cid: string;
  status: "pinned" | "failed";
}

export interface FileArrayResult extends UploadResult {
  files: { name: string; cid: string }[];
}

export interface GlobSourceFile {
  path: string;
  content: string | Uint8Array | Buffer;
}

export class IpfsPinner {
  private helia!: Helia;
  private rpcClient!: KuboRPCClient;
  private config: Required<IpfsPinnerConfig>;

  constructor(config?: IpfsPinnerConfig) {
    this.config = {
      endpointUrl: config?.endpointUrl ?? "http://127.0.0.1:9097",
      accessToken:
        config?.accessToken ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyIn0.X9ko6ogtJ0Yi7EQDpOU7E7i4aNBSTh-rJL5nCYnkm20",
    };
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      await this.initialize();

      let content: Uint8Array;
      if (input instanceof File) {
        const buffer = await input.arrayBuffer();
        content = new Uint8Array(buffer);
      } else if (typeof window === "undefined") {
        // Only try to use fs in Node.js environment
        const { readFile } = await import("fs/promises");
        const buffer = await readFile(input);
        content = new Uint8Array(buffer);
      } else {
        throw new Error(
          "File path strings are only supported in Node.js environments"
        );
      }

      const add = await this.rpcClient.add(content, {
        cidVersion: 1,
      });
      const status = await this.pinCid(add.cid);
      return { cid: add.cid.toString(), status };
    },

    text: async (content: string): Promise<UploadResult> => {
      await this.initialize();
      const add = await this.rpcClient.add(content, {
        cidVersion: 1,
      });
      const status = await this.pinCid(add.cid);
      return { cid: add.cid.toString(), status };
    },

    json: async (content: any): Promise<UploadResult> => {
      await this.initialize();
      const buf = jsonCodec.encode(content);
      const add = await this.rpcClient.add(buf, {
        cidVersion: 1,
      });

      const status = await this.pinCid(add.cid);
      return { cid: add.cid.toString(), status };
    },

    directory: async (
      path: string,
      pattern: string = "**/*"
    ): Promise<UploadResult> => {
      await this.initialize();

      if (typeof window !== "undefined") {
        throw new Error(
          "Directory uploads are only supported in Node.js environments"
        );
      }

      try {
        let rootCid: CID | undefined;
        for await (const file of this.rpcClient.addAll(
          globSource(path, pattern),
          {
            wrapWithDirectory: true,
            cidVersion: 1,
          }
        )) {
          console.log(file);
          rootCid = file.cid;
        }
        if (!rootCid) {
          throw new Error("No root CID found");
        }
        const status = await this.pinCid(rootCid);
        return { cid: rootCid.toString(), status };
      } catch (error) {
        console.error(error);
        throw new Error(`Failed to add directory: ${error}`);
      }
    },

    files: async (files: File[]): Promise<FileArrayResult> => {
      await this.initialize();

      try {
        let root: CID | undefined;

        const fileResults: { name: string; cid: CID }[] = [];

        for await (const file of this.rpcClient.addAll(
          files.map((file) => ({ path: file.name, content: file })),
          {
            cidVersion: 1,
            wrapWithDirectory: true,
          }
        )) {
          console.log("file to Kubo", file);
          fileResults.push({ name: file.path, cid: file.cid });
          root = file.cid;
        }
        if (!root) {
          throw new Error("No root CID found");
        }
        console.log("rootCid", root.toString());

        const status = await this.pinCid(root);
        return {
          cid: root.toString(),
          status,
          files: fileResults.map((f) => ({
            name: f.name,
            cid: f.cid.toString(),
          })),
        };
      } catch (error) {
        throw new Error(`Failed to process files: ${error}`);
      }
    },

    globFiles: async (files: GlobSourceFile[]): Promise<FileArrayResult> => {
      await this.initialize();

      try {
        let root: CID | undefined;
        const fileResults: { name: string; cid: CID }[] = [];

        for await (const file of this.rpcClient.addAll(files, {
          cidVersion: 1,
          wrapWithDirectory: true,
        })) {
          console.log("file to Kubo", file);
          fileResults.push({ name: file.path, cid: file.cid });
          root = file.cid;
        }

        if (!root) {
          throw new Error("No root CID found");
        }
        console.log("rootCid", root.toString());

        const status = await this.pinCid(root);
        return {
          cid: root.toString(),
          status,
          files: fileResults.map((f) => ({
            name: f.name,
            cid: f.cid.toString(),
          })),
        };
      } catch (error) {
        throw new Error(`Failed to process glob files: ${error}`);
      }
    },
  };

  async initialize() {
    if (this.helia) return;

    const libp2p = libp2pDefaults();
    libp2p.services = { ...libp2p.services };
    delete (libp2p.services as any).upnp;

    this.helia = heliaWithRemotePins(
      await createHelia({
        libp2p,
      }),
      {
        endpointUrl: this.config.endpointUrl,
        accessToken: this.config.accessToken,
      }
    );

    this.rpcClient = create();
  }

  private async pinCid(cid: CID): Promise<"pinned" | "failed"> {
    try {
      for await (const _ of this.helia.pins.add(cid, {
        signal: AbortSignal.timeout(30000),
      })) {
        // Generator needs to be consumed
      }
      return "pinned";
    } catch (error) {
      console.log("Pinning failed", error);
      return "failed";
    }
  }

  async stop() {
    if (this.helia) {
      await this.helia.stop();
    }
  }
}

export default IpfsPinner;
