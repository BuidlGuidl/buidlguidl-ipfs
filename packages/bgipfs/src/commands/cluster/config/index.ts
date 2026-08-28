import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {randomBytes} from 'node:crypto'
import fs from 'node:fs/promises'
import {z} from 'zod'

import {BaseCommand} from '../../../base-command.js'
import {AuthService} from '../../../lib/auth-service.js'
import {getBgipfsIpfsConfigPolicy} from '../../../lib/bgipfs-owned-keys.js'
import {usesIpfsConfigBindMount} from '../../../lib/compose-file.js'
import {EnvManager} from '../../../lib/env-manager.js'
import {baseSchema} from '../../../lib/env-schema.js'
import {
  type IpfsConfigChange,
  backupIpfsConfig,
  computeIpfsConfigChanges,
  getLiveIpfsConfigPath,
  mergeIpfsConfig,
  readIpfsConfig,
  readIpfsRepoVersion,
  writeIpfsConfig,
} from '../../../lib/ipfs-config.js'
import {checkDocker, checkRunningContainers} from '../../../lib/system.js'
import {TemplateManager} from '../../../lib/templates.js'

type ConfigMode = 'all' | 'environment' | 'initialization' | 'ipfs' | 'templates'

export default class Init extends BaseCommand {
  static description = 'Set up the necessary configuration for IPFS Cluster'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description:
        'Force configuration: stop running containers, overwrite templates, and skip prompts if valid env exists',
    }),
    'ipfs-dry-run': Flags.boolean({
      default: false,
      description: 'Preview IPFS config changes without writing them',
    }),
    mode: Flags.string({
      char: 'm',
      default: 'all',
      description: 'Configuration mode to run',
      options: ['templates', 'environment', 'initialization', 'ipfs', 'all'],
    }),
  }

  static hooks = {
    postrun: ['init-cleanup'],
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Init)
    const env = new EnvManager()
    const templates = new TemplateManager()

    const mode = flags.mode as ConfigMode
    if (flags['ipfs-dry-run'] && mode !== 'ipfs') {
      this.logError('--ipfs-dry-run only applies with --mode ipfs')
      return
    }

    const shouldRunTemplates = this.modeIncludes(mode, 'templates')
    const shouldRunEnvironment = this.modeIncludes(mode, 'environment')
    const shouldRunInitialization = this.modeIncludes(mode, 'initialization')
    const shouldRunIpfs = this.modeIncludes(mode, 'ipfs')

    // Docker is only required for the initialization flow.
    if (shouldRunInitialization) {
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
    }

    try {
      // Step 1: Templates
      if (shouldRunTemplates) {
        this.logInfo('Installing required configuration files...')
        this.logInfo('Checking for required files, you will be prompted to overwrite any local changes')
        await templates.copyAllTemplates(flags.force)
      }

      // Step 2: Environment
      if (shouldRunEnvironment) {
        this.logInfo('Setting up environment...')
        const currentEnv = await this.readCurrentEnv(env)
        const envValues = await this.collectEnvValues(flags, currentEnv)
        await env.updateEnv(envValues)
      }

      // Step 3: Initialization
      if (shouldRunInitialization) {
        await this.initializeCluster(flags.force)
      }

      // Step 4: IPFS config
      if (shouldRunIpfs) {
        await this.configureIpfsConfig(flags.force, flags['ipfs-dry-run'])
      }

      this.logSuccess('Configuration completed successfully!')
      if (shouldRunTemplates) {
        this.logInfo('Your docker-compose files have been updated')
      }

      if (shouldRunEnvironment) {
        this.logInfo('Your configuration is in .env')
      }

      if (shouldRunInitialization) {
        this.logInfo('Your cluster identity is in identity.json')
        this.logInfo('Your cluster service configuration is in service.json')
        this.logInfo('Your live IPFS daemon configuration is in data/ipfs/config')
        if (await usesIpfsConfigBindMount()) {
          this.logInfo('Your legacy bind-mounted IPFS daemon configuration is in ipfs.config.json')
        }

        this.logInfo('You can now start the cluster with `bgipfs cluster start`')
      } else if (shouldRunIpfs) {
        this.logInfo('Restart the cluster with `bgipfs cluster restart` for IPFS config changes to take effect')
      } else if (shouldRunTemplates || shouldRunEnvironment) {
        this.logInfo('You may need to restart the cluster with `bgipfs cluster restart` for changes to take effect')
      }
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
      ADMIN_PASSWORD: string
      ADMIN_USERNAME: string
      PEERADDRESSES: string
      PEERNAME: string
      SECRET: string
      USER_PASSWORD: string
      USER_USERNAME: string
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

    // Initialize auth service
    const authService = new AuthService(new EnvManager())

    // Set up admin credentials first
    const adminCreds = await authService.setupCredentials(
      'admin',
      {
        password: currentEnv.ADMIN_PASSWORD,
        username: currentEnv.ADMIN_USERNAME,
      },
      {force: flags.force, save: false},
    )

    // Then set up user credentials
    const userCreds = await authService.setupCredentials(
      'user',
      {
        password: currentEnv.USER_PASSWORD,
        username: currentEnv.USER_USERNAME,
      },
      {force: flags.force, save: false},
    )

    this.logSuccess(`Admin password for ${adminCreds.username}: ${adminCreds.password}`)
    this.logSuccess(`User password for ${userCreds.username}: ${userCreds.password}`)

    return [
      {key: 'PEERNAME', value: peername},
      {key: 'SECRET', value: secret},
      {key: 'PEERADDRESSES', value: peerAddresses || ''},
      {key: 'ADMIN_USERNAME', value: adminCreds.username},
      {key: 'ADMIN_PASSWORD', value: adminCreds.password},
      {key: 'USER_USERNAME', value: userCreds.username},
      {key: 'USER_PASSWORD', value: userCreds.password},
    ]
  }

  private async configureIpfsConfig(force: boolean, dryRun: boolean): Promise<void> {
    this.logInfo('Checking IPFS daemon configuration...')

    const liveConfigPath = await getLiveIpfsConfigPath()
    const config = await readIpfsConfig(liveConfigPath)
    const repoVersion = await readIpfsRepoVersion()
    const policy = getBgipfsIpfsConfigPolicy(config, repoVersion)
    const changes = computeIpfsConfigChanges(config, policy.ownedKeys, policy.removedKeys)

    if (changes.length === 0) {
      this.logSuccess(`${liveConfigPath} is already current`)
      return
    }

    this.logInfo('The following bgipfs-owned IPFS config keys will be updated:')
    this.log(this.formatIpfsConfigChanges(changes))

    if (dryRun) {
      this.logInfo('Dry run complete; no files were changed')
      return
    }

    if (!force) {
      const shouldUpdate = await this.confirm('Apply these IPFS config changes?')
      if (!shouldUpdate) {
        this.logInfo('IPFS config update cancelled')
        return
      }
    }

    const backupPath = await backupIpfsConfig(liveConfigPath)
    const merged = mergeIpfsConfig(config, policy.ownedKeys, policy.removedKeys)
    await writeIpfsConfig(merged, liveConfigPath)

    this.logSuccess(`Backed up ${liveConfigPath} to ${backupPath}`)
    this.logSuccess('IPFS config updated')
  }

  private async copyFileIfNotEmpty(source: string, dest: string): Promise<boolean> {
    const stats = await fs.stat(source)
    if (stats.size === 0) {
      return false
    }

    await fs.copyFile(source, dest)
    return true
  }

  private async copyWithConfirmation(
    sourcePath: string,
    destPath: string,
    force: boolean,
    description: string,
  ): Promise<boolean> {
    const hasFile = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false)

    if (!hasFile) {
      const copied = await this.copyFileIfNotEmpty(sourcePath, destPath)
      if (!copied) {
        this.logError(`Failed to copy ${description}, initialization failed`)
        return false
      }

      this.logSuccess(`${description} copied successfully`)
      return true
    }

    if (force) {
      const copied = await this.copyFileIfNotEmpty(sourcePath, destPath)
      if (!copied) {
        this.logError(`Failed to copy ${description}, initialization failed`)
        return false
      }

      this.logWarning(`${description} forcefully overwritten`)
      return true
    }

    const shouldOverwrite = await this.confirm(`${description} already exists. Would you like to overwrite it?`)
    if (shouldOverwrite) {
      const copied = await this.copyFileIfNotEmpty(sourcePath, destPath)
      if (!copied) {
        this.logError(`Failed to copy ${description}, initialization failed`)
        return false
      }

      this.logSuccess(`${description} overwritten successfully`)
      return true
    }

    this.logInfo(`Using existing ${description}`)
    return true
  }

  private formatConfigValue(value: unknown): string {
    return value === undefined ? '<unset>' : JSON.stringify(value)
  }

  private formatIpfsConfigChanges(changes: IpfsConfigChange[]): string {
    return changes
      .map(
        ({key, nextValue, previousValue, type}) =>
          type === 'remove'
            ? `- ${key}: remove ${this.formatConfigValue(previousValue)}`
            : `- ${key}: ${this.formatConfigValue(previousValue)} -> ${this.formatConfigValue(nextValue)}`,
      )
      .join('\n')
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex')
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

  private async initializeCluster(force: boolean): Promise<void> {
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

      // Handle service.json
      const serviceSuccess = await this.copyWithConfirmation(
        'data/ipfs-cluster/service.json',
        'service.json',
        force,
        'service.json',
      )
      if (!serviceSuccess) return

      if (await usesIpfsConfigBindMount()) {
        // Older compose files bind-mount this exported config into the Kubo repo.
        const ipfsSuccess = await this.copyWithConfirmation(
          'data/ipfs/config',
          'ipfs.config.json',
          force,
          'ipfs.config.json',
        )
        if (!ipfsSuccess) return
      } else {
        this.logSuccess('Live IPFS config is available at data/ipfs/config')
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

  private modeIncludes(mode: ConfigMode, target: Exclude<ConfigMode, 'all'>): boolean {
    return mode === 'all' || mode === target || (mode === 'initialization' && target === 'ipfs')
  }

  private async readCurrentEnv(env: EnvManager): Promise<{
    ADMIN_PASSWORD: string
    ADMIN_USERNAME: string
    PEERADDRESSES: string
    PEERNAME: string
    SECRET: string
    USER_PASSWORD: string
    USER_USERNAME: string
  }> {
    const defaultEnv = {
      ADMIN_PASSWORD: '',
      ADMIN_USERNAME: 'admin',
      PEERADDRESSES: '',
      PEERNAME: '',
      SECRET: '',
      USER_PASSWORD: '',
      USER_USERNAME: 'user',
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

  private validateInput(schema: z.ZodType, value: string): string | true {
    const result = schema.safeParse(value)
    return result.success ? true : result.error.errors[0].message
  }

  private validateSecretInput(value: string): string | true {
    if (value === '') return true
    return this.validateInput(baseSchema.shape.SECRET, value)
  }
}
