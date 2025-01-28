import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    // Get all keys with cluster info
    const allKeys = await prisma.apiKey.findMany({
      where: { userId },
      include: {
        ipfsCluster: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // If no keys at all, create a default one
    if (allKeys.length === 0) {
      const apiKey = crypto.randomUUID();
      const defaultKey = await prisma.apiKey.create({
        data: {
          name: "default",
          userId,
          apiKey,
          ipfsClusterId: "default",
        },
        include: {
          ipfsCluster: true,
        },
      });
      return NextResponse.json([defaultKey]);
    }

    // Filter out deleted keys
    const activeKeys = allKeys.filter((key) => !key.deletedAt);
    return NextResponse.json(activeKeys);
  } catch (error) {
    return handleRouteError(error, "fetch API keys");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const apiKey = crypto.randomUUID();
    const key = await prisma.apiKey.create({
      data: {
        name,
        userId,
        apiKey,
        ipfsClusterId: "default",
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
