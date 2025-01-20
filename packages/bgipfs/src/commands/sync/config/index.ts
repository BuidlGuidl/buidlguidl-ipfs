import { Command } from '@oclif/core'
import { Options } from 'kubo-rpc-client'
import * as fs from 'node:fs/promises'

interface IpfsConfig {
  destination: Options
  origin: Options
}

export default class SyncConfig extends Command {
  static description = 'Initialize IPFS sync configuration'

  static examples = [
    '<%= config.bin %> sync:config',
  ]

  async run(): Promise<void> {
    const defaultConfig: IpfsConfig = {
      destination: {
        headers: {
          Authorization: `Basic <base64 encoded auth>`,
        },
        url: 'http://localhost:5555',
      },
      origin: {
        url: 'http://localhost:5555',
      },
    }

    try {
      await fs.writeFile(
        'ipfs-sync.config.json',
        JSON.stringify(defaultConfig, null, 2),
        'utf8'
      )
      this.log('Created ipfs-sync.config.json with default configuration')
      this.log('Please edit the file with your IPFS node details')
    } catch (error) {
      this.error('Failed to create config file: ' + (error as Error).message)
    }
  }
} 