/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.json`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface Env {
	IPFS_API_URL: string;
	IPFS_AUTH_USERNAME: string;
	IPFS_AUTH_PASSWORD: string;
}

class JsonParser {
	private buffer = "";
	private decoder = new TextDecoder();
	private entries: Array<{Name?: string; Hash: string}> = [];
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

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Parse the URL to check the path
		const url = new URL(request.url);
		if (url.pathname !== '/api/v0/add') {
			return new Response('Not Found', { status: 404 });
		}

		// Only allow POST requests
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			if (!request.body) throw new Error("No body provided");

			const auth = btoa(`${env.IPFS_AUTH_USERNAME}:${env.IPFS_AUTH_PASSWORD}`);

			// Set up IPFS URL with query params
			const ipfsUrl = new URL("/api/v0/add", env.IPFS_API_URL);
			url.searchParams.forEach((value, key) => ipfsUrl.searchParams.append(key, value));

			// Filter headers
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
			});

			if (res.status !== 200) {
				const error = await res.text();
				throw new Error(`IPFS error: ${res.status} - ${error}`);
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
				headers: {
					...res.headers,
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});

		} catch (error) {
			console.error("IPFS Add Error:", error);
			return new Response(
				JSON.stringify({ error: "Failed to add content to IPFS" }),
				{ 
					status: 500, 
					headers: { 
						"Content-Type": "application/json",
						'Access-Control-Allow-Origin': '*',
					} 
				}
			);
		}
	},
} satisfies ExportedHandler<Env>;
