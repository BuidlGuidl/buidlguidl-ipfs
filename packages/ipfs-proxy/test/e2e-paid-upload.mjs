// Manual e2e for the paid keyless upload path. Not run by vitest.
//
// Usage:
//   1. Configure .dev.vars with PAYMENT_RECIPIENT + MPP_SECRET_KEY (+ DEFAULT_API_KEY)
//      and start `pnpm dev` (plus an app, or a stub, serving /api/auth + /api/pin).
//   2. node test/e2e-paid-upload.mjs [worker-url]
//
// Without PRIVATE_KEY a throwaway unfunded wallet is used: expect a 402
// "verification-failed ... transfer amount exceeds balance" from the
// facilitator, which still proves the full wire path (challenge -> signed
// EIP-3009 credential -> worker -> facilitator -> on-chain simulation).
// To test real settlement, set PRIVATE_KEY to a key holding Base Sepolia USDC
// (Circle faucet: https://faucet.circle.com) and expect 200 + Payment-Receipt.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Fetch } from 'mppx/client';
import { charge } from 'mppx/evm/client';
import { assets } from 'mppx/evm/server';

const workerUrl = process.argv[2] || 'http://127.0.0.1:8787';
const account = privateKeyToAccount(process.env.PRIVATE_KEY || generatePrivateKey());
console.log(`payer: ${account.address}${process.env.PRIVATE_KEY ? '' : ' (throwaway, unfunded)'}`);

const paidFetch = Fetch.from({
	methods: [charge({ account, maxAmount: '0.05', currencies: [assets.baseSepolia.USDC, assets.base.USDC] })],
});

const body = new FormData();
body.append('file', new Blob([`paid e2e ${Date.now()}`]), 'paid-test.txt');

const res = await paidFetch(`${workerUrl}/api/v0/add`, { method: 'POST', body });
console.log('final status:', res.status);
for (const header of ['payment-receipt', 'payment-response', 'content-type']) {
	const value = res.headers.get(header);
	if (value) console.log(`${header}:`, value.slice(0, 200));
}
console.log('body:', (await res.text()).slice(0, 600));
