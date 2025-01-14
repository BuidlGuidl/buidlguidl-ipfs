import { NextRequest, NextResponse } from 'next/server'
import { IpfsPinner } from '@buidlguidl/ipfs-uploader'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    const pinner = new IpfsPinner({})
    const uploadResult = await pinner.add.file(file)

    return NextResponse.json(uploadResult)

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
