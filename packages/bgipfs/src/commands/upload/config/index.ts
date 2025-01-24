import {Args, Flags} from '@oclif/core'
import {KuboOptions, UploaderConfig} from 'ipfs-uploader'
import {access, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../../base-command.js'

const DEFAULT_CONFIG: KuboOptions = {
  headers: {},
  url: 'http://127.0.0.1:5001',
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

  static flags = {
    nodeAuth: Flags.string({
      char: 'a',
      description: 'Node authorization header',
      required: false,
    }),
    nodeUrl: Flags.string({
      char: 'u',
      description: 'Node URL',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConfigCommand)

    switch (args.action) {
      case 'init': {
        const config = DEFAULT_CONFIG
        if (flags.nodeUrl) {
          config.url = flags.nodeUrl
        }

        if (flags.nodeAuth) {
          config.headers = {Authorization: flags.nodeAuth}
        }

        await this.initConfig(config)
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

  private async initConfig(config: UploaderConfig): Promise<void> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      await access(configFilePath)
      this.logWarning(`Configuration file already exists at ${CONFIG_FILENAME}, update it instead`)
    } catch {
      await writeFile(configFilePath, JSON.stringify(config, null, 2))
      this.logSuccess('Configuration file initialized successfully')
    }
  }

  private async readConfig(): Promise<UploaderConfig> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      const configContent = await readFile(configFilePath, 'utf8')
      return JSON.parse(configContent)
    } catch {
      this.logError('Configuration file not found. Run upload init command first.')
      throw new Error('Configuration file not found. Run upload init command first.')
    }
  }
}
