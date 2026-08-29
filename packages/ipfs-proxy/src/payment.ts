import { Credential, Receipt, x402 } from 'mppx';
import { assets, charge } from 'mppx/evm/server';
import { Mppx } from 'mppx/server/core';

export interface PaymentEnv {
	PAYMENT_RECIPIENT?: string;
	PAYMENT_PRICE?: string;
	PAYMENT_NETWORK?: string;
	PAYMENT_FACILITATOR_URL?: string;
	MPP_SECRET_KEY?: string;
}

/** Payment metadata forwarded to the app alongside created pins. */
export interface PaymentInfo {
	payerAddress?: string;
	payerSource?: string;
	reference?: string;
	network: string;
	amount: string;
}

export type PaymentGateResult =
	| { status: 'challenge'; response: Response }
	| {
			status: 'paid';
			payerAddress?: string;
			payerSource?: string;
			withReceipt: (response: Response) => Response;
	  };

const DEFAULT_PRICE = '0.01'; // USDC, display units
const DEFAULT_NETWORK = 'base-sepolia';
const DEFAULT_FACILITATOR = 'https://x402.org/facilitator';

// Request headers that may carry a payment credential (MPP native + x402).
// Stripped before forwarding upstream and allowed through CORS.
export const PAYMENT_REQUEST_HEADERS = ['authorization', 'payment-authorization', 'payment-signature', 'x-payment'];
// Response headers carrying challenges/receipts, exposed through CORS.
export const PAYMENT_RESPONSE_HEADERS = ['www-authenticate', 'payment-receipt', 'payment-required', 'payment-response'];

export function isPaymentEnabled(env: PaymentEnv): boolean {
	return Boolean(env.PAYMENT_RECIPIENT && env.MPP_SECRET_KEY);
}

export function paymentNetwork(env: PaymentEnv): string {
	return env.PAYMENT_NETWORK || DEFAULT_NETWORK;
}

export function paymentPrice(env: PaymentEnv): string {
	return env.PAYMENT_PRICE || DEFAULT_PRICE;
}

function currencyFor(network: string) {
	switch (network) {
		case 'base':
			return assets.base.USDC;
		case 'base-sepolia':
			return assets.baseSepolia.USDC;
		default:
			throw new Error(`Unsupported PAYMENT_NETWORK: ${network} (expected 'base' or 'base-sepolia')`);
	}
}

/**
 * Runs the MPP/x402 payment gate against a request.
 *
 * Without a credential this returns the 402 challenge (both MPP
 * `WWW-Authenticate: Payment` and x402 wire formats). With a valid credential
 * it verifies AND settles via the configured facilitator before returning, so
 * `status: 'paid'` means the transfer is on-chain. The request body is never
 * read (no body digest is configured), so the upload stream stays intact.
 */
export async function gatePayment(request: Request, env: PaymentEnv, maxUploadBytes: number): Promise<PaymentGateResult> {
	const network = paymentNetwork(env);
	const amount = paymentPrice(env);

	const mppx = Mppx.create({
		methods: [
			charge({
				currency: currencyFor(network),
				recipient: env.PAYMENT_RECIPIENT as `0x${string}`,
				x402: { facilitator: env.PAYMENT_FACILITATOR_URL || DEFAULT_FACILITATOR },
			}),
		],
		secretKey: env.MPP_SECRET_KEY,
	});

	const handler = mppx.charge({
		amount,
		description: `IPFS pinning upload (max ${Math.floor(maxUploadBytes / (1024 * 1024))}MB)`,
	});

	const result = await handler(request);

	if (result.status === 402) {
		// Challenge responses must not be cached; mppx's Response is mutable but
		// wrap defensively in case that changes.
		let response = result.challenge;
		try {
			response.headers.set('Cache-Control', 'no-store');
		} catch {
			response = new Response(response.body, response);
			response.headers.set('Cache-Control', 'no-store');
		}
		return { status: 'challenge', response };
	}

	return { status: 'paid', ...extractPayer(request), withReceipt: result.withReceipt };
}

/**
 * Extracts the payer's address from whichever credential header the client
 * used. Best-effort: attribution metadata only, never used for auth.
 */
function extractPayer(request: Request): { payerAddress?: string; payerSource?: string } {
	// MPP native credential (EIP-3009 authorization payload)
	for (const header of ['authorization', 'payment-authorization']) {
		const value = request.headers.get(header);
		if (!value) continue;
		try {
			const credential = Credential.deserialize(value);
			const payload = credential.payload as { authorization?: { from?: string } } | undefined;
			// Payer is in the EIP-3009 payload, or the source DID (did:pkh:eip155:<chainId>:0x...)
			const fromSource = credential.source?.split(':').pop();
			const payerAddress = payload?.authorization?.from ?? (fromSource?.startsWith('0x') ? fromSource : undefined);
			if (payerAddress || credential.source) {
				return { payerAddress, payerSource: credential.source };
			}
		} catch {
			// Not an MPP Payment credential; try the next header.
		}
	}

	// x402 credential (v2 PAYMENT-SIGNATURE or legacy X-PAYMENT)
	for (const header of ['payment-signature', 'x-payment']) {
		const value = request.headers.get(header);
		if (!value) continue;
		try {
			const payload = x402.Header.decodePaymentSignature(value) as {
				payload?: { authorization?: { from?: string } };
			};
			const payerAddress = payload?.payload?.authorization?.from;
			if (payerAddress) return { payerAddress };
		} catch {
			// Ignore undecodable values.
		}
	}

	return {};
}

/** Reads the settlement reference (tx hash) back off the Payment-Receipt header. */
export function readReceiptReference(response: Response): string | undefined {
	const header = response.headers.get('Payment-Receipt');
	if (!header) return undefined;
	try {
		return Receipt.deserialize(header).reference;
	} catch {
		return undefined;
	}
}
