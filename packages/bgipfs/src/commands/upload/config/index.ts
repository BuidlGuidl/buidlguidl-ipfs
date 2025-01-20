import {Args} from '@oclif/core'
import {NodeUploaderConfig} from 'ipfs-uploader'
import {access, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../../base-command.js'

const DEFAULT_CONFIG: NodeUploaderConfig = {
  options: {
    headers: {},
    url: 'http://127.0.0.1:9095',
  },
}

const CONFIG_FILENAME = 'ipfs-upload.config.json'

export default class ConfigCommand extends BaseCommand {
  static args = {
    action: Args.string({
      description: 'Action to perform (init|get)',
      options: ['init', 'get'],
      required: true,
    }),
  }

  static description = 'Manage IPFS upload configuration'

  static examples = ['$ bgipfs upload config init', '$ bgipfs upload config get']

  async run(): Promise<void> {
    const {args} = await this.parse(ConfigCommand)

    switch (args.action) {
      case 'init': {
        await this.initConfig()
        break
      }

      case 'get': {
        await this.getConfig()
        break
      }

      default: {
        this.error(`Unknown action: ${args.action}`)
      }
    }
  }

  private async getConfig(): Promise<void> {
    const config = await this.readConfig()
    this.logInfo(JSON.stringify(config, null, 2))
  }

  private async initConfig(): Promise<void> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      await access(configFilePath)
      this.logError('Configuration file already exists')
    } catch {
      await writeFile(configFilePath, JSON.stringify(DEFAULT_CONFIG, null, 2))
      this.logSuccess('Configuration file initialized successfully')
    }
  }

  private async readConfig(): Promise<NodeUploaderConfig> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      const configContent = await readFile(configFilePath, 'utf8')
      return JSON.parse(configContent)
    } catch {
      this.logError('Configuration file not found. Run init command first.')
      throw new Error('Configuration file not found. Run init command first.')
    }
  }
}
