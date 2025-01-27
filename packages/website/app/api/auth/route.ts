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

    return NextResponse.json({
      apiUrl: key.ipfsCluster.apiUrl,
      gatewayUrl: key.ipfsCluster.gatewayUrl,
    });
  } catch (error) {
    return handleRouteError(error, "authenticate request");
  }
} 