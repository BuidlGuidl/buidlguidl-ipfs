import * as dotenv from 'dotenv'
import {promises as fs} from 'node:fs'
import {z} from 'zod'

import {type EnvConfig, envSchema} from './env-schema.js'

export interface EnvUpdate {
  key: keyof EnvConfig
  value: string
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

  createEmptyEnv(): z.infer<typeof envSchema> {
    return {
      AUTH_PASSWORD: '',
      AUTH_USER: '',
      PEERADDRESSES: '',
      PEERNAME: '',
      SECRET: '',
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
  async getEnvValue<K extends keyof EnvConfig>(key: K): Promise<EnvConfig[K]> {
    const env = await this.readEnv()
    return env[key]
  }

  async readEnv(): Promise<EnvConfig> {
    try {
      await this.ensureEnvFile()
      const content = await fs.readFile(this.filePath, 'utf8')
      const parsed = dotenv.parse(content)

      // Parse and validate with Zod
      const result = envSchema.safeParse(parsed)

      if (!result.success) {
        const formatted = result.error.format()
        throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted, null, 2)}`)
      }

      return result.data
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {} as EnvConfig
      }

      throw error
    }
  }

  async readRawEnv(): Promise<Partial<EnvConfig>> {
    try {
      await this.ensureEnvFile()
      const content = await fs.readFile(this.filePath, 'utf8')
      const parsed = dotenv.parse(content)

      // Validate each field individually and only keep valid ones
      const validEntries = Object.entries(envSchema.shape)
        .map(([key, schema]) => {
          const value = parsed[key]
          const result = schema.safeParse(value)
          return result.success ? [key, value] : null
        })
        .filter((entry): entry is [string, string] => entry !== null)

      return Object.fromEntries(validEntries) as Partial<EnvConfig>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }

      throw error
    }
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

    // Validate only our known properties
    const result = envSchema.safeParse(newEnv)
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
