import { Credential, Receipt } from 'mppx';
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
	reference?: string;
	network: string;
	amount: string;
}

export type PaymentGateResult =
	| { status: 'challenge'; response: Response }
	| {
			status: 'paid';
			payerAddress?: string;
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

	// The settled payer comes from mppx itself: `payment.success` handlers run
	// inline during settlement and receive the very credential that was
	// verified, so attribution can never diverge from what was charged.
	let payerAddress: string | undefined;
	mppx.onPaymentSuccess(({ credential }) => {
		payerAddress = payerFromCredential(credential);
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

	return { status: 'paid', payerAddress, withReceipt: result.withReceipt };
}

/** Whether a request carries anything that could be a payment credential. */
export function hasPaymentCredential(request: Request): boolean {
	return PAYMENT_REQUEST_HEADERS.some((header) => request.headers.get(header));
}

/**
 * The payer's address from a settled credential, as delivered by mppx's
 * `payment.success` event. The address lives in the EIP-3009 payload
 * (`authorization.from` — both MPP native and x402 wire formats decode to
 * this) or in the credential's source DID (did:pkh:eip155:<chainId>:0x...).
 */
export function payerFromCredential(credential?: Pick<Credential.Credential, 'payload' | 'source'>): string | undefined {
	const payload = credential?.payload as { authorization?: { from?: string } } | undefined;
	if (payload?.authorization?.from) return payload.authorization.from;
	const fromSource = credential?.source?.split(':').pop();
	return fromSource?.startsWith('0x') ? fromSource : undefined;
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
