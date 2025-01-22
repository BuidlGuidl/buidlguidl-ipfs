import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../../base-command.js'
import {EnvManager} from '../../../lib/env-manager.js'
import {DnsConfig, dnsSchema} from '../../../lib/env-schema.js'
import {checkRunningContainers} from '../../../lib/system.js'

export default class Start extends BaseCommand {
  static description = 'Start IPFS cluster'

  static examples = ['bgipfs cluster start', 'bgipfs cluster start --mode dns']

  static flags = {
    mode: Flags.string({
      char: 'm',
      default: 'ip',
      description: 'Cluster mode: ip (default) or dns (with Cloudflare proxy)',
      options: ['ip', 'dns'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Start)

    try {
      this.logInfo(`Starting IPFS cluster in ${flags.mode.toUpperCase()} mode...`)

      // Update IPFS config in DNS mode
      if (flags.mode === 'dns') {
        try {
          const env = (await new EnvManager().readEnv({schema: dnsSchema})) as DnsConfig
          await this.updateIpfsConfig(env.GATEWAY_DOMAIN)
        } catch (error) {
          this.logError(`Failed to process IPFS config: ${(error as Error).message}`)
          return
        }
      }

      // Build compose file list
      const composeFiles = ['docker-compose.yml']
      if (flags.mode === 'dns') {
        this.logInfo('Using DNS mode config')
        composeFiles.push('docker-compose.dns.yml')
      }

      this.logInfo(`Using compose files: ${composeFiles.join(', ')}`)

      // Check required files
      const requiredFiles = [...composeFiles, '.env', 'service.json', 'identity.json', 'htpasswd', 'ipfs.config.json']

      // Check all required files
      this.logInfo('Checking required files...')
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
        this.logInfo('The following containers are running:\n' + running.join('\n'))
        this.logError('You must stop the cluster with `bgipfs stop` before starting it again')
        return
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
      const services = ['traefik', 'ipfs', 'cluster']
      this.logInfo('Checking service health...')
      const results = await Promise.all(
        services.map(async (service) => {
          this.logInfo(`Checking ${service}...`)
          const isRunning = await this.checkContainerIsRunning(service)
          // Get logs for all services regardless of status
          const {stdout} = await execa('docker', [...composeCommand, 'logs', '--tail', '5', service])

          return {
            logs: stdout,
            running: isRunning,
            service,
          }
        }),
      )

      // Report results
      let allRunning = true
      for (const result of results) {
        if (result.running) {
          this.logSuccess(`${result.service} is running`)
        } else {
          allRunning = false
          this.logError(`${result.service} failed to start properly`)
        }

        this.log(`=== ${result.service} recent logs ===\n${result.logs}\n`)
      }

      if (allRunning) {
        this.logSuccess('IPFS cluster started successfully')
        this.logInfo('You can now access:')

        const config =
          flags.mode === 'ip'
            ? undefined
            : ((await new EnvManager().readEnv({
                partial: false,
                schema: dnsSchema,
              })) as DnsConfig)

        const urls = this.getEndpointUrls(flags.mode, config)
        this.log(`- IPFS Gateway: ${urls.gateway}`)
        this.log(`- Upload Endpoint: ${urls.upload}`)

        if (flags.mode === 'dns') {
          this.logInfo('\nEnsure Cloudflare is configured with:')
          this.log('1. DNS records pointing to your server IP')
          this.log('2. Proxy status enabled (orange cloud)')
          this.log('3. SSL/TLS set to Flexible or Full')
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

  private getEndpointUrls(mode: string, config?: DnsConfig) {
    const isSecure = mode !== 'ip'
    const protocol = isSecure ? 'https://' : 'http://'

    if (mode !== 'ip' && config) {
      return {
        gateway: `${protocol}${config.GATEWAY_DOMAIN}`,
        upload: `${protocol}${config.UPLOAD_DOMAIN}`,
      }
    }

    return {
      gateway: 'http://localhost:8080',
      upload: 'http://localhost:5555',
    }
  }

  private async updateIpfsConfig(gatewayDomain: string): Promise<void> {
    const configPath = 'ipfs.config.json'
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
    const publicGateways = config.Gateway.PublicGateways || {}

    // Check for existing gateways
    const gatewayDomains = Object.keys(publicGateways)
    if (gatewayDomains.length > 0) {
      this.logInfo('Found existing gateway configurations:')
      for (const domain of gatewayDomains) {
        this.logInfo(`- ${domain}`)
      }
    }

    // Add our gateway if not present
    if (!publicGateways[gatewayDomain]) {
      this.logWarning('Adding DNS gateway configuration...')
      this.logInfo(`Setting gateway domain: ${gatewayDomain}`)

      config.Gateway.PublicGateways = {
        ...publicGateways,
        [gatewayDomain]: {
          Paths: ['/ipfs', '/ipns'],
          UseSubdomains: true,
        },
      }

      await fs.writeFile(configPath, JSON.stringify(config, null, 2))
      this.logSuccess('IPFS config updated')
    }
  }
}
