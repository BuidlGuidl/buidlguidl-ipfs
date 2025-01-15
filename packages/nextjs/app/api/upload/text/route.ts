import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    
    if (!text) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    }

    const result = await pinner.add.text(text);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
} 