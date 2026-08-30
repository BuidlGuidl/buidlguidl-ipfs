import { Challenge, Credential, x402 } from 'mppx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { extractPayer } from '../src/payment';

const baseEnv = {
	IPFS_AUTH_USERNAME: 'user',
	IPFS_AUTH_PASSWORD: 'pass',
	APP_API_URL: 'https://app.example.com',
	WORKER_AUTH_SECRET: 'worker-secret',
};

const paymentEnv = {
	...baseEnv,
	DEFAULT_API_KEY: 'default-key',
	PAYMENT_RECIPIENT: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
	MPP_SECRET_KEY: 'test-secret-key-at-least-32-bytes-long!!',
};

const executionCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
} as unknown as ExecutionContext;

function mockAuthOk() {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = input instanceof Request ? input.url : input.toString();
		if (url.includes('/api/auth')) {
			return Response.json({ apiUrl: 'http://cluster.local:5555', gatewayUrl: 'http://gateway.local' });
		}
		if (url.includes('/api/pin')) {
			return Response.json([]);
		}
		if (url.includes('/api/v0/add')) {
			return new Response('{"Name":"hello.txt","Hash":"QmTestCid","Size":"5"}\n', { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${url}`);
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('keyless uploads', () => {
	it('returns 401 when payment is not configured and no api key is given', async () => {
		const res = await app.request('/api/v0/add', { method: 'POST', body: 'hello' }, baseEnv, executionCtx);
		expect(res.status).toBe(401);
	});

	it('returns 500 when payment is configured without DEFAULT_API_KEY', async () => {
		const { DEFAULT_API_KEY: _, ...env } = paymentEnv;
		const res = await app.request('/api/v0/add', { method: 'POST', body: 'hello' }, env, executionCtx);
		expect(res.status).toBe(500);
	});

	it('returns a 402 payment challenge with MPP and x402 headers', async () => {
		vi.stubGlobal('fetch', mockAuthOk());
		const res = await app.request(
			'/api/v0/add',
			// Node's Request does not materialize Content-Length from the body the
			// way real inbound HTTP requests do, so declare it explicitly.
			{ method: 'POST', body: 'hello', headers: { 'Content-Length': '5' } },
			paymentEnv,
			executionCtx
		);
		expect(res.status).toBe(402);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		const challenge = res.headers.get('WWW-Authenticate');
		expect(challenge).toContain('Payment');
		expect(challenge).toContain('method="evm"');
		expect(challenge).toContain('intent="charge"');
	});

	it('returns 402 again for a garbage payment credential', async () => {
		vi.stubGlobal('fetch', mockAuthOk());
		const res = await app.request(
			'/api/v0/add',
			{ method: 'POST', body: 'hello', headers: { 'Content-Length': '5', Authorization: 'Payment bm90LWEtY3JlZGVudGlhbA' } },
			paymentEnv,
			executionCtx
		);
		expect(res.status).toBe(402);
	});

	it('requires Content-Length for paid uploads', async () => {
		vi.stubGlobal('fetch', mockAuthOk());
		const res = await app.request('/api/v0/add', { method: 'POST', body: 'hello' }, paymentEnv, executionCtx);
		expect(res.status).toBe(411);
	});

	it('rejects oversized uploads before issuing a challenge', async () => {
		vi.stubGlobal('fetch', mockAuthOk());
		const res = await app.request(
			'/api/v0/add',
			{ method: 'POST', body: 'hello', headers: { 'Content-Length': '999999999' } },
			{ ...paymentEnv, MAX_UPLOAD_SIZE: '1000' },
			executionCtx
		);
		expect(res.status).toBe(413);
	});
});

describe('payer extraction', () => {
	const payer = '0x1111111111111111111111111111111111111111';
	const victim = '0x2222222222222222222222222222222222222222';

	async function issueChallenge() {
		vi.stubGlobal('fetch', mockAuthOk());
		const res = await app.request(
			'/api/v0/add',
			{ method: 'POST', body: 'hello', headers: { 'Content-Length': '5' } },
			paymentEnv,
			executionCtx
		);
		return Challenge.fromResponse(res);
	}

	function x402Header(from: string) {
		return x402.Header.encodePaymentSignature({
			x402Version: 2,
			accepted: {
				amount: '10000',
				asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
				maxTimeoutSeconds: 300,
				network: 'eip155:84532',
				payTo: paymentEnv.PAYMENT_RECIPIENT,
				scheme: 'exact',
			},
			payload: {
				authorization: {
					from,
					nonce: `0x${'11'.repeat(32)}`,
					to: paymentEnv.PAYMENT_RECIPIENT,
					validAfter: '0',
					validBefore: '9999999999',
					value: '10000',
				},
				signature: `0x${'ab'.repeat(65)}`,
			},
		});
	}

	it('reads the payer from the MPP Authorization credential', async () => {
		const challenge = await issueChallenge();
		const credential = Credential.serialize(
			Credential.from({ challenge, payload: {}, source: `did:pkh:eip155:84532:${payer}` })
		);
		const result = extractPayer(new Request('http://localhost/', { headers: { authorization: credential } }));
		expect(result.payerAddress).toBe(payer);
	});

	it('reads the payer from the x402 PAYMENT-SIGNATURE credential', async () => {
		const result = extractPayer(new Request('http://localhost/', { headers: { 'payment-signature': x402Header(payer) } }));
		expect(result.payerAddress).toBe(payer);
	});

	it('ignores credentials in headers mppx does not settle from', async () => {
		const challenge = await issueChallenge();
		const forged = Credential.serialize(Credential.from({ challenge, payload: { authorization: { from: victim } } }));
		const result = extractPayer(
			new Request('http://localhost/', {
				headers: { 'payment-authorization': forged, 'payment-signature': x402Header(payer) },
			})
		);
		expect(result.payerAddress).toBe(payer);
	});
});

describe('api key uploads', () => {
	it('bypasses the payment gate when an api key is provided', async () => {
		const fetchMock = mockAuthOk();
		vi.stubGlobal('fetch', fetchMock);
		const res = await app.request(
			'/api/v0/add',
			{ method: 'POST', body: 'hello', headers: { 'x-api-key': 'user-key' } },
			paymentEnv,
			executionCtx
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('QmTestCid');
		const authCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/auth'));
		expect(authCall).toBeTruthy();
	});
});
