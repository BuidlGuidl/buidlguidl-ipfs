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
	private entries: Array<JsonEntry> = [];
	private hasError = false;
	private wrapWithDirectory: boolean;
	private chunks: Uint8Array[] = []; // Store all chunks

	constructor(wrapWithDirectory: boolean) {
		this.wrapWithDirectory = wrapWithDirectory;
	}

	addChunk(chunk: Uint8Array) {
		this.chunks.push(chunk);
	}

	processAllChunks() {
		// Combine all chunks into a single Uint8Array
		const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const fullArray = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of this.chunks) {
			fullArray.set(chunk, offset);
			offset += chunk.length;
		}

		// Decode the complete array at once
		const decoder = new TextDecoder();
		const fullText = decoder.decode(fullArray);

		// Split into lines and process each line
		const lines = fullText.split('\n').filter((line) => line.trim());

		for (const line of lines) {
			try {
				const json = JSON.parse(line);
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
			console.log(`IPFS: Uploaded ${this.entries.length} files`);
		}
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

		// Otherwise, pin root-level entries (no '/' in name)
		return this.entries
			.filter((e) => !e.Name || !e.Name.includes('/'))
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

			const wrapWithDirectory = url.searchParams.get('wrap-with-directory') === 'true';
			const parser = new JsonParser(wrapWithDirectory);
			const customName = request.headers.get('x-pin-name');

			// Create a transform stream that both collects entries and forwards the response
			const transformStream = new TransformStream({
				transform(chunk, controller) {
					parser.addChunk(chunk);
					controller.enqueue(chunk);
				},
				flush() {
					parser.processAllChunks();

					// Handle pinning after we've processed everything
					const cidsToPin = parser.getCidsToPin();
					console.log('Pinning CIDs:', cidsToPin.map((p) => p.cid).join(', '));

					if (cidsToPin.length > 0) {
						ctx.waitUntil(createPins(env, apiKey, cidsToPin, customName));
					}
				},
			});

			// Pipe the response through our transform stream
			res.body!.pipeThrough(transformStream);

			// Return the streaming response
			return new Response(transformStream.readable, {
				headers: {
					...res.headers,
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
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
					'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;

// Move pin creation to a separate async function
async function createPins(
	env: Env,
	apiKey: string,
	cidsToPin: Array<{ cid: string; size: bigint; name?: string }>,
	customName: string | null
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
		throw new Error(`Failed to pin files: ${error}`);
	} else {
		console.log(`Pins created: ${pinsToCreate.map((p) => p.cid).join(', ')}`);
	}
}
