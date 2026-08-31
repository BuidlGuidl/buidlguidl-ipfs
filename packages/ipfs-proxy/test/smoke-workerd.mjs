// Workerd smoke test: vitest runs in plain Node (the pinned
// @cloudflare/vitest-pool-workers cannot load viem/ox — see vitest.config.mts),
// so this boots `wrangler dev` and asserts the payment gate actually executes
// in the production runtime: mppx/viem load, a challenge is issued, and
// chunked (no Content-Length) requests are handled — behavior that in
// production otherwise depends on Cloudflare's edge.
//
// Usage: node test/smoke-workerd.mjs   (also wired as `pnpm test:smoke`)
import { spawn } from 'node:child_process';

const port = 8977;
const base = `http://127.0.0.1:${port}`;

const child = spawn(
	'npx',
	[
		'wrangler',
		'dev',
		'--port',
		String(port),
		'--var',
		'PAYMENT_RECIPIENT:0x60Ca282757BA67f3aDbF21F3ba2eBe4Ab3eb01fc',
		'--var',
		'MPP_SECRET_KEY:smoke-secret-key-at-least-32-bytes-long!',
		'--var',
		'DEFAULT_API_KEY:smoke-default-key',
	],
	{ stdio: ['ignore', 'pipe', 'pipe'], cwd: new URL('..', import.meta.url) }
);
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

const fail = (message) => {
	console.error(`FAIL: ${message}`);
	console.error(output);
	child.kill('SIGTERM');
	process.exit(1);
};

// Wait for the dev server
const deadline = Date.now() + 60_000;
for (;;) {
	if (Date.now() > deadline) fail('wrangler dev did not come up within 60s');
	try {
		await fetch(base, { signal: AbortSignal.timeout(1000) });
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

const checks = [];
const check = (name, ok) => {
	checks.push([name, ok]);
	console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`);
};

// 1. Keyless empty probe -> 402 with both challenge formats
const probe = await fetch(`${base}/api/v0/add`, { method: 'POST' });
check('empty probe returns 402', probe.status === 402);
check('challenge carries WWW-Authenticate Payment', (probe.headers.get('www-authenticate') ?? '').includes('Payment'));
check('challenge carries x402 PAYMENT-REQUIRED', probe.headers.has('payment-required'));

// 2. Keyless chunked upload (no Content-Length, like kubo-rpc-client) -> 402
const stream = new ReadableStream({
	start(controller) {
		controller.enqueue(new TextEncoder().encode('smoke-body'));
		controller.close();
	},
});
const chunked = await fetch(`${base}/api/v0/add`, {
	method: 'POST',
	headers: { 'content-type': 'multipart/form-data; boundary=b' },
	body: stream,
	duplex: 'half',
});
check('chunked keyless request gets the challenge (not 411)', chunked.status === 402);

child.kill('SIGTERM');
if (checks.some(([, ok]) => !ok)) {
	console.error(output);
	process.exit(1);
}
console.log('workerd smoke test passed');
process.exit(0);
