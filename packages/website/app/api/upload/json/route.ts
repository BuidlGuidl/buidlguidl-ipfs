import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    
    if (!json || typeof json !== 'object' || json === null) {
      return NextResponse.json({ error: 'JSON content is required' }, { status: 400 });
    }

    const result = await (await pinner()).add.json(json);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
} 