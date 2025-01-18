import { NextRequest, NextResponse } from "next/server";
import { pinner } from "@/app/lib/ipfs";

export async function POST(request: NextRequest) {
  try {
    const url = await request.text();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const result = await pinner.add.url(url);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
