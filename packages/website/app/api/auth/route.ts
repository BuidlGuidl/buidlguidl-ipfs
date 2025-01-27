import { NextRequest, NextResponse } from "next/server";
import { withWorkerAuth, verifyApiKey } from "@/app/lib/api-auth";

export const POST = withWorkerAuth(async (request: NextRequest) => {
  try {
    const { apiKey } = await request.json();
    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const key = await verifyApiKey(apiKey);
    if (!key) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    return NextResponse.json({
      apiUrl: key.ipfsCluster.apiUrl,
      gatewayUrl: key.ipfsCluster.gatewayUrl,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}); 