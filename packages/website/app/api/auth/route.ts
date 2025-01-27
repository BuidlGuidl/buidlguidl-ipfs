import { NextRequest, NextResponse } from "next/server";
import {
  verifyApiKey,
  verifyWorkerAuth,
  handleRouteError,
} from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    verifyWorkerAuth(request);

    const { apiKey } = await request.json();
    if (!apiKey) {
      throw new Error("Bad request");
    }

    const key = await verifyApiKey(apiKey);

    return NextResponse.json(
      {
        apiUrl: key.ipfsCluster.apiUrl,
        gatewayUrl: key.ipfsCluster.gatewayUrl,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-worker-auth",
        },
      }
    );
  } catch (error) {
    return handleRouteError(error, "authenticate request");
  }
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-worker-auth",
      },
    }
  );
} 