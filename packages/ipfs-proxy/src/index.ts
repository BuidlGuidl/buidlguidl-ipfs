import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';

interface Env {
	IPFS_AUTH_USERNAME: string;
	IPFS_AUTH_PASSWORD: string;
	APP_API_URL: string;
	WORKER_AUTH_SECRET: string;
	DEFAULT_API_KEY: string;
	MAX_UPLOAD_SIZE?: string; // Optional environment variable for max upload size in bytes
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
				if (entry?.Hash) this.entries.push(entry);
			} catch (e) {
				console.warn('Parse error in flush:', e);
			}
		}
		this.buffer = '';
	}

	getCidsToPin(): Array<{ cid: string; size: bigint; name?: string }> {
		if (this.entries.length === 0) return [];
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

const app = new Hono<{ Bindings: Env }>();

// Add middleware
app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'x-api-key', 'x-pin-name'],
		maxAge: 86400,
	})
);

// Main upload route
app.post('/api/v0/add', async (c) => {
	const env = c.env;
	const apiKey = c.req.header('x-api-key') || env.DEFAULT_API_KEY;

	if (!apiKey) {
		return c.json({ error: 'API key is required' }, 401);
	}

	try {
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

		const request = c.req.raw;
		if (!request.body) throw new Error('No body provided');

		const auth = btoa(`${env.IPFS_AUTH_USERNAME}:${env.IPFS_AUTH_PASSWORD}`);
		const url = new URL(request.url);
		const ipfsUrl = new URL('/api/v0/add', apiUrl);

		// Copy all params except cid-version
		url.searchParams.forEach((value, key) => {
			if (key !== 'cid-version') {
				ipfsUrl.searchParams.append(key, value);
			}
		});

		// Always use CIDv1
		ipfsUrl.searchParams.append('cid-version', '1');

		// Filter headers
		const headers = Object.fromEntries(
			Array.from(request.headers.entries()).filter(
				([key]) => !['host', 'transfer-encoding', 'content-length', 'authorization'].includes(key.toLowerCase())
			)
		);

		const wrapWithDirectory = url.searchParams.get('wrap-with-directory') === 'true';
		const customName = request.headers.get('x-pin-name');

		const maxSize = parseInt(env.MAX_UPLOAD_SIZE || '104857600'); // 100MB

		// Early size check using content-length header if available
		const contentLength = request.headers.get('content-length');
		if (contentLength) {
			const declaredSize = parseInt(contentLength);
			if (declaredSize > maxSize) {
				return c.json(
					{
						error: `Upload size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`,
					},
					413
				);
			}
		}

		// If no content-length or size is ok, proceed with streaming size check
		const abortController = new AbortController();
		let totalSize = 0;

		// Create size checking stream
		const sizeCheckStream = new TransformStream({
			transform(chunk, controller) {
				totalSize += chunk.length;
				if (totalSize > maxSize) {
					abortController.abort(`Upload size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
				}
				controller.enqueue(chunk);
			},
		});

		// Send to IPFS with abort signal
		const ipfsPromise = fetch(ipfsUrl, {
			method: 'POST',
			headers: { ...headers, Authorization: `Basic ${auth}` },
			body: request.body.pipeThrough(sizeCheckStream),
			signal: abortController.signal,
		});

		try {
			const res = await ipfsPromise;
			if (!res.ok) {
				throw new Error(`IPFS error: ${res.status}`);
			}

			// Now handle the IPFS response with our stream handler
			const parser = new JsonParser(wrapWithDirectory);

			return stream(c, async (stream) => {
				const processStream = new TransformStream({
					transform(chunk, controller) {
						try {
							parser.addChunk(chunk);
							controller.enqueue(chunk);
						} catch (e) {
							console.error(`Error processing chunk for key ${apiKey}:`, e);
							controller.error(e);
						}
					},
					flush(controller) {
						parser.flush();
						const cidsToPin = parser.getCidsToPin();
						if (cidsToPin.length === 0) {
							console.error(`No CIDs to pin for key ${apiKey}`);
							controller.error(new Error('No CIDs to pin'));
							return;
						}
						c.executionCtx.waitUntil(createPins(env, apiKey, cidsToPin, customName, parser.entries.length));
					},
				});

				// Pipe IPFS response through our processor and to the client
				await stream.pipe(res.body!.pipeThrough(processStream));
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes('exceeds maximum allowed size')) {
				return c.json({ error: error.message }, 413);
			}
			throw error;
		}
	} catch (error) {
		console.error(`IPFS Add Error for key ${apiKey.toString()}: ${error}`);
		return c.json({ error: 'Failed to add content to IPFS' }, 500);
	}
});

export default app;

async function createPins(
	env: Env,
	apiKey: string,
	cidsToPin: Array<{ cid: string; size: bigint; name?: string }>,
	customName: string | null,
	totalEntries: number,
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
