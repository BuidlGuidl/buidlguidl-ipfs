import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {randomBytes} from 'node:crypto'
import fs from 'node:fs/promises'
import {z} from 'zod'

import {BaseCommand} from '../../../base-command.js'
import {EnvManager} from '../../../lib/env-manager.js'
import {baseSchema} from '../../../lib/env-schema.js'
import {checkDocker, checkRunningContainers} from '../../../lib/system.js'
import {TemplateManager} from '../../../lib/templates.js'

export default class Init extends BaseCommand {
  static description = 'Set up the necessary configuration for IPFS Cluster'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description:
        'Force configuration: stop running containers, overwrite templates, and skip prompts if valid env exists',
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
      if (flags.force) {
        await execa('docker', ['compose', 'stop'])
      } else {
        this.logError('Please stop all running containers first:\n' + running.join('\n'))
        return
      }
    }

    try {
      await this.setupConfiguration(templates, flags.force)
      const currentEnv = await this.readCurrentEnv(env)
      const envValues = await this.collectEnvValues(flags, currentEnv)
      await env.updateEnv(envValues)

      // Create auth file
      await this.createAuthFile(
        envValues.find((v) => v.key === 'AUTH_USER')!.value,
        envValues.find((v) => v.key === 'AUTH_PASSWORD')!.value,
      )

      await this.initializeCluster()

      this.logSuccess('Configuration completed successfully!')
      this.logInfo('Your configuration is in .env')
      this.logInfo('Your cluster identity is in identity.json')
      this.logInfo('Your cluster service configuration is in service.json')
      this.logInfo('You can now start the cluster with `bgipfs start`')
    } catch (error) {
      this.logError(`Configuration failed: ${(error as Error).message}`)
    } finally {
      // Cleanup
      try {
        await fs.unlink('docker-compose.override.yml').catch(() => {})
      } catch (error) {
        this.logError(`Cleanup failed: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  private async collectEnvValues(
    flags: {force: boolean},
    currentEnv: {
      AUTH_PASSWORD: string
      AUTH_USER: string
      PEERADDRESSES: string
      PEERNAME: string
      SECRET: string
    },
  ) {
    const peername =
      flags.force && currentEnv.PEERNAME
        ? currentEnv.PEERNAME
        : await input({
            default: currentEnv.PEERNAME || 'peer-0',
            message: 'Enter peer name',
          })

    let secret =
      flags.force && currentEnv.SECRET
        ? currentEnv.SECRET
        : await input({
            default: currentEnv.SECRET,
            message: "Enter the cluster's secret (leave blank to generate a new one)",
            validate: (value) => this.validateSecretInput(value),
          })

    if (!secret) {
      secret = this.generateSecret()
      this.logSuccess('Generated secret: ' + secret)
    }

    const peerAddresses = await this.getPeerAddresses(flags, currentEnv)
    const {authPassword, authUser} = await this.getAuthCredentials(flags, currentEnv)

    return [
      {key: 'PEERNAME', value: peername},
      {key: 'SECRET', value: secret},
      {key: 'PEERADDRESSES', value: peerAddresses || ''},
      {key: 'AUTH_USER', value: authUser},
      {key: 'AUTH_PASSWORD', value: authPassword},
    ]
  }

  private async copyFileIfNotEmpty(source: string, dest: string): Promise<boolean> {
    const stats = await fs.stat(source)
    if (stats.size === 0) {
      return false
    }

    await fs.copyFile(source, dest)
    return true
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

  private async generatePassword(): Promise<string> {
    try {
      const {stdout} = await execa('openssl', ['rand', '-base64', '32'])
      return stdout.trim()
    } catch {
      // Fall back to Node.js crypto if openssl fails
      return this.generateSecret()
    }
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex')
  }

  private async getAuthCredentials(flags: {force: boolean}, currentEnv: {AUTH_PASSWORD: string; AUTH_USER: string}) {
    const authUser =
      flags.force && currentEnv.AUTH_USER
        ? currentEnv.AUTH_USER
        : await input({
            default: currentEnv.AUTH_USER || 'admin',
            message: 'Enter authentication username',
          })

    let authPassword =
      flags.force && currentEnv.AUTH_PASSWORD
        ? currentEnv.AUTH_PASSWORD
        : await input({
            default: currentEnv.AUTH_PASSWORD,
            message: 'Enter authentication password (leave blank to generate a new one)',
            validate: (value) => {
              if (value === '') return true
              return this.validateInput(baseSchema.shape.AUTH_PASSWORD, value)
            },
          })

    if (!authPassword) {
      authPassword = await this.generatePassword()
      this.logSuccess('Generated password: ' + authPassword)
    }

    return {authPassword, authUser}
  }

  private async getPeerAddresses(flags: {force: boolean}, currentEnv: {PEERADDRESSES: string}): Promise<string> {
    return flags.force
      ? currentEnv.PEERADDRESSES
      : // eslint-disable-next-line no-return-await
        await input({
          default: currentEnv.PEERADDRESSES || '',
          message:
            'Enter peer addresses\nComma-separated, format: /dns4/{ip-or-domain}/tcp/9096/ipfs/{peerid}\nLeave blank if this is the first node in the cluster.',
          validate: (value) => this.validateInput(baseSchema.shape.PEERADDRESSES, value),
        })
  }

  private async initializeCluster(): Promise<void> {
    this.logInfo('Initializing IPFS cluster...')
    this.logInfo('Removing data/ipfs-cluster/service.json file if it exists...')
    await fs.unlink('data/ipfs-cluster/service.json').catch(() => {
      // File doesn't exist, that's fine
    })

    let hasIdentity = await fs
      .access('identity.json')
      .then(() => true)
      .catch(() => false)

    if (!hasIdentity) {
      const hasDataIdentity = await fs
        .access('data/ipfs-cluster/identity.json')
        .then(() => true)
        .catch(() => false)

      if (hasDataIdentity) {
        const useDataIdentity = await this.confirm('data/ipfs-cluster/identity.json already exists, use it?')
        if (useDataIdentity) {
          const copied = await this.copyFileIfNotEmpty('data/ipfs-cluster/identity.json', 'identity.json')
          if (copied) {
            hasIdentity = true
          } else {
            this.logInfo('data/ipfs-cluster/identity.json was empty, skipping copy and deleting it')
            await fs.unlink('data/ipfs-cluster/identity.json')
          }
        }
      }
    }

    try {
      if (hasIdentity) {
        this.logInfo('Starting IPFS cluster docker containers with existing identity file...')

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
        this.logInfo('Starting IPFS cluster docker containers without identity file...')
        await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'up', '-d', '--quiet-pull'])
      }

      // Wait for initialization
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Copy identity and service files if they don't exist
      if (!hasIdentity) {
        const identityCopied = await this.copyFileIfNotEmpty('data/ipfs-cluster/identity.json', 'identity.json')
        if (!identityCopied) {
          this.logError('Failed to copy identity.json, cluster initialization failed')
          return
        }
      }

      const identityJson = JSON.parse(await fs.readFile('identity.json', 'utf8'))
      this.logInfo(`Cluster Peer ID: ${identityJson.id}`)

      const serviceCopied = await this.copyFileIfNotEmpty('data/ipfs-cluster/service.json', 'service.json')
      if (!serviceCopied) {
        this.logError('Failed to copy service.json, cluster initialization failed')
        return
      }

      // Copy IPFS config if it doesn't exist
      const hasIpfsConfig = await fs
        .access('ipfs.config.json')
        .then(() => true)
        .catch(() => false)

      if (hasIpfsConfig) {
        this.logWarning('Using existing ipfs.config.json, delete and re-run `bgipfs cluster config` to regenerate')
      } else {
        const ipfsConfigCopied = await this.copyFileIfNotEmpty('data/ipfs/config', 'ipfs.config.json')
        if (!ipfsConfigCopied) {
          this.logError('Failed to copy IPFS config, initialization failed')
          return
        }

        this.logSuccess('IPFS config copied successfully')
      }

      this.logSuccess('Configuration files copied successfully')
    } catch (error) {
      // Show container logs on error
      this.logWarning('Initialization failed, showing container logs:')
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

  private async readCurrentEnv(env: EnvManager): Promise<{
    AUTH_PASSWORD: string
    AUTH_USER: string
    PEERADDRESSES: string
    PEERNAME: string
    SECRET: string
  }> {
    const defaultEnv = {
      AUTH_PASSWORD: '',
      AUTH_USER: 'admin',
      PEERADDRESSES: '',
      PEERNAME: '',
      SECRET: '',
    }

    return fs
      .access('.env')
      .then(async () => {
        try {
          const envValues = await env.readEnv({partial: true})
          return {...defaultEnv, ...envValues}
        } catch (error) {
          if (error instanceof Error && error.message.includes('Invalid environment configuration')) {
            this.logWarning('Found invalid values in .env file, will preserve raw entries')
          }

          const rawEnv = await env.readRawEnv()
          return {...defaultEnv, ...rawEnv}
        }
      })
      .catch(() => defaultEnv)
  }

  private async setupConfiguration(templates: TemplateManager, force: boolean): Promise<void> {
    this.logInfo('Installing required configuration files...')
    const redownload =
      force ||
      (await this.confirm(
        'Do you want to redownload Cluster configuration & Docker Compose? (You will be prompted to overwrite any local changes)',
      ))
    if (redownload) {
      await templates.copyAllTemplates(force)
    }

    this.logInfo('Setting up environment...')
  }

  private validateInput(schema: z.ZodType, value: string): string | true {
    const result = schema.safeParse(value)
    return result.success ? true : result.error.errors[0].message
  }

  private validateSecretInput(value: string): string | true {
    if (value === '') return true
    return this.validateInput(baseSchema.shape.SECRET, value)
  }
}
