import { NextRequest, NextResponse } from 'next/server';
import { pinner } from '@/app/lib/ipfs';

interface GlobFile {
  path: string;
  content: string | Buffer;
}

export async function POST(request: NextRequest) {
  try {
    const files = await request.json();
    
    if (!Array.isArray(files) || !files.length || !files.every(isValidGlobFile)) {
      return NextResponse.json({ 
        error: 'Invalid glob source format. Expected array of {path: string, content: string|Buffer}' 
      }, { status: 400 });
    }

    const result = await pinner.add.globFiles(files);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

function isValidGlobFile(file: any): file is GlobFile {
  return (
    typeof file === 'object' &&
    file !== null &&
    typeof file.path === 'string' &&
    (typeof file.content === 'string' || file.content instanceof Buffer)
  );
} 