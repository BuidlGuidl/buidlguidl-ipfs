import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';

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

const app = new Hono<{ Bindings: Env }>();

// Add middleware
app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'x-api-key', 'x-pin-name'],
		maxAge: 86400,
	}),
);

// Add body size limit middleware
app.use('/api/v0/add', async (c, next) => {
	const maxSize = c.env.MAX_UPLOAD_SIZE ? parseInt(c.env.MAX_UPLOAD_SIZE) : 50 * 1024 * 1024;
	return bodyLimit({ maxSize })(c, next);
});

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
				([key]) => !['host', 'transfer-encoding', 'content-length', 'authorization'].includes(key.toLowerCase()),
			),
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

		const processStream = new TransformStream({
			transform(chunk, controller) {
				try {
					parser.addChunk(chunk);
					controller.enqueue(chunk);
				} catch (e) {
					console.error('Error processing chunk:', e);
					controller.enqueue(chunk);
				}
			},
			flush() {
				try {
					parser.flush();
					const cidsToPin = parser.getCidsToPin();
					if (cidsToPin.length > 0) {
						c.executionCtx.waitUntil(
							createPins(env, apiKey, cidsToPin, customName, parser.entries.length).catch((e) => console.error('Error creating pins:', e)),
						);
					}
				} catch (e) {
					console.error('Error in stream flush:', e);
				}
			},
		});

		const stream = res.body!.pipeThrough(processStream);

		return new Response(stream, {
			headers: {
				...res.headers,
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-pin-name',
			},
		});
	} catch (error) {
		console.error(`IPFS Add Error for key ${apiKey}: ${error}`);
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
