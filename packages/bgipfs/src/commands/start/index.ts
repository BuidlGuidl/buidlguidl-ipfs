import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../base-command.js'
import {EnvManager} from '../../lib/env-manager.js'
import {checkRunningContainers} from '../../lib/system.js'

export default class Start extends BaseCommand {
  static description = 'Start IPFS cluster'

  static flags = {
    dns: Flags.boolean({
      default: false,
      description: 'Start in DNS mode with SSL',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Start)

    try {
      this.logInfo(`Starting IPFS cluster in ${flags.dns ? 'DNS' : 'IP'} mode...`)

      // Build compose file list first
      const composeFiles = ['docker-compose.yml']

      if (flags.dns) {
        composeFiles.push('docker-compose.dns.yml')
      }

      // Check all required files
      this.logInfo('Checking required files...')
      const requiredFiles = [
        ...composeFiles,
        '.env',
        'service.json',
        'identity.json',
        'htpasswd',
        flags.dns ? 'nginx.dns.conf' : 'nginx.ip.conf',
        ...(flags.dns ? ['nginx.dns.conf'] : []),
      ]

      for (const file of requiredFiles) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await fs.access(file)
          this.logSuccess(`Found ${file}`)
        } catch {
          this.logError(`Missing required file: ${file}`)
          return
        }
      }

      // Check for running containers
      const running = await checkRunningContainers()
      if (running.length > 0) {
        this.logError('Please stop all running containers first:\n' + running.join('\n'))
        return
      }

      // Check DNS mode requirements
      if (flags.dns) {
        this.logInfo('Checking DNS mode requirements...')
        const requiredFiles = ['docker-compose.dns.yml', 'nginx.dns.conf']
        for (const file of requiredFiles) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await fs.access(file)
            this.logSuccess(`Found ${file}`)
          } catch {
            this.logError(`Missing required file for DNS mode: ${file}`)
            return
          }
        }

        // Check SSL certificates
        this.logInfo('Checking SSL certificates...')
        try {
          await fs.access('data/certbot/conf')
          this.logSuccess('Found SSL certificates')
        } catch {
          this.logError("SSL certificates not found. Please run 'bgipfs ssl' first")
          return
        }
      }

      // Build compose command
      this.logInfo('Building Docker Compose configuration...')
      const composeCommand = ['compose', ...composeFiles.flatMap((f) => ['-f', f])]

      // Start containers
      this.logInfo('Starting Docker containers...')
      await execa('docker', [...composeCommand, 'up', '-d'])
      this.logSuccess('Containers started')

      // Wait for services to be healthy
      this.logInfo('Waiting for services to initialize (this may take a few moments)...')
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 10_000))

      // Check services in parallel
      const services = ['ipfs', 'cluster', 'nginx']
      this.logInfo('Checking service health...')
      const results = await Promise.all(
        services.map(async (service) => {
          this.log(`Checking ${service}...`)
          const isRunning = await this.checkContainerIsRunning(service)
          if (!isRunning) {
            const {stdout} = await execa('docker', [...composeCommand, 'logs', service])
            return {healthy: false, logs: stdout, service}
          }

          return {running: true, service}
        }),
      )

      // Report results
      let allRunning = true
      for (const result of results) {
        if (result.running) {
          this.logSuccess(`${result.service} is running `)
        } else {
          allRunning = false
          this.log(`=== ${result.service} logs ===\n${result.logs}`)
          this.logError(`${result.service} failed to start properly`)
        }
      }

      if (allRunning) {
        this.logSuccess('IPFS cluster started successfully')
        this.logInfo('You can now access:')
        if (flags.dns) {
          const env = new EnvManager()
          const config = await env.readEnv()
          this.log(`- IPFS Gateway: https://${config.GATEWAY_DOMAIN}`)
          this.log(`- Upload Interface: https://${config.UPLOAD_DOMAIN}`)
        } else {
          this.log('- IPFS Gateway: http://localhost:8080')
          this.log('- Cluster API: http://localhost:9094')
        }
      } else {
        throw new Error('Some services failed to start properly')
      }
    } catch (error) {
      this.logError(`Failed to start cluster: ${(error as Error).message}`)
    }
  }

  private async checkContainerIsRunning(service: string): Promise<boolean> {
    try {
      const {stdout} = await execa('docker', ['compose', 'ps', service, '--format', 'json'])
      const status = JSON.parse(stdout)
      return status.State === 'running'
    } catch {
      return false
    }
  }
}
