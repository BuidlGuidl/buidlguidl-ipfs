import {
  BaseUploader,
  UploadResult,
  GlobSourceFile,
  MultiNodeUploadResult,
  NodeUploadResult,
} from "./types.js";

export class MultiUploader implements BaseUploader<MultiNodeUploadResult> {
  private uploaders: Map<string, BaseUploader<UploadResult>>;

  constructor(uploaders: BaseUploader<UploadResult>[]) {
    if (!uploaders.length) {
      throw new Error("At least one uploader is required");
    }
    this.uploaders = new Map(
      uploaders.map((uploader) => [uploader.id, uploader])
    );
  }

  get id(): string {
    return "multi"; // Or maybe concatenate child IDs?
  }

  add = {
    file: async (input: File | string): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.file(input);
              results.set(uploaderId, { success: true, cid: result.cid });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    text: async (content: string): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.text(content);
              results.set(uploaderId, { success: true, cid: result.cid });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    json: async (content: any): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.json(content);
              results.set(uploaderId, { success: true, cid: result.cid });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    directory: async (
      path: string,
      pattern: string = "**/*"
    ): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.directory(path, pattern);
              results.set(uploaderId, { success: true, cid: result.cid });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    files: async (files: File[]): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.files(files);
              results.set(uploaderId, {
                success: true,
                cid: result.cid,
              });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    globFiles: async (
      files: GlobSourceFile[]
    ): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.globFiles(files);
              results.set(uploaderId, {
                success: true,
                cid: result.cid,
              });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },

    url: async (url: string): Promise<MultiNodeUploadResult> => {
      const results = new Map<string, NodeUploadResult>();

      await Promise.all(
        Array.from(this.uploaders.entries()).map(
          async ([uploaderId, uploader]) => {
            try {
              const result = await uploader.add.url(url);
              results.set(uploaderId, { success: true, cid: result.cid });
            } catch (error) {
              results.set(uploaderId, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        )
      );

      const successResults = Array.from(results.values()).filter(
        (r) => r.success
      );
      const successCount = successResults.length;
      return {
        success: successCount > 0,
        allNodesSucceeded: successCount === this.uploaders.size,
        cid: successResults[0]?.cid ?? "",
        results,
      };
    },
  };
}
