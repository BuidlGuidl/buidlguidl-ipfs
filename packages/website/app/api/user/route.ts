import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";
import {
  createUserWithDefaults,
  syncUserWallets,
} from "@/app/lib/privy-wallet";

const USER_INCLUDE = {
  clusters: {
    include: {
      ipfsCluster: true,
    },
  },
  apiKeys: {
    where: { deletedAt: null },
    include: {
      ipfsCluster: true,
    },
  },
  wallets: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    // First try to find the user
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });

    // Create user with default API key and cluster access if doesn't exist
    if (!user) {
      try {
        await createUserWithDefaults(userId);
        user = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          include: USER_INCLUDE,
        });

        console.log("User created successfully:", { userId: user.id });
      } catch (createError) {
        console.error("Failed to create user:", {
          error:
            createError instanceof Error ? createError.message : createError,
          userId,
        });
        throw createError;
      }
    }

    // Lazily mirror the user's Privy-linked wallets (also serves as an
    // incremental backfill for accounts created before the mirror existed)
    if (user.wallets.length === 0) {
      const addresses = await syncUserWallets(userId);
      user.wallets = addresses.map((address) => ({
        address,
        userId,
        createdAt: new Date(),
      }));
    }

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      ...user,
      size: user.size.toString(),
      sizeLimit: user.sizeLimit.toString(),
    });
  } catch (error) {
    return handleRouteError(error, "fetch user");
  }
}
