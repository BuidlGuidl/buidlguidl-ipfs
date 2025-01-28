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
	public entries: Array<JsonEntry> = [];
	private wrapWithDirectory: boolean;
	private decoder = new TextDecoder();
	private buffer = '';

	constructor(wrapWithDirectory: boolean) {
		this.wrapWithDirectory = wrapWithDirectory;
	}

	addChunk(chunk: Uint8Array) {
		// Decode and add to buffer
		this.buffer += this.decoder.decode(chunk, { stream: true });

		// Process complete lines
		const newlineIndex = this.buffer.lastIndexOf('\n');
		if (newlineIndex === -1) return; // No complete lines yet

		// Get complete lines and keep remainder in buffer
		const lines = this.buffer.slice(0, newlineIndex).split('\n');
		this.buffer = this.buffer.slice(newlineIndex + 1);

		// Process complete lines
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line);
				if (entry.Hash) this.entries.push(entry);
			} catch (e) {
				console.warn('Parse error:', e);
			}
		}
	}

	flush() {
		// Process any remaining data in buffer
		if (this.buffer.trim()) {
			try {
				const entry = JSON.parse(this.buffer);
				if (entry.Hash) this.entries.push(entry);
			} catch (e) {
				console.warn('Parse error in flush:', e);
			}
		}
		this.buffer = '';
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

		// If wrap-with-directory is true, always pin the last entry (the directory)
		if (this.wrapWithDirectory) {
			const directoryEntry = this.entries[this.entries.length - 1];
			return [
				{
					cid: directoryEntry.Hash,
					size: BigInt(directoryEntry.Size),
				},
			];
		}

		// Otherwise, pin root-level entries
		return this.entries
			.filter((e) => {
				// Include entries with no name (raw files)
				// Or entries with no slashes (root level)
				return !e.Name || !e.Name.includes('/');
			})
			.map((e) => ({
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
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
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

		// Get API key from request header or use default
		const requestApiKey = request.headers.get('x-api-key');
		const apiKey = requestApiKey || env.DEFAULT_API_KEY;

		try {
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
					Host: new URL(env.APP_API_URL).hostname,
				},
				body: JSON.stringify({ apiKey }),
			});

			if (!authResponse.ok) {
				const errorText = await authResponse.text();
				throw new Error(`Auth failed: ${authResponse.status} - ${errorText}`);
			}

			const { apiUrl } = (await authResponse.json()) as AuthResponse;
			if (!apiUrl) {
				throw new Error('No API URL returned from auth endpoint');
			}

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

			const wrapWithDirectory = url.searchParams.get('wrap-with-directory') === 'true';
			const customName = request.headers.get('x-pin-name');

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

			const parser = new JsonParser(wrapWithDirectory);

			// Create a transform stream to process the IPFS response
			const processStream = new TransformStream({
				transform(chunk, controller) {
					try {
						// Process the chunk (parse JSON lines, collect CIDs)
						parser.addChunk(chunk);
						// Forward immediately - no need to await since backpressure is handled by TransformStream
						controller.enqueue(chunk);
					} catch (e) {
						console.error('Error processing chunk:', e);
						// Continue processing even if parsing fails
						controller.enqueue(chunk);
					}
				},
				flush() {
					try {
						// Process any remaining data
						parser.flush();

						// Get CIDs to pin and create pins in background
						const cidsToPin = parser.getCidsToPin();
						if (cidsToPin.length > 0) {
							ctx.waitUntil(
								createPins(env, apiKey, cidsToPin, customName, parser.entries.length).catch((e) => console.error('Error creating pins:', e))
							);
						}
					} catch (e) {
						console.error('Error in stream flush:', e);
					}
				},
			});

			// Return the transformed stream immediately
			return new Response(res.body!.pipeThrough(processStream), {
				headers: {
					...res.headers,
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
				},
			});
		} catch (error) {
			console.error(`IPFS Add Error for key ${apiKey}: ${error}`);
			return new Response(JSON.stringify({ error: 'Failed to add content to IPFS' }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;

async function createPins(
	env: Env,
	apiKey: string,
	cidsToPin: Array<{ cid: string; size: bigint; name?: string }>,
	customName: string | null,
	totalEntries: number
) {
	const pinsToCreate = cidsToPin.map((pin) => ({
		...pin,
		name: cidsToPin.length === 1 ? pin.name || customName : pin.name,
		size: pin.size.toString(),
	}));

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
		throw new Error(`Failed to save CIDs: ${pinsToCreate.map((p) => p.cid).join(', ')} - ${error}`);
	} else {
		console.log(`Pins saved: ${pinsToCreate.map((p) => p.cid).join(', ')} (${totalEntries} entries)`);
	}
}
