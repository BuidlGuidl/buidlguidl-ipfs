import { NextRequest, NextResponse } from 'next/server';
import { pinner } from "@/app/lib/ipfs";
import { verifyApiKey, handleRouteError } from "@/app/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key") || undefined;
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const providedDirName = formData.get("dirName") as string;
    const dirName = providedDirName || `upload-${Date.now()}`;

    if (!files.length) {
      return NextResponse.json(
        { error: "Files are required" },
        { status: 400 }
      );
    }

    // If API key is provided, verify it
    if (apiKey) {
      await verifyApiKey(apiKey);
    }

    const result = await(
      await pinner({ apiKey })
    ).add.directory({
      dirPath: dirName,
      files,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "upload files");
  }
} 