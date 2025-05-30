export interface SigningEndpointConfig {
  /** Pinata JWT token */
  jwt: string;
  /** Optional group ID to upload to */
  groupId?: string;
  /** How long the presigned URL should be valid for (in seconds) */
  expires?: number;
  /** Default filename to use if not provided in the request */
  defaultFilename?: string;
}

/**
 * Creates a presigned URL for uploading to Pinata.
 * This can be used to implement your own signing endpoint.
 *
 * @example
 * ```typescript
 * // Next.js API route
 * import { createPresignedUrl } from "@pinner/ipfs-uploader/utils";
 *
 * export async function GET(request: Request) {
 *   const filename = new URL(request.url).searchParams.get("filename") || "upload";
 *   const url = await createPresignedUrl({
 *     jwt: process.env.PINATA_JWT!,
 *     groupId: "my-group-id",
 *     expires: 30,
 *     defaultFilename: filename
 *   });
 *   return Response.json({ url });
 * }
 * ```
 */
export async function createPresignedUrl(
  config: SigningEndpointConfig & { filename?: string }
): Promise<string> {
  try {
    const filename = config.filename || config.defaultFilename || "upload";

    // Prepare payload data for request
    const data = JSON.stringify({
      network: "public",
      expires: config.expires || 30,
      filename,
      ...(config.groupId && { group_id: config.groupId }),
    });

    // Send request to Pinata
    const urlRequest = await fetch(
      "https://uploads.pinata.cloud/v3/files/sign",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.jwt}`,
        },
        body: data,
      }
    );

    if (!urlRequest.ok) {
      throw new Error(`Failed to get presigned URL: ${urlRequest.statusText}`);
    }

    const urlResponse = await urlRequest.json();
    return urlResponse.data;
  } catch (error) {
    console.error("Error creating presigned URL:", error);
    throw error;
  }
}
