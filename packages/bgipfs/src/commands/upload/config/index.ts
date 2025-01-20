import {Args, Flags} from '@oclif/core'
import {IpfsNodeOptions} from 'ipfs-uploader'
import {access, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../../base-command.js'

const DEFAULT_CONFIG: IpfsNodeOptions = {
  headers: {},
  url: 'http://127.0.0.1:9095',
}

const CONFIG_FILENAME = 'ipfs-upload.config.json'

interface ConfigFlags {
  header?: string[]
  path?: string
  url?: string
}

export default class ConfigCommand extends BaseCommand {
  static args = {
    action: Args.string({
      description: 'Action to perform (init|get|set)',
      options: ['init', 'get', 'set'],
      required: true,
    }),
  }

  static description = 'Manage IPFS upload configuration'

  static examples = [
    '$ bgipfs upload config init',
    '$ bgipfs upload config init --path ./custom/path',
    '$ bgipfs upload config set --url http://localhost:5001',
    '$ bgipfs upload config set --header "Authorization=Basic xxxxx"',
    '$ bgipfs upload config get',
  ]

  static flags = {
    header: Flags.string({
      description: 'Add header (format: key=value)',
      multiple: true,
      required: false,
    }),
    path: Flags.string({
      char: 'p',
      description: 'Custom path for config file',
      required: false,
    }),
    url: Flags.string({
      description: 'IPFS node URL',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = (await this.parse(ConfigCommand)) as {
      args: {action: string}
      flags: ConfigFlags
    }

    switch (args.action) {
      case 'init': {
        await this.initConfig(flags.path)
        break
      }

      case 'get': {
        await this.getConfig(flags.path)
        break
      }

      case 'set': {
        await this.setConfig(flags)
        break
      }

      default: {
        this.error(`Unknown action: ${args.action}`)
      }
    }
  }

  private async getConfig(configPath?: string): Promise<void> {
    const config = await this.readConfig(configPath)
    this.logInfo(JSON.stringify(config, null, 2))
  }

  private async initConfig(configPath?: string): Promise<void> {
    const targetPath = configPath || process.cwd()
    const configFilePath = join(targetPath, CONFIG_FILENAME)

    try {
      await access(configFilePath)
      this.logError('Configuration file already exists')
    } catch {
      await this.writeConfig(DEFAULT_CONFIG, configPath)
      this.logSuccess('Configuration file initialized successfully')
    }
  }

  private async readConfig(configPath?: string): Promise<IpfsNodeOptions> {
    const targetPath = configPath || process.cwd()
    const configFilePath = join(targetPath, CONFIG_FILENAME)

    try {
      const configContent = await readFile(configFilePath, 'utf8')
      return JSON.parse(configContent)
    } catch {
      this.logError('Configuration file not found. Run init command first.')
      throw new Error('Configuration file not found. Run init command first.')
    }
  }

  private async setConfig(flags: ConfigFlags): Promise<void> {
    const config = await this.readConfig(flags.path)
    const updates: Partial<IpfsNodeOptions> = {}

    if (flags.url) {
      updates.url = flags.url
    }

    if (flags.header) {
      const headers: Record<string, string> = {}
      for (const header of flags.header) {
        const [key, value] = header.split('=')
        if (!key || !value) {
          this.error(`Invalid header format: ${header}. Use key=value format`)
        }

        headers[key] = value
      }

      updates.headers = {...config.headers, ...headers}
    }

    const updatedConfig = {
      ...config,
      ...updates,
    }

    await this.writeConfig(updatedConfig, flags.path)
    this.logSuccess('Configuration updated successfully')
  }

  private async writeConfig(config: IpfsNodeOptions, configPath?: string): Promise<void> {
    const targetPath = configPath || process.cwd()
    const configFilePath = join(targetPath, CONFIG_FILENAME)
    await writeFile(configFilePath, JSON.stringify(config, null, 2))
  }
}
