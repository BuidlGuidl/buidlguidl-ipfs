import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

export const GET = withAuth(async (userId) => {
  try {
    const clusters = await prisma.ipfsCluster.findMany({
      where: {
        OR: [
          { userId: null },    // Public clusters
          { userId: userId },  // User's private clusters
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(clusters);
  } catch (error) {
    console.error("Failed to fetch clusters:", error);
    return NextResponse.json(
      { error: "Failed to fetch clusters" },
      { status: 500 }
    );
  }
});