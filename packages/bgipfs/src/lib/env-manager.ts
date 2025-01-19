import * as dotenv from 'dotenv'
import {promises as fs} from 'node:fs'

import {type BaseConfig, type DnsConfig, baseSchema, dnsSchema} from './env-schema.js'

export interface EnvUpdate {
  key: keyof BaseConfig
  value: string
}

interface ReadEnvOptions {
  partial?: boolean
  schema?: typeof baseSchema | typeof dnsSchema
}

export class EnvManager {
  private filePath: string

  constructor(filePath = '.env') {
    this.filePath = filePath
  }

  async appendNewline(): Promise<void> {
    const content = await fs.readFile(this.filePath, 'utf8')
    if (!content.endsWith('\n')) {
      await fs.appendFile(this.filePath, '\n')
    }
  }

  async ensureEnvFile(): Promise<void> {
    try {
      await fs.access(this.filePath)
    } catch {
      await fs.writeFile(this.filePath, '')
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath)
      return true
    } catch {
      return false
    }
  }

  // Helper to get typed env values
  async getEnvValue<K extends keyof BaseConfig>(key: K, options: ReadEnvOptions = {}): Promise<BaseConfig[K]> {
    const env = await this.readEnv(options)
    return env[key]
  }

  async readEnv(
    options: ReadEnvOptions = {},
  ): Promise<BaseConfig | DnsConfig | Partial<BaseConfig> | Partial<DnsConfig>> {
    await this.ensureEnvFile()
    const content = await fs.readFile(this.filePath, 'utf8')
    const parsed = dotenv.parse(content)

    // Use provided schema or default to base schema
    const selectedSchema = options.schema || baseSchema
    // Make schema partial if requested
    const schema = options.partial ? selectedSchema.partial() : selectedSchema

    const result = schema.safeParse(parsed)

    if (!result.success) {
      const formatted = result.error.format()
      throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted, null, 2)}`)
    }

    return result.data
  }

  async readRawEnv(): Promise<Record<string, string>> {
    await this.ensureEnvFile()
    const content = await fs.readFile(this.filePath, 'utf8')
    return dotenv.parse(content)
  }

  async updateEnv(updates: EnvUpdate[]): Promise<void> {
    await this.ensureEnvFile()

    // Get current raw env including unknown properties
    const content = await fs.readFile(this.filePath, 'utf8')
    const currentEnv = dotenv.parse(content)

    // Apply updates
    const newEnv = {
      ...currentEnv, // Preserve all existing values including unknown ones
      ...Object.fromEntries(updates.map(({key, value}) => [key, value])),
    }

    // Validate with base schema
    const result = baseSchema.safeParse(newEnv)
    if (!result.success) {
      throw new Error(`Invalid environment update: ${JSON.stringify(result.error.format(), null, 2)}`)
    }

    // Write back to file preserving all properties
    const newContent = Object.entries(newEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    await fs.writeFile(this.filePath, newContent + '\n')

    // Reload environment variables
    dotenv.config({override: true, path: this.filePath})
  }
}
