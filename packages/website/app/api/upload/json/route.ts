import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';
import { verifyApiKey, handleRouteError } from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key") || undefined;
    const json = await request.json();

    if (!json || typeof json !== "object" || json === null) {
      return NextResponse.json(
        { error: "JSON content is required" },
        { status: 400 }
      );
    }

    // If API key is provided, verify it
    if (apiKey) {
      await verifyApiKey(apiKey);
    }

    const result = await (await pinner({ apiKey })).add.json(json);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "upload JSON");
  }
} 