import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../base-command.js'
import {EnvManager} from '../../lib/env-manager.js'

export default class Ssl extends BaseCommand {
  static description = "Generate SSL certificates using Let's Encrypt"

  static flags = {
    staging: Flags.boolean({
      default: false,
      description: 'Use staging environment for testing',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Ssl)

    try {
      // Check DNS mode requirements
      this.logInfo('Checking DNS mode requirements...')
      const requiredFiles = ['docker-compose.dns.yml', 'nginx.dns.conf']
      for (const file of requiredFiles) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await fs.access(file)
        } catch {
          this.logError(`Missing required file: ${file}`)
          return
        }
      }

      // Read environment variables
      const env = new EnvManager()
      const config = await env.readEnv()

      if (!config.GATEWAY_DOMAIN || !config.UPLOAD_DOMAIN) {
        this.logError('GATEWAY_DOMAIN and UPLOAD_DOMAIN must be set in .env')
        return
      }

      // Build certbot command
      const domains = [config.GATEWAY_DOMAIN, config.UPLOAD_DOMAIN]
      const certbotArgs: string[] = [
        'run',
        '--rm',
        '-v',
        `${process.cwd()}/data/certbot/conf:/etc/letsencrypt`,
        '-v',
        `${process.cwd()}/data/certbot/www:/var/www/certbot`,
        'certbot/certbot',
        'certonly',
        '--webroot',
        '--webroot-path=/var/www/certbot',
        `--email=${config.ADMIN_EMAIL || ''}`,
        '--agree-tos',
        '--no-eff-email',
        ...(flags.staging ? ['--staging'] : []),
        ...domains.flatMap((domain): string[] => ['-d', domain]),
      ]

      // Run certbot
      this.logInfo(`Generating ${flags.staging ? 'staging ' : ''}certificates...`)
      await execa('docker', certbotArgs, {stdio: 'inherit'})

      this.logSuccess('SSL certificates generated successfully')
      this.logInfo('You can now start the cluster in DNS mode with:')
      this.log('  bgipfs start --dns')
    } catch (error) {
      this.logError(`Failed to generate certificates: ${(error as Error).message}`)
    }
  }
}
