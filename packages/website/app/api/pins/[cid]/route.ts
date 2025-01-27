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
      size: pin.size.toString(),
    };

    return NextResponse.json(serializedPin);
  } catch (error) {
    return handleRouteError(error, "delete pin");
  }
}
