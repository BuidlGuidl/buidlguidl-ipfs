import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId } from "@/app/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const clusters = await prisma.ipfsCluster.findMany({
      where: {
        OR: [
          { userId: null }, // Public clusters
          { userId: userId }, // User's private clusters
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(clusters);
  } catch (error) {
    console.error("Failed to fetch clusters:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
