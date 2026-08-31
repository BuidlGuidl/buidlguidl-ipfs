import { CID } from "multiformats/cid";
import { create, KuboRPCClient, globSource, urlSource } from "kubo-rpc-client";
// import * as jsonCodec from "multiformats/codecs/json";
import {
  KuboOptions,
  UploadResult,
  NodeUploaderConfig,
  NodeConfig,
  DirectoryInput,
  JsonValue,
} from "./types.js";
import { BaseUploader } from "./types.js";
import { createErrorResult } from "./utils.js";
import {
  formatPaymentDetails,
  isPaymentRequiredError,
  normalizeHeaders,
  parsePaymentChallenge,
  payForChallenge,
} from "./payment.js";

export class NodeUploader implements BaseUploader {
  private rpcClient: KuboRPCClient;
  private config: NodeUploaderConfig;

  constructor(config: NodeConfig) {
    if ("options" in config) {
      this.config = {
        options: config.options,
        id: config.id,
        cidVersion: config.cidVersion ?? 1,
        payment: config.payment,
      };
    } else {
      const { payment, ...options } = config;
      this.config = { options: options as KuboOptions, cidVersion: 1, payment };
    }
    this.rpcClient = create(this.config.options);
  }

  get id(): string {
    return this.config.id ?? this.rpcClient.getEndpointConfig().host;
  }

  /**
   * Runs an upload operation, reacting to a 402: the challenge on the 402
   * response is paid (within `maxAmount`) and the operation retried once with
   * the credential attached. `operation` is invoked at most twice and must
   * build any single-use body source (streams, generators) freshly per call.
   * A 402 that could not be paid comes back with `paymentRequired` details.
   */
  private async upload(
    operation: (client: KuboRPCClient) => Promise<CID>
  ): Promise<UploadResult> {
    try {
      const cid = await operation(this.rpcClient);
      return { success: true, cid: cid.toString() };
    } catch (error) {
      if (!this.config.payment || !isPaymentRequiredError(error)) {
        return this.errorResult(error);
      }

      try {
        const credential = await payForChallenge(
          error.response,
          this.config.payment
        );
        const paidClient = create({
          ...this.config.options,
          headers: {
            ...normalizeHeaders(this.config.options.headers),
            ...credential.headers,
          },
        });
        const cid = await operation(paidClient);
        return {
          success: true,
          cid: cid.toString(),
          payment: credential.details,
        };
      } catch (retryError) {
        return this.errorResult(retryError);
      }
    }
  }

  private async errorResult(error: unknown): Promise<UploadResult> {
    if (!isPaymentRequiredError(error)) {
      return createErrorResult<UploadResult>(error);
    }
    const paymentRequired = await parsePaymentChallenge(error.response);
    const price = paymentRequired
      ? ` (${formatPaymentDetails(paymentRequired)} per upload)`
      : "";
    const hint = this.config.payment
      ? "the configured payment was not accepted"
      : "configure payment options or use an API key";
    return {
      success: false,
      cid: "",
      error: `Payment required${price}: ${hint}`,
      ...(paymentRequired && { paymentRequired }),
    };
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      if (input instanceof File) {
        return this.upload(async (client) => {
          const add = await client.add(
            { path: input.name, content: input },
            { cidVersion: this.config.cidVersion }
          );
          return add.cid;
        });
      }
      if (typeof window !== "undefined") {
        return createErrorResult<UploadResult>(
          new Error("File path strings are only supported in Node.js environments")
        );
      }
      // Stream directly from file system to IPFS with filename
      const { createReadStream } = await import("fs");
      const { basename } = await import("path");
      const filename = basename(input);
      return this.upload(async (client) => {
        // Pass filename and stream to preserve metadata. The stream is opened
        // per attempt: a 402 retry cannot reuse a consumed stream.
        const add = await client.add(
          { path: filename, content: createReadStream(input) },
          { cidVersion: this.config.cidVersion }
        );
        return add.cid;
      });
    },

    text: async (content: string): Promise<UploadResult> =>
      this.upload(async (client) => {
        const add = await client.add(content, {
          cidVersion: this.config.cidVersion,
        });
        return add.cid;
      }),

    json: async <T extends JsonValue>(content: T): Promise<UploadResult> =>
      this.upload(async (client) => {
        const add = await client.add(JSON.stringify(content), {
          cidVersion: this.config.cidVersion,
        });
        return add.cid;
      }),

    directory: async (input: DirectoryInput): Promise<UploadResult> => {
      // Sources are single-use, so build one per upload attempt.
      let makeSource: () =>
        | ReturnType<typeof globSource>
        | AsyncGenerator<{ path: string; content: Uint8Array }>;
      if ("files" in input) {
        // Check for empty files array
        if (!input.files.length) {
          return createErrorResult<UploadResult>(
            new Error("No files provided for upload")
          );
        }
        // Convert browser Files to format expected by addAll
        makeSource = async function* () {
          for (const file of input.files) {
            const buffer = await file.arrayBuffer();
            yield {
              path: file.name,
              content: new Uint8Array(buffer),
            };
          }
        };
      } else {
        if (typeof window !== "undefined") {
          return createErrorResult<UploadResult>(
            new Error(
              "Directory path uploads are only supported in Node.js environments"
            )
          );
        }
        makeSource = () => globSource(input.dirPath, input.pattern ?? "**/*");
      }

      const result = await this.upload(async (client) => {
        const source = makeSource();
        let rootCid: CID | undefined;
        for await (const file of client.addAll(source, {
          wrapWithDirectory: true,
          cidVersion: this.config.cidVersion,
        })) {
          rootCid = file.cid;
        }
        if (!rootCid) {
          throw new Error(
            "dirPath" in input
              ? `Directory upload failed for ${input.dirPath}`
              : "Directory upload failed"
          );
        }
        return rootCid;
      });

      if (
        !result.success &&
        "dirPath" in input &&
        result.error?.includes("ENOENT")
      ) {
        throw new Error(`Directory not found: ${input.dirPath}`);
      }
      return result;
    },

    url: async (url: string): Promise<UploadResult> => {
      try {
        new URL(url);
      } catch (error) {
        return createErrorResult<UploadResult>(new Error("Invalid URL provided"));
      }
      return this.upload(async (client) => {
        const add = await client.add(urlSource(url), {
          cidVersion: this.config.cidVersion,
        });
        return add.cid;
      });
    },

    buffer: async (content: Buffer | Uint8Array): Promise<UploadResult> =>
      this.upload(async (client) => {
        const add = await client.add(content, {
          cidVersion: this.config.cidVersion,
        });
        return add.cid;
      }),
  };
}
