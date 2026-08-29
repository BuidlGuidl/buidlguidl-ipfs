import { PrivyClient, type User as PrivyUser } from "@privy-io/server-auth";
import { prisma } from "@/app/lib/prisma";
import crypto from "crypto";

const DEFAULT_PIN_LIMIT = 1000;
const DEFAULT_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

export const PIN_LIMIT = Number(process.env.DEFAULT_PIN_LIMIT) || DEFAULT_PIN_LIMIT;
export const SIZE_LIMIT = Number(process.env.DEFAULT_SIZE_LIMIT) || DEFAULT_SIZE_LIMIT;
export const CLUSTER_ID = process.env.NEXT_PUBLIC_DEFAULT_CLUSTER_ID || "default";

export function privyClient() {
  return new PrivyClient(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
  );
}

/** All Ethereum wallet addresses linked to a Privy user, lowercased. */
export function ethAddresses(user: PrivyUser): string[] {
  return user.linkedAccounts
    .filter(
      (account) => account.type === "wallet" && account.chainType === "ethereum"
    )
    .map((account) => (account as { address: string }).address.toLowerCase());
}

/**
 * Mirrors wallet addresses to a user. Privy owns the wallet↔user link, so a
 * wallet previously mirrored to another user is reassigned.
 */
export async function addUserWallets(userId: string, addresses: string[]) {
  if (addresses.length === 0) return;
  await prisma.$transaction(
    addresses.map((address) =>
      prisma.userWallet.upsert({
        where: { address },
        create: { address, userId },
        update: { userId },
      })
    )
  );
}

/**
 * Mirrors the user's current Privy-linked Ethereum wallets into user_wallets.
 * Best-effort: failures are swallowed so this never breaks the caller.
 */
export async function syncUserWallets(userId: string): Promise<string[]> {
  try {
    const privyUser = await privyClient().getUser(userId);
    const addresses = ethAddresses(privyUser);
    await addUserWallets(userId, addresses);
    return addresses;
  } catch (error) {
    console.error(
      `Failed to sync wallets for ${userId}:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/** Create-input for a new user: default API key and access on the given cluster. */
export function userWithDefaults(userId: string, clusterId: string = CLUSTER_ID) {
  return {
    id: userId,
    pinLimit: PIN_LIMIT,
    sizeLimit: SIZE_LIMIT,
    apiKeys: {
      create: {
        name: "default",
        apiKey: crypto.randomUUID(),
        ipfsClusterId: clusterId,
      },
    },
    clusters: {
      create: {
        clusterId,
      },
    },
  };
}

/**
 * Resolves a paid pin's payer address to a local user id, creating accounts
 * as needed:
 * 1. user_wallets mirror match
 * 2. Privy lookup by wallet address (wallet linked in Privy but not mirrored
 *    yet — e.g. a second wallet, or an account created before the mirror)
 * 3. Privy importUser: pregenerate an account for a never-seen wallet, so the
 *    payer finds their pins when they first log in with it
 *
 * New local accounts get their defaults on `clusterId`, where the pins land.
 * Returns null on any failure — callers fall back to the default account.
 * The payer address is stored on the pin either way, so attribution can
 * always be repaired later.
 */
export async function resolvePaidPinUserId(
  payerAddress: string,
  clusterId?: string
): Promise<string | null> {
  // Defensive: only well-formed EVM addresses go to the mirror or Privy
  if (!/^0x[0-9a-fA-F]{40}$/.test(payerAddress)) {
    console.error(`Invalid payer address for attribution: ${payerAddress}`);
    return null;
  }
  const address = payerAddress.toLowerCase();
  try {
    const mirrored = await prisma.userWallet.findUnique({
      where: { address },
      select: { userId: true },
    });
    if (mirrored) return mirrored.userId;

    const privy = privyClient();
    let privyUser = await privy.getUserByWalletAddress(address);
    if (!privyUser) {
      privyUser = await privy.importUser({
        linkedAccounts: [{ type: "wallet", address, chainType: "ethereum" }],
      });
      console.log(
        `Pregenerated Privy user ${privyUser.id} for payer ${address}`
      );
    }

    const userId = privyUser.id;
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      await prisma.user.create({ data: userWithDefaults(userId, clusterId) });
      console.log(`Created local user ${userId} for payer ${address}`);
    }
    // Mirror every wallet Privy reports, not just the paying one
    await addUserWallets(userId, ethAddresses(privyUser));
    return userId;
  } catch (error) {
    console.error(
      `Failed to resolve paid pin user for payer ${address}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
