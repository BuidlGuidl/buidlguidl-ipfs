import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { cid } = await params;
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
      size: pin.size.toString(),
    };

    return NextResponse.json(serializedPin);
  } catch (error) {
    return handleRouteError(error, "update pin");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { cid } = await params;

    const pin = await prisma.$transaction(async (tx) => {
      // First get the pin to check its size
      const pin = await tx.pin.findUnique({
        where: {
          userId_cid: {
            userId,
            cid,
          },
        },
        select: {
          size: true,
          deletedAt: true,
        },
      });

      if (!pin || pin.deletedAt) {
        throw new Error("Pin not found or already deleted");
      }

      // Mark pin as deleted
      const updatedPin = await tx.pin.update({
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

      // Update user stats
      await tx.user.update({
        where: { id: userId },
        data: {
          pinCount: {
            decrement: 1,
          },
          size: {
            decrement: pin.size,
          },
        },
      });

      return updatedPin;
    });

    const serializedPin = {
      ...pin,
      size: pin.size.toString(),
    };

    return NextResponse.json(serializedPin);
  } catch (error) {
    return handleRouteError(error, "delete pin");
  }
}
