import {input, password} from '@inquirer/prompts'
import {execa} from 'execa'
import {randomBytes} from 'node:crypto'
import {promises as fs} from 'node:fs'

import {EnvManager} from './env-manager.js'

const DEFAULT_OPTIONS = {save: true as boolean} as const

export class AuthService {
  constructor(private env: EnvManager) {}

  async createAuthFile(username: string, password: string, role: string): Promise<void> {
    const htpasswd = `${username}:${await execa('openssl', ['passwd', '-apr1', password]).then((r) => r.stdout)}`
    await fs.writeFile(`auth/${role}-htpasswd`, htpasswd)
  }

  async setupCredentials(
    role: 'admin' | 'user',
    args?: {password?: string; username?: string},
    options: typeof DEFAULT_OPTIONS = DEFAULT_OPTIONS,
  ): Promise<{password: string; username: string}> {
    const username =
      args?.username ||
      (await input({
        default: role === 'admin' ? 'admin' : 'user',
        message: `Enter new ${role} username`,
      }))

    const authPassword = (args?.password ||
      (await password({
        message: `Enter new ${role} password (press enter to generate)`,
      }).then((p) => p || this.generatePassword()))) as string

    // Create auth directory if it doesn't exist
    await fs.mkdir('auth', {recursive: true})

    if (options.save) {
      // Update env file and htpasswd
      await this.env.updateEnv([
        {key: `${role.toUpperCase()}_USERNAME`, value: username},
        {key: `${role.toUpperCase()}_PASSWORD`, value: authPassword},
      ])
    }

    await this.createAuthFile(username, authPassword, role)

    return {password: authPassword, username}
  }

  private async generatePassword(): Promise<string> {
    try {
      const {stdout} = await execa('openssl', ['rand', '-base64', '32'])
      return stdout.trim()
    } catch {
      // Fall back to Node.js crypto if openssl fails
      return randomBytes(32).toString('hex')
    }
  }
}
