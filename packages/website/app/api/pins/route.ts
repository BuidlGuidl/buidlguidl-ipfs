import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

export const GET = withAuth(async (userId, request) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await prisma.pin.count({
      where: {
        userId,
        deletedAt: null,
      },
    });

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
      skip,
      take: limit,
    });

    // Serialize BigInts to strings before returning
    const serializedPins = pins.map(pin => ({
      ...pin,
      size: pin.size.toString()
    }));

    return NextResponse.json({
      pins: serializedPins,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch pins:", error);
    return NextResponse.json(
      { error: "Failed to fetch pins" },
      { status: 500 }
    );
  }
}); 