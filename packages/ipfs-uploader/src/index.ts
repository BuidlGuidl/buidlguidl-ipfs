import { Options as KuboOptions } from "kubo-rpc-client";
import { NodeUploader } from "./NodeUploader.js";
import { PinataUploader } from "./PinataUploader.js";
import { MultiUploader } from "./MultiUploader.js";
import {
  BaseUploader,
  UploadResult,
  MultiNodeUploadResult,
  NodeConfig,
  PinataConfig,
  UploaderConfig,
} from "./types.js";

export { KuboOptions };
export * from "./types.js";
export { NodeUploader } from "./NodeUploader.js";
export { PinataUploader } from "./PinataUploader.js";
export { MultiUploader } from "./MultiUploader.js";

export function createUploader(
  config: UploaderConfig | UploaderConfig[]
): BaseUploader<UploadResult> | BaseUploader<MultiNodeUploadResult> {
  if (Array.isArray(config)) {
    const uploaders = config.map((c) =>
      "jwt" in (c as any).options || "jwt" in c
        ? new PinataUploader(c as PinataConfig)
        : new NodeUploader(c as NodeConfig)
    );
    return new MultiUploader(uploaders);
  }

  if ("jwt" in (config as any).options || "jwt" in config) {
    return new PinataUploader(config as PinataConfig);
  }
  return new NodeUploader(config as NodeConfig);
}
