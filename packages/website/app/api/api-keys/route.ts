import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

export const GET = withAuth(async (userId) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        ipfsCluster: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(keys);
  } catch (error) {
    console.error("Failed to fetch API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (userId, request) => {
  try {
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
    console.error("Failed to create API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}); 