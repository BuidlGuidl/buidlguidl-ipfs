import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withAuth } from "@/app/lib/api-auth";

// Define the params type for this route
type Params = { id: string };

export const DELETE = withAuth<Params>(async (userId, request, context) => {
  if (!context) throw new Error('No context');
  const { id } = context.params;
  try {
    const key = await prisma.apiKey.update({
      where: {
        id,
        userId, // Ensure the key belongs to the user
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json(key);
  } catch (error) {
    console.error("Failed to delete API key:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth<Params>(async (userId, request, context) => {
  if (!context) throw new Error('No context');
  const { id } = context.params;
  try {
    const { name } = await request.json();
    
    const key = await prisma.apiKey.update({
      where: {
        id,
        userId, // Ensure the key belongs to the user
      },
      data: { name },
    });

    return NextResponse.json(key);
  } catch (error) {
    console.error("Failed to update API key:", error);
    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 }
    );
  }
}); 