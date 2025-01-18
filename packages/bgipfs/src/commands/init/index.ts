import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {randomBytes} from 'node:crypto'
import fs from 'node:fs/promises'
import {z} from 'zod'

import {BaseCommand} from '../../base-command.js'
import {EnvManager} from '../../lib/env-manager.js'
import {envSchema} from '../../lib/env-schema.js'
import {checkDocker, checkRunningContainers} from '../../lib/system.js'
import {TemplateManager} from '../../lib/templates.js'

export default class Init extends BaseCommand {
  static description = 'Initialize IPFS configuration'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force reinitialization',
    }),
  }

  static hooks = {
    postrun: ['init-cleanup'],
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Init)
    const env = new EnvManager()
    const templates = new TemplateManager()

    // Check for running containers
    await checkDocker()
    const running = await checkRunningContainers()
    if (running.length > 0) {
      this.logError('Please stop all running containers first:\n' + running.join('\n'))
      return
    }

    // Check for existing config
    const exists = await env.exists()
    if (exists && !flags.force) {
      this.logError('Configuration already exists. Use --force to reinitialize.')
      return
    }

    try {
      // Copy template files
      this.logInfo('Installing configuration files...')
      await templates.copyAllTemplates(flags.force)

      // Initialize environment
      this.logInfo('Initializing environment...')
      await env.ensureEnvFile()

      // Get peer name
      const peername = await input({
        default: 'cluster0',
        message: 'Enter peer name',
      })

      // Ask if first node
      const isFirstNode = await this.confirm('Is this the first node in the cluster?')

      // Get peer addresses with validation
      const peerAddresses = isFirstNode
        ? ''
        : await input({
            default: '',
            message: 'Enter peer addresses (comma-separated)',
            validate: (value) => this.validateInput(envSchema.shape.PEERADDRESSES, value),
          })

      const authUser = 'admin'
      const authPassword = this.generateSecret()

      await env.updateEnv([
        {key: 'PEERNAME', value: peername},
        {
          key: 'SECRET',
          value: isFirstNode
            ? this.generateSecret()
            : await input({
                message: "Enter the cluster's secret",
                validate: (value) => this.validateInput(envSchema.shape.SECRET, value),
              }),
        },
        {key: 'PEERADDRESSES', value: peerAddresses},
        {key: 'AUTH_USER', value: authUser},
        {key: 'AUTH_PASSWORD', value: authPassword},
      ])

      // Create auth file
      await this.createAuthFile(authUser, authPassword)

      await this.initializeCluster()

      this.logSuccess('Configuration initialized successfully')
    } catch (error) {
      this.logError(`Initialization failed: ${(error as Error).message}`)
    } finally {
      // Cleanup
      try {
        await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'down'])

        await fs.unlink('docker-compose.override.yml').catch(() => {})
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async createAuthFile(username: string, password: string): Promise<void> {
    try {
      // Create htpasswd file using openssl (same as auth.sh)
      const htpasswd = `${username}:${await execa('openssl', ['passwd', '-apr1', password]).then((r) => r.stdout)}`
      await fs.writeFile('htpasswd', htpasswd)
      this.logSuccess('Created authentication file')
    } catch (error) {
      throw new Error(`Failed to create auth file: ${(error as Error).message}`)
    }
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex')
  }

  private async initializeCluster(): Promise<void> {
    const hasIdentity = await fs
      .access('identity.json')
      .then(() => true)
      .catch(() => false)

    // Start init containers
    this.logInfo('Initializing IPFS cluster...')
    try {
      if (hasIdentity) {
        await fs.writeFile(
          'docker-compose.override.yml',
          `services:
  cluster:
    volumes:
      - ./identity.json:/data/ipfs-cluster/identity.json`,
        )
      }

      await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'up', '-d'])

      // Wait for initialization
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Copy identity and service files
      if (!hasIdentity) {
        await fs.copyFile('data/ipfs-cluster/identity.json', 'identity.json')
      }

      const identityJson = JSON.parse(await fs.readFile('identity.json', 'utf8'))
      this.logInfo(`Peer ID: ${identityJson.id}`)

      await fs.copyFile('data/ipfs-cluster/service.json', 'service.json')

      this.logSuccess('IPFS cluster initialized')
    } catch (error) {
      // Show container logs on error
      this.logError('Initialization failed, showing container logs:')
      this.log('=== Cluster Container Logs ===')
      try {
        const {stdout} = await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'logs', 'cluster'])
        this.log(stdout)
      } catch {
        this.logError('Failed to retrieve container logs')
      }

      throw error
    }
  }

  private validateInput(schema: z.ZodType, value: string): string | true {
    const result = schema.safeParse(value)
    return result.success ? true : result.error.errors[0].message
  }
}
