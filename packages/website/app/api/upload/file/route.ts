import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const result = await pinner.add.file(file);
    if (!result.success) throw new Error(`Upload failed: ${result.error}`);  
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
} 