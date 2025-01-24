import {Args, Flags} from '@oclif/core'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../../base-command.js'
import {AuthService} from '../../../lib/auth-service.js'
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
    role: Flags.string({
      char: 'r',
      description: 'Role to manage (admin or user)',
      options: ['admin', 'user'],
      required: true,
    }),
    update: Flags.boolean({
      char: 'u',
      default: false,
      description: 'Update credentials',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Auth)
    const env = new EnvManager()
    const authService = new AuthService(env)

    try {
      const authFile = `auth/${flags.role}-htpasswd`
      const authFileExists = await fs
        .access(authFile)
        .then(() => true)
        .catch(() => false)

      // Show current credentials if not updating and auth file exists
      if (!flags.update && authFileExists) {
        const config = await env.readEnv()
        this.log('Current credentials:')
        if (flags.role === 'admin') {
          this.log(`Admin username: ${config.ADMIN_USERNAME || 'not set'}`)
          this.log(`Admin password: ${config.ADMIN_PASSWORD ? '********' : 'not set'}`)
        } else {
          this.log(`User username: ${config.USER_USERNAME || 'not set'}`)
          this.log(`User password: ${config.USER_PASSWORD ? '********' : 'not set'}`)
        }

        return
      }

      const authPassword = await authService.setupCredentials(flags.role as 'admin' | 'user', args)

      this.logSuccess(`${flags.role} credentials updated`)
      if (!args.password) {
        this.log(`Generated password: ${authPassword}`)
        this.log('This username and password have been saved to the .env file.')
      }
    } catch (error) {
      this.logError(`Failed to manage auth: ${(error as Error).message}`)
    }
  }
}
