import { NextRequest, NextResponse } from 'next/server';
import { pinner } from "@/app/lib/ipfs";

export async function POST(request: NextRequest) {
  try {
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

    const result = await (await pinner()).add.directory({
      dirPath: dirName,
      files,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
} 