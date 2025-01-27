import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

export const GET = withAuth(async (userId) => {
  try {
    const pins = await prisma.pin.findMany({
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

    // Serialize BigInts to strings before returning
    const serializedPins = pins.map(pin => ({
      ...pin,
      size: pin.size.toString()
    }));

    return NextResponse.json(serializedPins);
  } catch (error) {
    console.error("Failed to fetch pins:", error);
    return NextResponse.json(
      { error: "Failed to fetch pins" },
      { status: 500 }
    );
  }
}); 