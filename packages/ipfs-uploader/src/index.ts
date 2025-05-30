import { NodeUploader } from "./NodeUploader.js";
import { PinataUploader } from "./PinataUploader.js";
import { S3Uploader } from "./S3Uploader.js";
import { MultiUploader } from "./MultiUploader.js";
import {
  BaseUploader,
  UploaderConfig,
  NodeConfig,
  PinataConfig,
  S3Config,
} from "./types.js";

export * from "./types.js";
export { NodeUploader } from "./NodeUploader.js";
export { PinataUploader } from "./PinataUploader.js";
export { S3Uploader } from "./S3Uploader.js";
export { MultiUploader } from "./MultiUploader.js";
export { createPresignedUrl } from "./utils/createPresignedUrl.js";

export function createUploader(
  config: UploaderConfig | UploaderConfig[]
): BaseUploader {
  const getOptions = (c: UploaderConfig) => ("options" in c ? c.options : c);

  if (Array.isArray(config)) {
    const uploaders = config.map((c) => {
      const options = getOptions(c);
      if ("jwt" in options || "signingEndpoint" in options) {
        return new PinataUploader(c as PinataConfig);
      } else if ("bucket" in options) {
        return new S3Uploader(c as S3Config);
      }
      return new NodeUploader(c as NodeConfig);
    });
    return new MultiUploader(uploaders);
  }

  const options = getOptions(config);
  if ("jwt" in options || "signingEndpoint" in options) {
    return new PinataUploader(config as PinataConfig);
  } else if ("bucket" in options) {
    return new S3Uploader(config as S3Config);
  }
  return new NodeUploader(config as NodeConfig);
}
