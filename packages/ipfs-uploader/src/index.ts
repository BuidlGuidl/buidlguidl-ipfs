import { Helia, createHelia, libp2pDefaults} from 'helia'
import { UnixFS, unixfs, globSource } from '@helia/unixfs'
import { heliaWithRemotePins } from '@helia/remote-pinning'
import { CID } from 'multiformats/cid'
import { strings, type Strings } from '@helia/strings'
import { json, type JSON } from '@helia/json'

export interface IpfsPinnerConfig {
  endpointUrl?: string
  accessToken?: string
}

export interface UploadResult {
  cid: string
  status: 'pinned' | 'failed'
}

export interface FileArrayResult extends UploadResult {
  files: { name: string; cid: string }[]
}

export class IpfsPinner {
  private helia!: Helia
  private config: Required<IpfsPinnerConfig>
  private interfaces = {
    fs: undefined as UnixFS | undefined,
    strings: undefined as Strings | undefined,
    json: undefined as JSON | undefined
  }

  constructor(config?: IpfsPinnerConfig) {
    this.config = {
      endpointUrl: config?.endpointUrl ?? 'http://127.0.0.1:9097',
      accessToken: config?.accessToken ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyIn0.X9ko6ogtJ0Yi7EQDpOU7E7i4aNBSTh-rJL5nCYnkm20'
    }
  }

  add = {
    file: async (input: File | string): Promise<UploadResult> => {
      await this.initialize()

      let content: Uint8Array
      if (input instanceof File) {
        const buffer = await input.arrayBuffer()
        content = new Uint8Array(buffer)
      } else if (typeof window === 'undefined') {
        // Only try to use fs in Node.js environment
        const { readFile } = await import('fs/promises')
        const buffer = await readFile(input)
        content = new Uint8Array(buffer)
      } else {
        throw new Error('File path strings are only supported in Node.js environments')
      }
      
      const cid = await this.interfaces.fs!.addBytes(content)
      const status = await this.pinCid(CID.parse(cid.toString()))
      return { cid: cid.toString(), status }
    },

    text: async (content: string): Promise<UploadResult> => {
      await this.initialize()
      const cid = await this.interfaces.strings!.add(content)
      const status = await this.pinCid(cid)
      return { cid: cid.toString(), status }
    },

    json: async (content: any): Promise<UploadResult> => {
      await this.initialize()
      const cid = await this.interfaces.json!.add(content)
      const status = await this.pinCid(cid)
      return { cid: cid.toString(), status }
    },

    directory: async (path: string, pattern: string = '**/*'): Promise<UploadResult> => {
      await this.initialize()

      if (typeof window !== 'undefined') {
        throw new Error('Directory uploads are only supported in Node.js environments')
      }

      try {
        const dirMap = new Map<string, CID>()
        const rootDir = await this.interfaces.fs!.addDirectory()
        dirMap.set('', CID.parse(rootDir.toString()))

        for await (const entry of globSource(path, pattern)) {
          const dirname = entry.path?.split('/').slice(0, -1).join('/')
          if (dirname && !dirMap.has(dirname)) {
            let parentCid = dirMap.get('')!
            for (const segment of dirname.split('/')) {
              const currentPath = dirname.split('/').slice(0, dirname.split('/').indexOf(segment) + 1).join('/')
              if (!dirMap.has(currentPath)) {
                const newDir = await this.interfaces.fs!.mkdir(parentCid, segment)
                dirMap.set(currentPath, CID.parse(newDir.toString()))
              }
              parentCid = dirMap.get(currentPath)!
            }
          }
        }

        for await (const entry of this.interfaces.fs!.addAll(globSource(path, pattern))) {
          if (entry.path) {
            const dirname = entry.path.split('/').slice(0, -1).join('/')
            const filename = entry.path.split('/').pop()!
            const parentCid = dirMap.get(dirname) ?? dirMap.get('')!
            const newCid = await this.interfaces.fs!.cp(entry.cid, parentCid, filename)
            dirMap.set(dirname, CID.parse(newCid.toString()))
          }
        }

        const rootCid = dirMap.get('')!
        const status = await this.pinCid(CID.parse(rootCid.toString()))
        return { cid: rootCid.toString(), status }
      } catch (error) {
        console.error(error)
        throw new Error(`Failed to add directory: ${error}`)
      }
    },

    files: async (files: File[]): Promise<FileArrayResult> => {
      await this.initialize()

      try {
        const fileResults = await Promise.all(
          files.map(async (file) => {
            const buffer = await file.arrayBuffer()
            const content = new Uint8Array(buffer)
            const cid = await this.interfaces.fs!.addBytes(content)
            return { name: file.name, cid }
          })
        )

        const dirCid = await this.interfaces.fs!.addDirectory()
        
        let currentDirCid = dirCid
        for (const file of fileResults) {
          currentDirCid = await this.interfaces.fs!.cp(file.cid, currentDirCid, file.name)
        }

        const status = await this.pinCid(CID.parse(currentDirCid.toString()))
        return {
          cid: currentDirCid.toString(),
          status,
          files: fileResults.map(f => ({ name: f.name, cid: f.cid.toString() }))
        }
      } catch (error) {
        throw new Error(`Failed to process files: ${error}`)
      }
    }
  }

  async initialize() {
    if (this.helia) return

    const libp2p = libp2pDefaults()
    libp2p.services = { ...libp2p.services }
    delete (libp2p.services as any).upnp

    this.helia = heliaWithRemotePins(await createHelia({
      libp2p,
    }), {
      endpointUrl: this.config.endpointUrl,
      accessToken: this.config.accessToken
    })

    this.interfaces.fs = unixfs(this.helia)
    this.interfaces.strings = strings(this.helia)
    this.interfaces.json = json(this.helia)
  }

  private async pinCid(cid: CID): Promise<'pinned' | 'failed'> {
    try {
      for await (const _ of this.helia.pins.add(cid, { signal: AbortSignal.timeout(30000) })) {
        // Generator needs to be consumed
      }
      return 'pinned'
    } catch (error) {
      console.log('Pinning failed', error)
      return 'failed'
    }
  }

  async stop() {
    if (this.helia) {
      await this.helia.stop()
    }
  }
}

export default IpfsPinner 