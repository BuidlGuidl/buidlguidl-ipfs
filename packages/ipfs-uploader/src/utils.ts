import { BaseUploadResult, UploadResult, FileArrayResult } from "./types.js";

/**
 * Creates a standardized error result for upload operations
 * @param error - The error that occurred
 * @param includeFiles - Whether to include an empty files array (for FileArrayResult)
 * @returns A properly typed error result
 */
export function createErrorResult<T extends BaseUploadResult>(
  error: unknown,
  includeFiles = false
): T {
  const baseResult = {
    success: false,
    cid: "",
    error: error instanceof Error ? error.message : String(error),
  } as T;

  if (includeFiles) {
    (baseResult as any).files = [];
  }

  return baseResult;
}
