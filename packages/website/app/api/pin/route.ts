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

    // Create or update pins and update user stats in a transaction
    const createdPins = await prisma.$transaction(async (tx) => {
      // Calculate total new size from pins that don't exist or were deleted
      let totalNewSize = BigInt(0);
      const existingPins = await tx.pin.findMany({
        where: {
          userId: key.userId,
          cid: {
            in: pins.map((p) => p.cid),
          },
          deletedAt: null,
        },
        select: {
          cid: true,
          size: true,
        },
      });

      const existingCids = new Set(existingPins.map((p) => p.cid));

      // Sum up sizes of new or previously deleted pins
      for (const pin of pins) {
        if (!existingCids.has(pin.cid)) {
          totalNewSize += BigInt(pin.size);
        }
      }

      // Create or update pins
      const upsertedPins = await Promise.all(
        pins.map(({ cid, size, name }) =>
          tx.pin.upsert({
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

      // Update user stats if we have new pins
      if (totalNewSize > 0) {
        await tx.user.update({
          where: { id: key.userId },
          data: {
            pinCount: {
              increment: pins.length - existingPins.length,
            },
            size: {
              increment: totalNewSize,
            },
          },
        });
      }

      return upsertedPins;
    });

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