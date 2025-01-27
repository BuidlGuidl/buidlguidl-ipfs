import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withWorkerAuth, verifyApiKey } from "@/app/lib/api-auth";

export const POST = withWorkerAuth(async (request: NextRequest) => {
  try {
    const { apiKey, pins } = await request.json();
    if (!apiKey || !Array.isArray(pins)) {
      return NextResponse.json({ error: "API key and pins array are required" }, { status: 400 });
    }

    const key = await verifyApiKey(apiKey);
    if (!key) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

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
            // Only update if something changed
            size: BigInt(size),
            name,
            deletedAt: null, // Restore if it was deleted
          },
        })
      )
    );

    // Serialize BigInts to strings before returning
    const serializedPins = createdPins.map(pin => ({
      ...pin,
      size: pin.size.toString()
    }));

    return NextResponse.json(serializedPins);
  } catch (error) {
    // Safe error logging
    console.error("Pin error:", error instanceof Error ? error.message : "Unknown error");
    
    return NextResponse.json(
      { error: "Failed to create pins" },
      { status: 500 }
    );
  }
}); 