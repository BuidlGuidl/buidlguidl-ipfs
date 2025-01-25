import { NextRequest } from "next/server";

if (!process.env.IPFS_API_URL) {
  throw new Error("IPFS_API_URL environment variable is not set");
}

if (!process.env.IPFS_AUTH_USERNAME || !process.env.IPFS_AUTH_PASSWORD) {
  throw new Error("IPFS auth credentials are not set");
}

const IPFS_API_URL = process.env.IPFS_API_URL;
const auth = Buffer.from(
  `${process.env.IPFS_AUTH_USERNAME}:${process.env.IPFS_AUTH_PASSWORD}`
).toString("base64");

// Mark as streaming route
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
  try {
    if (!request.body) throw new Error("No body provided");

    // Set up IPFS URL with query params - note the /api/v0/add path here
    const url = new URL(request.url);
    const ipfsUrl = new URL("/api/v0/add", IPFS_API_URL);
    url.searchParams.forEach((value, key) => ipfsUrl.searchParams.append(key, value));

    // Filter headers once
    const headers = Object.fromEntries(
      Array.from(request.headers.entries()).filter(
        ([key]) => !['host', 'transfer-encoding', 'content-length', 'authorization'].includes(key.toLowerCase())
      )
    );

    const res = await fetch(ipfsUrl, {
      method: "POST",
      headers: {
        ...headers,
        Authorization: `Basic ${auth}`,
      },
      body: request.body,
      // @ts-expect-error duplex exists but is not typed
      duplex: "half",
    });

    if (res.status !== 200) {
      const error = await res.text();
      throw new Error(`IPFS error: ${res.status} - ${error}`);
    }

    class JsonParser {
      private buffer = "";
      private decoder = new TextDecoder();
      private entries: Array<{Name?: string, Hash: string}> = [];
      private hasError = false;

      transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
        try {
          controller.enqueue(chunk);
          
          this.buffer += this.decoder.decode(chunk, { stream: true });
          let startIndex = 0;
          let endIndex = this.buffer.indexOf('\n', startIndex);
          
          while (endIndex !== -1) {
            const line = this.buffer.slice(startIndex, endIndex).trim();
            if (line) {
              try {
                const json = JSON.parse(line);
                if (json.Hash) {
                  this.entries.push(json);
                }
              } catch (e) {
                // Silently ignore parse errors
              }
            }
            startIndex = endIndex + 1;
            endIndex = this.buffer.indexOf('\n', startIndex);
          }
          
          this.buffer = this.buffer.slice(startIndex);
        } catch (e) {
          this.hasError = true;
          console.error("Transform error:", e);
          controller.error(e);
        }
      }

      flush() {
        // Process any remaining buffer
        if (this.buffer.trim()) {
          try {
            const json = JSON.parse(this.buffer);
            if (json.Hash) {
              this.entries.push(json);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        if (this.hasError) {
          console.error("Upload failed - some files may be orphaned");
        } else {
          const root = this.entries.find(e => !e.Name);
          if (root) {
            console.log(`IPFS: Uploaded ${this.entries.length} files with root CID: ${root.Hash}`);
          }
        }
      }
    }

    const parser = new JsonParser();
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        parser.transform(chunk, controller);
      },
      flush() {
        parser.flush();
      }
    });

    return new Response(res.body?.pipeThrough(transformStream), {
      headers: res.headers,
    });
  } catch (error) {
    console.error("IPFS Add Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to add content to IPFS" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const runtime = "edge";