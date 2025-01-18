import {input} from '@inquirer/prompts'
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

  static flags = {}

  static hooks = {
    postrun: ['init-cleanup'],
  }

  async run(): Promise<void> {
    const env = new EnvManager()
    const templates = new TemplateManager()

    // Check for running containers
    await checkDocker()
    const running = await checkRunningContainers()
    if (running.length > 0) {
      this.logError('Please stop all running containers first:\n' + running.join('\n'))
      return
    }

    try {
      // Ask about redownloading configuration files
      const shouldRedownload = await this.confirm(
        'Do you want to redownload Cluster configuration, Docker Compose & nginx files? (This will overwrite any local changes)',
      )

      // Copy template files if user agrees
      if (shouldRedownload) {
        this.logInfo('Installing configuration files...')
        await templates.copyAllTemplates(true)
      }

      // Initialize environment
      this.logInfo('Initializing environment...')
      await env.ensureEnvFile()

      // Get current peername from env if it exists
      const currentEnv = await env.readEnv()
      const currentPeername = currentEnv.PEERNAME

      // Get peer name
      const peername = await input({
        default: currentPeername || 'cluster0',
        message: 'Enter peer name',
      })

      // Ask if first node
      const isFirstNode = await this.confirm('Is this the first node in the cluster?')
      const hasExistingSecret = Boolean(currentEnv.SECRET)

      let secret: string
      switch (`${isFirstNode ? 'first' : 'subsequent'}-${hasExistingSecret ? 'existing' : 'new'}`) {
        case 'first-existing': {
          const keepSecret = await this.confirm(`Do you want to keep using the existing secret?\n${currentEnv.SECRET}`)
          secret = keepSecret ? currentEnv.SECRET : this.generateSecret()
          break
        }

        case 'first-new': {
          secret = this.generateSecret()
          break
        }

        case 'subsequent-existing': {
          secret = await input({
            default: currentEnv.SECRET,
            message: "Enter the cluster's secret",
            validate: (value) => this.validateInput(envSchema.shape.SECRET, value),
          })
          break
        }

        case 'subsequent-new': {
          secret = await input({
            message: "Enter the cluster's secret",
            validate: (value) => this.validateInput(envSchema.shape.SECRET, value),
          })
          break
        }

        default: {
          throw new Error('Unexpected case for secret generation')
        }
      }

      // Get peer addresses with validation
      const peerAddresses = isFirstNode
        ? ''
        : await input({
            default: currentEnv.PEERADDRESSES || '',
            message: 'Enter peer addresses (comma-separated)',
            validate: (value) => this.validateInput(envSchema.shape.PEERADDRESSES, value),
          })

      // Get auth credentials
      const authUser = await input({
        default: currentEnv.AUTH_USER || 'admin',
        message: 'Enter authentication username',
      })

      const authPassword = await input({
        default: currentEnv.AUTH_PASSWORD || this.generateSecret(),
        message: 'Enter authentication password',
        validate: (value) => this.validateInput(envSchema.shape.AUTH_PASSWORD, value),
      })

      await env.updateEnv([
        {key: 'PEERNAME', value: peername},
        {key: 'SECRET', value: secret},
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
        // await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'down'])

        await fs.unlink('docker-compose.override.yml').catch(() => {})
      } catch (error) {
        // Ignore cleanup errors
        this.logError(`Cleanup failed: ${error instanceof Error ? error.message : error}`)
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

    // Check if service.json exists and has content
    try {
      const serviceStats = await fs.stat('data/ipfs-cluster/service.json')
      if (serviceStats.size === 0) {
        this.logInfo('Removing empty service.json file...')
        await fs.unlink('data/ipfs-cluster/service.json')
      }
    } catch {
      // File doesn't exist or can't be accessed, which is fine
    }

    // Start init containers
    this.logInfo('Initializing IPFS cluster...')
    try {
      if (hasIdentity) {
        this.logInfo('identity.json already exists.')

        // Create override file for existing identity
        await fs.writeFile(
          'docker-compose.override.yml',
          `services:
  cluster:
    volumes:
      - ./identity.json:/data/ipfs-cluster/identity.json`,
        )

        // Start containers with identity file mounted
        await execa('docker', [
          'compose',
          '-f',
          'init.docker-compose.yml',
          '-f',
          'docker-compose.override.yml',
          'up',
          '-d',
          '--quiet-pull',
        ])

        // Clean up override file
        await fs.unlink('docker-compose.override.yml')
      } else {
        // Start containers without identity file
        await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'up', '-d', '--quiet-pull'])
      }

      // Wait for initialization
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Copy identity and service files if they don't exist
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
