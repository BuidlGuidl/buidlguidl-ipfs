import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

// Define the params type for this route
type Params = { cid: string };

export const PATCH = withAuth<Params>(async (userId, request, context) => {
  if (!context) throw new Error('No context');
  const { cid } = context.params;
  try {
    const { name } = await request.json();
    
    const pin = await prisma.pin.update({
      where: {
        userId_cid: {
          userId,
          cid,
        },
      },
      data: { name },
    });

    const serializedPin = {
      ...pin,
      size: pin.size.toString()
    };

    return NextResponse.json(serializedPin);
  } catch (error) {
    console.error("Failed to update pin:", error);
    return NextResponse.json(
      { error: "Failed to update pin" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth<Params>(async (userId, request, context) => {
  if (!context) throw new Error('No context');
  const { cid } = context.params;
  try {
    const pin = await prisma.pin.update({
      where: {
        userId_cid: {
          userId,
          cid,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    const serializedPin = {
      ...pin,
      size: pin.size.toString()
    };

    return NextResponse.json(serializedPin);
  } catch (error) {
    console.error("Failed to delete pin:", error);
    return NextResponse.json(
      { error: "Failed to delete pin" },
      { status: 500 }
    );
  }
}); 