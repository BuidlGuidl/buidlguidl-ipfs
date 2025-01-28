import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';
import { verifyApiKey, handleRouteError } from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key") || undefined;
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // If API key is provided, verify it
    if (apiKey) {
      await verifyApiKey(apiKey);
    }

    const result = await (await pinner({ apiKey })).add.file(file);
    if (!result.success) throw new Error(`Upload failed: ${result.error}`);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "upload file");
  }
} 