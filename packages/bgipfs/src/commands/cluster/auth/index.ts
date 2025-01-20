import {input, password} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {execa} from 'execa'
import {randomBytes} from 'node:crypto'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../../base-command.js'
import {EnvManager} from '../../../lib/env-manager.js'

export default class Auth extends BaseCommand {
  static args = {
    password: Args.string({
      description: 'Password for authentication',
      required: false,
    }),
    username: Args.string({
      description: 'Username for authentication',
      required: false,
    }),
  }

  static description = 'Manage authentication credentials'

  static flags = {
    update: Flags.boolean({
      char: 'u',
      default: false,
      description: 'Update credentials',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Auth)
    const env = new EnvManager()

    try {
      // Show current credentials if not updating
      if (!flags.update) {
        const config = await env.readEnv()
        this.log('Current credentials:')
        this.log(`Username: ${config.AUTH_USER || 'not set'}`)
        this.log(`Password: ${config.AUTH_PASSWORD ? '********' : 'not set'}`)
        return
      }

      // Update credentials
      const username =
        args.username ||
        (await input({
          default: 'admin',
          message: 'Enter new username (press enter to use "admin")',
        }))

      const authPassword = (args.password ||
        (await password({
          message: 'Enter new password (press enter to generate)',
        }).then((p) => p || this.generateSecret()))) as string

      // Update env file and htpasswd
      await env.updateEnv([
        {key: 'AUTH_USER', value: username},
        {key: 'AUTH_PASSWORD', value: authPassword},
      ])
      await this.createAuthFile(username, authPassword)

      this.logSuccess('Authentication credentials updated')
      if (!args.password) {
        this.log(`Generated password: ${authPassword}`)
        this.log('Please save this password - it will not be shown again')
      }
    } catch (error) {
      this.logError(`Failed to manage auth: ${(error as Error).message}`)
    }
  }

  private async createAuthFile(username: string, password: string): Promise<void> {
    const htpasswd = `${username}:${await execa('openssl', ['passwd', '-apr1', password]).then((r) => r.stdout)}`
    await fs.writeFile('htpasswd', htpasswd)
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex')
  }
}
