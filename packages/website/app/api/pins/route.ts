import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
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
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    // Serialize BigInts to strings before returning
    const serializedPins = pins.map((pin) => ({
      ...pin,
      size: pin.size.toString(),
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
    return handleRouteError(error, "fetch pins");
  }
}
