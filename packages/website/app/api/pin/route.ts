import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  verifyApiKey,
  verifyWorkerAuth,
  handleRouteError,
} from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    verifyWorkerAuth(request);

    const { apiKey, pins } = await request.json();
    if (!apiKey || !Array.isArray(pins)) {
      throw new Error("Bad request");
    }

    const key = await verifyApiKey(apiKey);

    // Create or update pins
    const createdPins = await Promise.all(
      pins.map(({ cid, size, name }) =>
        prisma.pin.upsert({
          where: {
            userId_cid: {
              userId: key.userId,
              cid,
            },
          },
          create: {
            userId: key.userId,
            cid,
            size: BigInt(size),
            name,
            ipfsClusterId: key.ipfsClusterId,
          },
          update: {
            size: BigInt(size),
            name,
            deletedAt: null, // Restore if it was deleted
          },
        })
      )
    );

    // Serialize BigInts to strings before returning
    const serializedPins = createdPins.map((pin) => ({
      ...pin,
      size: pin.size.toString(),
    }));

    return NextResponse.json(serializedPins);
  } catch (error) {
    return handleRouteError(error, "create pins");
  }
} 