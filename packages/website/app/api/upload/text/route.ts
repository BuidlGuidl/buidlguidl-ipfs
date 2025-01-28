import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';
import { verifyApiKey, handleRouteError } from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key") || undefined;
    const text = await request.text();
    const MAX_TEXT_LENGTH = 1_000; // 1MB of text

    if (!text) {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: `Text content exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
        },
        { status: 413 } // 413 Payload Too Large
      );
    }

    // If API key is provided, verify it
    if (apiKey) {
      await verifyApiKey(apiKey);
    }

    const result = await(await pinner({ apiKey })).add.text(text);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "upload text");
  }
} 