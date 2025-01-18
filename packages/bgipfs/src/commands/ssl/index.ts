import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'
import {z} from 'zod'

import {BaseCommand} from '../../base-command.js'
import {EnvManager} from '../../lib/env-manager.js'
import {envSchema} from '../../lib/env-schema.js'

export default class Ssl extends BaseCommand {
  static description = "Generate SSL certificates using Let's Encrypt, required for DNS mode"

  static flags = {
    staging: Flags.boolean({
      default: false,
      description: 'Use staging environment for testing',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Ssl)

    try {
      const env = new EnvManager()
      const config = await env.readEnv()
      const updates = []

      // Only prompt for email if not set and user wants notifications
      if (!config.ADMIN_EMAIL) {
        const useEmail = await this.confirm('Would you like to receive certificate expiry notifications?')
        if (useEmail) {
          const email = await input({
            message: 'Enter admin email for SSL notifications',
            validate: (value) => this.validateInput(envSchema.shape.ADMIN_EMAIL, value),
          })
          updates.push({key: 'ADMIN_EMAIL', value: email})
          config.ADMIN_EMAIL = email
        }
      }

      // Domains are required
      if (!config.GATEWAY_DOMAIN || !config.UPLOAD_DOMAIN) {
        this.logInfo('Domain configuration required for SSL certificates')

        if (!config.GATEWAY_DOMAIN) {
          const domain = await input({
            message: 'Enter gateway domain (e.g. gateway.example.com)',
            validate: (value) => this.validateInput(envSchema.shape.GATEWAY_DOMAIN, value),
          })
          updates.push({key: 'GATEWAY_DOMAIN', value: domain})
          config.GATEWAY_DOMAIN = domain
        }

        if (!config.UPLOAD_DOMAIN) {
          const domain = await input({
            message: 'Enter upload domain (e.g. upload.example.com)',
            validate: (value) => this.validateInput(envSchema.shape.UPLOAD_DOMAIN, value),
          })
          updates.push({key: 'UPLOAD_DOMAIN', value: domain})
          config.UPLOAD_DOMAIN = domain
        }
      }

      // Update env if needed
      if (updates.length > 0) {
        await env.updateEnv(updates)
      }

      const domains = [config.GATEWAY_DOMAIN, config.UPLOAD_DOMAIN]

      // Create certbot nginx config
      await this.createCertbotConf(domains.join(' '))

      // Start temporary nginx for ACME challenge
      this.logInfo('Starting temporary nginx server for domain verification...')
      const nginxArgs = [
        'run',
        '-d',
        '--rm',
        '--name',
        'certbot-nginx',
        '-p',
        '80:80',
        '-v',
        `${process.cwd()}/certbot.conf:/etc/nginx/conf.d/default.conf:ro`,
        '-v',
        `${process.cwd()}/data/certbot/www:/var/www/certbot`,
        'nginx:alpine',
      ]

      await execa('docker', nginxArgs)
      this.logSuccess('Temporary nginx server started')

      try {
        // Run certbot for each domain
        for (const domain of domains) {
          this.logInfo(`Generating certificates for ${domain}...`)
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
            ...(config.ADMIN_EMAIL ? ['--email', config.ADMIN_EMAIL] : ['--register-unsafely-without-email']),
            '--agree-tos',
            '--no-eff-email',
            ...(flags.staging ? ['--staging'] : []),
            '-d',
            domain,
          ]

          // eslint-disable-next-line no-await-in-loop
          await execa('docker', certbotArgs, {stdio: 'inherit'})
        }
      } finally {
        // Stop temporary nginx
        this.logInfo('Stopping temporary nginx server...')
        await execa('docker', ['stop', 'certbot-nginx']).catch(() => {
          // Ignore stop errors
        })
        // Clean up certbot.conf
        await fs.unlink('certbot.conf').catch(() => {})
      }

      this.logSuccess('SSL certificates generated successfully')
      this.logInfo('You can now start the cluster in DNS mode with:')
      this.log('  bgipfs start --dns')
    } catch (error) {
      this.logError(`Failed to generate certificates: ${(error as Error).message}`)
    }
  }

  private async createCertbotConf(domain: string): Promise<void> {
    const conf = `server {
    listen 80;
    server_name ${domain};
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}`
    await fs.writeFile('certbot.conf', conf)
  }

  private validateInput(schema: z.ZodType, value: string): string | true {
    const result = schema.safeParse(value)
    return result.success ? true : result.error.errors[0].message
  }
}
