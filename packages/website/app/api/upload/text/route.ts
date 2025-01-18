import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';

export async function POST(request: NextRequest) {
  try {
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

    const result = await pinner.add.text(text);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
} 