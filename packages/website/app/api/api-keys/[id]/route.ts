import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getUserId, handleRouteError } from "@/app/lib/api-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;

    const key = await prisma.apiKey.update({
      where: { id, userId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json(key);
  } catch (error) {
    return handleRouteError(error, "delete API key");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { id } = await params;
    const { name } = await request.json();

    const key = await prisma.apiKey.update({
      where: { id, userId },
      data: { name },
    });

    return NextResponse.json(key);
  } catch (error) {
    return handleRouteError(error, "update API key");
  }
}
