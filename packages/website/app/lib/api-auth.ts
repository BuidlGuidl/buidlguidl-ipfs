import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { timingSafeEqual } from "crypto";
import { PrivyClient } from "@privy-io/server-auth";

export function verifyWorkerAuth(request: NextRequest) {
  const authHeader = request.headers.get("x-worker-auth");
  if (!authHeader) throw new Error("Missing worker auth");

  const isValid = timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(process.env.WORKER_AUTH_SECRET!)
  );

  if (!isValid) throw new Error("Invalid worker auth");
  return true;
}

export async function getUserId(request: NextRequest): Promise<string> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    throw new Error("No auth token");
  }

  try {
    const privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );
    const verifiedClaims = await privy.verifyAuthToken(
      token,
      process.env.PRIVY_VERIFICATION_KEY!
    );
    return verifiedClaims.userId;
  } catch (error) {
    console.error("Failed to verify token:", error);
    throw new Error("Invalid auth token");
  }
}

export async function verifyApiKey(apiKey: string) {
  if (!apiKey) throw new Error("Invalid API key");

  const key = await prisma.apiKey.findFirst({
    where: {
      apiKey,
      deletedAt: null,
    },
    include: {
      ipfsCluster: true,
    },
  });

  if (!key) throw new Error("Invalid API key");
  return key;
}

export function handleRouteError(error: unknown, operation: string) {
  // Auth errors from getUserId() and worker auth
  if (
    error instanceof Error &&
    // User auth errors
    (error.message === "No auth token" ||
      error.message === "Invalid auth token" ||
      // Worker auth errors
      error.message === "Missing worker auth" ||
      error.message === "Invalid worker auth" ||
      // API key errors
      error.message === "Invalid API key")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bad request errors
  if (error instanceof Error && error.message === "Bad request") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(`Failed to ${operation}:`, error);
  return NextResponse.json(
    { error: `Failed to ${operation}` },
    { status: 500 }
  );
}