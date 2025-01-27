import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const keys = await prisma.apiKey.findMany({
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

    return NextResponse.json(keys);
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
