import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { createHash, timingSafeEqual } from "crypto";
import { PrivyClient } from "@privy-io/server-auth";

export function verifyWorkerAuth(request: NextRequest) {
  const authHeader = request.headers.get("x-worker-auth");
  if (!authHeader) return false;
  
  return timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(process.env.WORKER_AUTH_SECRET!)
  );
}

export async function verifyApiKey(apiKey: string) {
  const hashedKey = createHash("sha256").update(apiKey).digest("hex");
  
  return prisma.apiKey.findFirst({
    where: {
      apiKey: hashedKey,
      deletedAt: null,
    },
    include: {
      ipfsCluster: true,
    },
  });
}

export function withWorkerAuth(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    if (!verifyWorkerAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req);
  };
}

export async function verifyAuth(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  try {
    const privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!);
    const verifiedClaims = await privy.verifyAuthToken(
      token,
      process.env.PRIVY_VERIFICATION_KEY!
    );
    return verifiedClaims.userId;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return null;
  }
}

// Helper middleware for routes that need auth
export function withAuth<P = void>(
  handler: (
    userId: string,
    request: NextRequest,
    context?: { params: P }
  ) => Promise<Response>
) {
  return async (
    request: NextRequest,
    context?: { params: P }
  ) => {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(userId, request, context);
  };
} 