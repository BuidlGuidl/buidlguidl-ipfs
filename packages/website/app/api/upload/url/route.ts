import { NextRequest, NextResponse } from "next/server";
import { pinner } from "@/app/lib/ipfs";
import { verifyApiKey, handleRouteError } from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key") || undefined;
    const url = await request.text();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // If API key is provided, verify it
    if (apiKey) {
      await verifyApiKey(apiKey);
    }

    const result = await (await pinner({ apiKey })).add.url(url);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "upload URL");
  }
}
