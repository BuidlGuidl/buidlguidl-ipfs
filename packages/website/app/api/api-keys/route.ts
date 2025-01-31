import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    // Get all active keys with cluster info
    const activeKeys = await prisma.apiKey.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        ipfsCluster: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(activeKeys);
  } catch (error) {
    return handleRouteError(error, "fetch API keys");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const { name, ipfsClusterId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // If cluster ID is provided, verify the user has access to it
    if (ipfsClusterId && ipfsClusterId !== "default") {
      const userCluster = await prisma.userCluster.findUnique({
        where: {
          userId_clusterId: {
            userId,
            clusterId: ipfsClusterId,
          },
        },
      });

      if (!userCluster) {
        return NextResponse.json(
          { error: "Invalid cluster ID or cluster not accessible" },
          { status: 403 }
        );
      }
    }

    const apiKey = crypto.randomUUID();
    const key = await prisma.apiKey.create({
      data: {
        name,
        userId,
        apiKey,
        ipfsClusterId: ipfsClusterId || "default",
      },
      include: {
        ipfsCluster: true,
      },
    });

    return NextResponse.json({ ...key, apiKey });
  } catch (error) {
    return handleRouteError(error, "create API key");
  }
}
