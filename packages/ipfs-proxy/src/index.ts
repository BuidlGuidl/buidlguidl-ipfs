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
	IPFS_AUTH_USERNAME: string;
	IPFS_AUTH_PASSWORD: string;
	APP_API_URL: string;
	WORKER_AUTH_SECRET: string;
	DEFAULT_API_KEY: string;
}

interface AuthResponse {
	apiUrl: string;
	gatewayUrl: string;
}

interface JsonEntry {
	Name?: string;
	Hash: string;
	Size: string; // IPFS returns size as string
}

class JsonParser {
	private buffer = '';
	private decoder = new TextDecoder();
	private entries: Array<JsonEntry> = [];
	private hasError = false;
	private rootCid?: string;

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
			console.error('Transform error:', e);
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
			console.error('Upload failed - some files may be orphaned');
		} else {
			// For single files, use the only entry
			// For directories, find the entry without a Name
			const root = this.entries.length === 1 ? this.entries[0] : this.entries.find((e) => !e.Name);

			if (root) {
				this.rootCid = root.Hash;
				console.log(`IPFS: Uploaded ${this.entries.length} files with root CID: ${root.Hash}`);
			}
		}
	}

	getRootCid() {
		return this.rootCid;
	}

	getCids() {
		return this.entries.map((e) => e.Hash);
	}

	getCidsToPin(): Array<{ cid: string; size: bigint; name?: string }> {
		// If there's only one file, pin it
		if (this.entries.length === 1) {
			const entry = this.entries[0];
			return [
				{
					cid: entry.Hash,
					size: BigInt(entry.Size),
					name: entry.Name,
				},
			];
		}

		// If there's a root (directory), just pin that
		const root = this.entries.find((e) => !e.Name);
		if (root) {
			return [
				{
					cid: root.Hash,
					size: BigInt(root.Size),
				},
			];
		}

		// Otherwise, pin all files
		return this.entries.map((e) => ({
			cid: e.Hash,
			size: BigInt(e.Size),
			name: e.Name,
		}));
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
					'Access-Control-Max-Age': '86400',
				},
			});
		}

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
			// Get API key from request header or use default
			const requestApiKey = request.headers.get('x-api-key');
			const apiKey = requestApiKey || env.DEFAULT_API_KEY;

			if (!apiKey) {
				return new Response('API key is required', {
					status: 401,
					headers: {
						'Access-Control-Allow-Origin': '*',
					},
				});
			}

			// Verify API key and get IPFS node details
			const authResponse = await fetch(`${env.APP_API_URL}/api/auth`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-worker-auth': env.WORKER_AUTH_SECRET,
				},
				body: JSON.stringify({ apiKey }),
			});

			if (!authResponse.ok) {
				return new Response('Invalid API key', { status: 401 });
			}

			const { apiUrl } = (await authResponse.json()) as AuthResponse;

			if (!request.body) throw new Error('No body provided');

			const auth = btoa(`${env.IPFS_AUTH_USERNAME}:${env.IPFS_AUTH_PASSWORD}`);

			// Set up IPFS URL with query params
			const ipfsUrl = new URL('/api/v0/add', apiUrl);

			// Copy all params except cid-version
			url.searchParams.forEach((value, key) => {
				if (key !== 'cid-version') {
					ipfsUrl.searchParams.append(key, value);
				}
			});

			// Always use CIDv1, after filtering user params
			ipfsUrl.searchParams.append('cid-version', '1');

			// Filter headers
			const headers = Object.fromEntries(
				Array.from(request.headers.entries()).filter(
					([key]) => !['host', 'transfer-encoding', 'content-length', 'authorization'].includes(key.toLowerCase())
				)
			);

			const res = await fetch(ipfsUrl, {
				method: 'POST',
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
			const chunks: Uint8Array[] = [];

			// Collect and transform all chunks
			for await (const chunk of res.body!) {
				parser.transform(chunk, {
					enqueue: (c: Uint8Array) => {
						chunks.push(c);
						return 1;
					},
					error: () => {},
					terminate: () => {},
					desiredSize: 1,
				});
			}
			parser.flush();

			// Get the root CID before sending response
			const rootCid = parser.getRootCid();
			console.log('Root CID:', rootCid);

			const cidsToPin = parser.getCidsToPin();
			console.log('CIDs to pin:', cidsToPin);

			const customName = request.headers.get('x-pin-name');
			const pinsToCreate = cidsToPin.map((pin) => ({
				...pin,
				name: pin.name || customName,
				size: pin.size.toString(), // Convert BigInt to string for JSON serialization
			}));

			if (pinsToCreate.length > 0) {
				const pinResponse = await fetch(`${env.APP_API_URL}/api/pin`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-worker-auth': env.WORKER_AUTH_SECRET,
					},
					body: JSON.stringify({
						apiKey,
						pins: pinsToCreate,
					}),
				});

				if (!pinResponse.ok) {
					const error = await pinResponse.text();
					throw new Error(`Failed to pin files: ${error}`);
				}
			}

			// Send the collected response
			return new Response(new Blob(chunks), {
				headers: {
					...res.headers,
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
				},
			});
		} catch (error) {
			console.error('IPFS Add Error:', error);
			return new Response(JSON.stringify({ error: 'Failed to add content to IPFS' }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;
