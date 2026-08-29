import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";
import { syncUserWallets, userWithDefaults } from "@/app/lib/privy-wallet";

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
        user = await prisma.user.create({
          data: userWithDefaults(userId),
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

      // Mirror the Privy-linked wallets once at first login; accounts that
      // predate the mirror are covered by scripts/backfill-user-wallets.ts
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
