import type { PaymentDetails, PaymentOptions } from "./types.js";

/**
 * Client side of the MPP / x402 payment gate used by paid keyless upload
 * endpoints (e.g. https://upload.bgipfs.com/api/v0/add).
 *
 * Reactive flow: uploads are attempted normally; when an endpoint answers
 * 402, that response carries the payment challenge, so we sign a credential
 * for it (a gasless EIP-3009 USDC authorization, signed locally) and the
 * caller retries the upload once with the credential attached. Endpoints that
 * never ask for payment see no extra requests.
 *
 * mppx and viem are loaded lazily so that uploaders without payment never pay
 * their bundle cost.
 */

interface EvmChargeRequest {
  amount: string;
  currency: string;
  recipient: string;
  methodDetails: { chainId: number; decimals?: number };
}

interface ChallengeLike {
  request: unknown;
  description?: string;
}

const KNOWN_NETWORKS: Record<number, string> = {
  8453: "base",
  84532: "base-sepolia",
};

const KNOWN_CURRENCIES: Record<string, string> = {
  // USDC (mppx `assets.base.USDC` / `assets.baseSepolia.USDC`)
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": "USDC",
};

export interface PaymentCredential {
  /** Headers carrying the payment credential, to merge into the upload request */
  headers: Record<string, string>;
  details: PaymentDetails;
}

export function normalizeHeaders(
  headers: Headers | Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

export function formatAmount(atomic: string, decimals: number): string {
  const value = BigInt(atomic);
  const base = 10n ** BigInt(decimals);
  const whole = (value / base).toString();
  const fraction = (value % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function describeChallenge(challenge: ChallengeLike): PaymentDetails {
  const request = challenge.request as Partial<EvmChargeRequest>;
  const chainId = request.methodDetails?.chainId;
  const decimals = request.methodDetails?.decimals;
  const currency = request.currency ?? "";
  return {
    amount:
      request.amount !== undefined && decimals !== undefined
        ? formatAmount(request.amount, decimals)
        : (request.amount ?? "?"),
    currency: KNOWN_CURRENCIES[currency.toLowerCase()] ?? currency,
    network:
      chainId === undefined
        ? "unknown"
        : (KNOWN_NETWORKS[chainId] ?? `eip155:${chainId}`),
    recipient: request.recipient ?? "",
    ...(challenge.description && { description: challenge.description }),
  };
}

export function formatPaymentDetails(details: PaymentDetails): string {
  return `${details.amount} ${details.currency} on ${details.network}`;
}

/** Whether an error thrown by kubo-rpc-client is an HTTP 402 response. */
export function isPaymentRequiredError(
  error: unknown
): error is Error & { response: Response } {
  const response = (error as { response?: Response } | undefined)?.response;
  return response?.status === 402;
}

/** Parses the payment challenge out of a 402 response's headers. */
export async function parsePaymentChallenge(
  response: Response
): Promise<PaymentDetails | undefined> {
  try {
    const { Challenge } = await import("mppx");
    const [challenge] = Challenge.fromResponseList(response);
    return challenge ? describeChallenge(challenge) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Signs a payment credential for the challenge carried by a 402 response.
 * Throws when the challenge is unusable or exceeds `maxAmount`.
 */
export async function payForChallenge(
  response: Response,
  options: PaymentOptions
): Promise<PaymentCredential> {
  const account = await resolveAccount(options);
  const [{ Mppx }, { charge, assets }] = await Promise.all([
    import("mppx/client"),
    import("mppx/evm/client"),
  ]);
  const mppx = Mppx.create({
    methods: [
      charge({
        account,
        maxAmount: options.maxAmount,
        currencies: [assets.base.USDC, assets.baseSepolia.USDC],
      }),
    ],
    polyfill: false,
  });

  const payment = await mppx.preparePayment(response);
  const details: PaymentDetails = {
    ...describeChallenge(payment.challenge),
    payer: account.address,
  };
  await options.onPayment?.(details);

  const credential = await payment.createCredential();
  const { headers: credentialHeaders } = payment.setCredential(
    { headers: {} },
    credential
  );
  return { headers: normalizeHeaders(credentialHeaders as Headers), details };
}

async function resolveAccount(options: PaymentOptions) {
  if (options.account) return options.account;
  if (options.privateKey) {
    const { privateKeyToAccount } = await import("viem/accounts");
    return privateKeyToAccount(options.privateKey);
  }
  throw new Error(
    "Payment is configured without a signer: set payment.privateKey or payment.account"
  );
}
