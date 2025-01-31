import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";
import crypto from "crypto";

// Default values
const DEFAULT_PIN_LIMIT = 1000;
const DEFAULT_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB
const DEFAULT_CLUSTER_ID = "default";

// Get values from env with fallbacks
const PIN_LIMIT = Number(process.env.DEFAULT_PIN_LIMIT) || DEFAULT_PIN_LIMIT;
const SIZE_LIMIT = Number(process.env.DEFAULT_SIZE_LIMIT) || DEFAULT_SIZE_LIMIT;
const CLUSTER_ID =
  process.env.NEXT_PUBLIC_DEFAULT_CLUSTER_ID || DEFAULT_CLUSTER_ID;

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    // First try to find the user
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
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
      },
    });

    // Create user with default API key and cluster access if doesn't exist
    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            id: userId,
            pinLimit: PIN_LIMIT,
            sizeLimit: SIZE_LIMIT,
            apiKeys: {
              create: {
                name: "default",
                apiKey: crypto.randomUUID(),
                ipfsClusterId: CLUSTER_ID,
              },
            },
            clusters: {
              create: {
                clusterId: CLUSTER_ID,
              },
            },
          },
          include: {
            clusters: {
              include: {
                ipfsCluster: true,
              },
            },
            apiKeys: {
              include: {
                ipfsCluster: true,
              },
            },
          },
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
