import { Options } from 'kubo-rpc-client'
import * as fs from 'node:fs/promises'

import { BaseCommand } from '../../../base-command.js'

interface IpfsConfig {
  destination: Options
  origin: Options
}

export default class SyncConfig extends BaseCommand {
  static description = 'Initialize IPFS sync configuration'

  static examples = [
    '<%= config.bin %> sync:config',
  ]

  async run(): Promise<void> {
    const defaultConfig: IpfsConfig = {
      destination: {
        headers: {
          Authorization: 'Basic <base64 encoded USER_USERNAME:USER_PASSWORD>',
        },
        url: 'http://localhost:5555',
      },
      origin: {
        url: 'http://localhost:5555',
      },
    }

    try {
      await fs.writeFile('ipfs-sync.config.json', JSON.stringify(defaultConfig, null, 2), 'utf8')
      this.logSuccess('Created ipfs-sync.config.json with default configuration')
      this.logInfo('Please edit the file with your IPFS node details')
      this.logInfo(
        'For the destination node, if using bgipfs, update Authorization with base64 encoded USER_USERNAME:USER_PASSWORD',
      )
      this.logInfo('You can find these credentials in your .env file')
    } catch (error) {
      this.logError('Failed to create config file: ' + (error as Error).message)
    }
  }
} 