import {
  BaseUploader,
  NodeUploadResult,
  UploadResult,
  BaseUploadResult,
  FileArrayResult,
  DirectoryInput,
  JsonValue,
} from "./types.js";

export class MultiUploader implements BaseUploader {
  private uploaders: Map<string, BaseUploader>;

  constructor(uploaders: BaseUploader[]) {
    if (!uploaders.length) {
      throw new Error("At least one uploader is required");
    }
    this.uploaders = new Map(
      uploaders.map((uploader) => [uploader.id, uploader])
    );
  }

  get id(): string {
    return "multi";
  }

  private async executeMultiUpload<T extends BaseUploadResult>(
    operation: (uploader: BaseUploader) => Promise<T>
  ): Promise<UploadResult> {
    const results: Array<[string, NodeUploadResult]> = [];

    await Promise.all(
      Array.from(this.uploaders.entries()).map(
        async ([uploaderId, uploader]) => {
          const result = await operation(uploader);
          results.push([uploaderId, result]);
        }
      )
    );

    const successResults = results
      .map(([_, result]) => result)
      .filter((r) => r.success);
    const successCount = successResults.length;
    const totalNodes = this.uploaders.size;

    return {
      success: successCount > 0,
      successCount,
      errorCount: totalNodes - successCount,
      totalNodes,
      allNodesSucceeded: successCount === totalNodes,
      cid: successResults[0]?.cid ?? "",
      results,
    };
  }

  add = {
    file: (input: File | string) =>
      this.executeMultiUpload((u) => u.add.file(input)),
    text: (content: string) =>
      this.executeMultiUpload((u) => u.add.text(content)),
    json: <T extends JsonValue>(content: T) =>
      this.executeMultiUpload((u) => u.add.json(content)),
    directory: (input: DirectoryInput) =>
      this.executeMultiUpload((u) => u.add.directory(input)),
    url: (url: string) => this.executeMultiUpload((u) => u.add.url(url)),
    buffer: (content: Buffer | Uint8Array) =>
      this.executeMultiUpload((u) => u.add.buffer(content)),
  };
}

/**
 * Type guard to check if a result contains a files array
 * @param result - The upload result to check
 * @returns True if the result is a FileArrayResult
 */
function hasFiles(result: BaseUploadResult): result is FileArrayResult {
  return "files" in result;
}
