import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'
import path from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {getBgipfsIpfsConfigPolicy} from '../../../lib/bgipfs-owned-keys.js'
import {backupIpfsConfig, mergeIpfsConfig, readIpfsConfig, readIpfsRepoVersion, writeIpfsConfig} from '../../../lib/ipfs-config.js'
import {checkRunningContainers, getContainerVersions} from '../../../lib/system.js'
import Restart from '../restart/index.js'
import Start from '../start/index.js'

export default class Update extends BaseCommand {
  static description = 'Update IPFS, IPFS Cluster, and key cluster dependencies'

  static examples = [
    'bgipfs cluster update',
    'bgipfs cluster update --no-backup',
    'bgipfs cluster update --backup-dir ./my-backup',
    'bgipfs cluster update --ipfs-version v0.39.0 --cluster-version v1.1.6',
  ]

  static flags = {
    'backup-data': Flags.boolean({
      default: false,
      description: 'Also back up data/ipfs and data/ipfs-cluster before updating (can be very large)',
    }),
    'backup-dir': Flags.string({
      description: 'Directory to store backup (defaults to ./backup_YYYYMMDD_HHMMSS)',
    }),
    'cluster-version': Flags.string({
      default: 'v1.1.6',
      description: 'IPFS Cluster Docker tag to use',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force update: skip confirmation prompts',
    }),
    'ipfs-version': Flags.string({
      default: 'v0.41.0',
      description: 'Kubo Docker tag to use',
    }),
    'no-backup': Flags.boolean({
      default: false,
      description: 'Skip creating a backup before updating',
    }),
    'skip-compose-update': Flags.boolean({
      default: false,
      description: 'Do not update managed Docker image tags in docker-compose.yml',
    }),
    'traefik-version': Flags.string({
      default: 'v3.6.1',
      description: 'Traefik Docker tag to use',
    }),
  }

  // eslint-disable-next-line complexity
  async run(): Promise<void> {
    const {flags} = await this.parse(Update)

    try {
      await this.preflight()

      // Check if services are running
      const running = await checkRunningContainers()
      const isRunning = running.length > 0

      // Get current versions if services are running
      let currentVersions: {cluster: string; ipfs: string} | undefined
      if (isRunning) {
        try {
          currentVersions = await getContainerVersions()
          this.logInfo(`Current versions:
  IPFS: ${currentVersions.ipfs}
  IPFS Cluster: ${currentVersions.cluster}`)
        } catch (error) {
          this.logWarning(`Failed to get current versions: ${(error as Error).message}`)
        }
      }

      // Confirm update
      if (!flags.force) {
        const shouldUpdate = await this.confirm(
          'Are you sure you want to update? This will require restarting the IPFS cluster.',
        )
        if (!shouldUpdate) {
          this.logInfo('Update cancelled')
          return
        }
      }

      // Handle backup
      if (!flags['no-backup']) {
        const backupDir =
          flags['backup-dir'] || `backup_${new Date().toISOString().replaceAll(/[.:]/g, '').slice(0, 15)}`

        if (flags.force) {
          await this.createBackup(backupDir, flags['backup-data'])
        } else {
          const shouldBackup = await this.confirm(
            `Would you like to create a backup before updating? (Will be stored in ${backupDir})`,
          )
          if (shouldBackup) {
            await this.createBackup(backupDir, flags['backup-data'])
          } else {
            this.logInfo('Skipping backup')
          }
        }
      }

      const usesConfigBindMount = !flags['skip-compose-update'] && (await this.usesIpfsConfigBindMount())
      if (!flags['skip-compose-update']) {
        const ipfsConfigPath = usesConfigBindMount ? 'ipfs.config.json' : await this.getLiveIpfsConfigPath()
        await this.migrateIpfsConfig(flags['ipfs-version'], ipfsConfigPath)
      }

      if (usesConfigBindMount) {
        await this.stageIpfsConfigForUnmountedRepo()
      }

      const composeChanged = flags['skip-compose-update']
        ? false
        : await this.updateManagedImageTags({
          clusterVersion: flags['cluster-version'],
          ipfsVersion: flags['ipfs-version'],
          traefikVersion: flags['traefik-version'],
        })

      const beforeImages = await this.getComposeImageIds()
      const beforeRunningImages = isRunning ? await this.getRunningServiceImageIds() : new Map<string, string>()

      // Pull latest images first
      this.logInfo('Pulling latest images...')
      await execa('docker', ['compose', 'pull'])

      const afterImages = await this.getComposeImageIds()
      const afterServiceImages = await this.getComposeServiceImageIds()
      this.logImageChanges(beforeImages, afterImages)
      const runningImagesOutdated = isRunning && this.hasRunningImageMismatch(beforeRunningImages, afterServiceImages)

      // Check if versions changed
      if (
        isRunning &&
        !(await this.checkVersions(currentVersions, beforeImages, afterImages, composeChanged || runningImagesOutdated))
      ) {
        return
      }

      // Restart or start services
      if (isRunning) {
        this.logInfo('Restarting services with new versions...')
        await Restart.run(['--force'])
      } else {
        this.logInfo('Starting services with new versions...')
        await Start.run([])
      }

      this.logSuccess('IPFS cluster updated successfully')
      await this.verifyUpdatedCluster()
      if (usesConfigBindMount) {
        await this.archiveLegacyIpfsConfig()
      }

      if (!flags['no-backup'] && !flags.force) {
        this.logInfo(`A backup was created in: ${flags['backup-dir'] || 'backup_*'}`)
      }
    } catch (error) {
      this.logError(`Update failed: ${(error as Error).message}`)
      if (!flags['no-backup'] && !flags.force) {
        this.logInfo('A backup was created before the update attempt')
      }
    }
  }

  private async archiveLegacyIpfsConfig(): Promise<void> {
    const legacyPath = 'ipfs.config.json'
    const hasLegacyConfig = await fs
      .access(legacyPath)
      .then(() => true)
      .catch(() => false)

    if (!hasLegacyConfig) {
      return
    }

    const archivePath = `${legacyPath}.legacy-${new Date().toISOString().replaceAll(/[.:]/g, '-')}`
    await fs.rename(legacyPath, archivePath)
    this.logInfo(`Archived legacy exported IPFS config to ${archivePath}`)
    this.logInfo('The live Kubo config is now data/ipfs/config')
  }

  private async checkVersions(
    currentVersions?: {cluster: string; ipfs: string},
    beforeImages?: Map<string, string>,
    afterImages?: Map<string, string>,
    restartNeeded = false,
  ): Promise<boolean> {
    const imagesChanged =
      beforeImages &&
      afterImages &&
      [...afterImages].some(([image, imageId]) => beforeImages.get(image) && beforeImages.get(image) !== imageId)

    try {
      const newVersions = await getContainerVersions()
      if (currentVersions) {
        const ipfsUpdated = newVersions.ipfs !== currentVersions.ipfs
        const clusterUpdated = newVersions.cluster !== currentVersions.cluster

        if (!ipfsUpdated && !clusterUpdated) {
          if (!imagesChanged && !restartNeeded) {
            this.logInfo('No updates available - already running latest versions')
            return false
          }

          this.logInfo('Restarting to apply updated image configuration')
        }

        if (ipfsUpdated || clusterUpdated) {
          this.logInfo(`New versions available:
  IPFS: ${currentVersions.ipfs} -> ${newVersions.ipfs}
  IPFS Cluster: ${currentVersions.cluster} -> ${newVersions.cluster}`)
        }
      }

      return true
    } catch (error) {
      this.logWarning(`Failed to check new versions: ${(error as Error).message}`)
      return true // Continue with update if version check fails
    }
  }

  private async createBackup(backupDir: string, includeData: boolean): Promise<void> {
    // Check if backup directory exists
    try {
      await fs.access(backupDir)
      this.logError(`Backup directory ${backupDir} already exists`)
      return
    } catch {
      // Directory doesn't exist, which is what we want
    }

    this.logInfo('Creating backup before update...')
    await fs.mkdir(backupDir, {recursive: true})

    // Large blockstores should be backed up with volume snapshots in production.
    const itemsToBackup = [
      {dest: 'ipfs.config.json', optional: true, src: 'ipfs.config.json'},
      {dest: 'data/ipfs/config', optional: true, src: 'data/ipfs/config'},
      {dest: 'service.json', src: 'service.json'},
      {dest: 'identity.json', src: 'identity.json'},
      {dest: 'auth', src: 'auth'},
    ]
    const dataItemsToBackup = [
      {dest: 'ipfs', src: 'data/ipfs'},
      {dest: 'ipfs-cluster', src: 'data/ipfs-cluster'},
    ]
    const allItemsToBackup = includeData ? [...dataItemsToBackup, ...itemsToBackup] : itemsToBackup

    if (!includeData) {
      this.logInfo('Skipping data/ipfs and data/ipfs-cluster backup; use --backup-data or an EBS snapshot for data')
    }

    // Copy each item
    for (const item of allItemsToBackup) {
      try {
        this.logInfo(`Backing up ${item.src}...`)
        // eslint-disable-next-line no-await-in-loop
        await fs.mkdir(path.dirname(path.join(backupDir, item.dest)), {recursive: true})
        // eslint-disable-next-line no-await-in-loop
        await fs.cp(item.src, path.join(backupDir, item.dest), {recursive: true})
        this.logSuccess(`Successfully backed up ${item.src}`)
      } catch (error) {
        if ('optional' in item && item.optional) {
          this.logInfo(`Skipping missing optional backup item ${item.src}`)
          continue
        }

        throw new Error(`Failed to backup ${item.src}: ${(error as Error).message}`)
      }
    }
  }

  private async getComposeImageIds(): Promise<Map<string, string>> {
    const {stdout} = await execa('docker', ['compose', 'config', '--images'])
    const images = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const result = new Map<string, string>()
    await Promise.all(
      images.map(async (image) => {
        try {
          const {stdout: imageId} = await execa('docker', ['image', 'inspect', image, '--format', '{{.Id}}'])
          result.set(image, imageId.trim())
        } catch {
          result.set(image, 'not-present')
        }
      }),
    )

    return result
  }

  private async getComposeServiceImageIds(): Promise<Map<string, string>> {
    const {stdout} = await execa('docker', ['compose', 'config', '--format', 'json'])
    const config = JSON.parse(stdout) as {services: Record<string, {image?: string}>}
    const serviceImages = new Map<string, string>()

    await Promise.all(
      Object.entries(config.services).map(async ([service, config]) => {
        if (!config.image) {
          return
        }

        try {
          const {stdout: imageId} = await execa('docker', ['image', 'inspect', config.image, '--format', '{{.Id}}'])
          serviceImages.set(service, imageId.trim())
        } catch {
          serviceImages.set(service, 'not-present')
        }
      }),
    )

    return serviceImages
  }

  private async getLiveIpfsConfigPath(): Promise<string> {
    const repoConfigPath = 'data/ipfs/config'
    const hasRepoConfig = await fs
      .access(repoConfigPath)
      .then(() => true)
      .catch(() => false)

    return hasRepoConfig ? repoConfigPath : 'ipfs.config.json'
  }

  private async getRunningServiceImageIds(): Promise<Map<string, string>> {
    const {stdout} = await execa('docker', ['compose', 'ps', '--format', 'json'])
    const containers = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as {ID: string; Service: string})

    const serviceImages = new Map<string, string>()
    await Promise.all(
      containers.map(async (container) => {
        const {stdout: imageId} = await execa('docker', ['inspect', container.ID, '--format', '{{.Image}}'])
        serviceImages.set(container.Service, imageId.trim())
      }),
    )

    return serviceImages
  }

  private getTargetRepoVersion(ipfsVersion: string): number | undefined {
    const match = ipfsVersion.match(/^v?(\d+)\.(\d+)\.(\d+)/)
    if (!match) {
      return undefined
    }

    const [, major, minor] = match.map(Number)
    return major > 0 || minor >= 38 ? 18 : undefined
  }

  private hasRunningImageMismatch(
    runningServiceImages: Map<string, string>,
    desiredServiceImages: Map<string, string>,
  ): boolean {
    let hasMismatch = false

    for (const [service, desiredImageId] of desiredServiceImages) {
      const runningImageId = runningServiceImages.get(service)
      if (runningImageId && runningImageId !== desiredImageId) {
        this.logInfo(`${service}: running image differs from compose target`)
        hasMismatch = true
      }
    }

    return hasMismatch
  }

  private logImageChanges(beforeImages: Map<string, string>, afterImages: Map<string, string>): void {
    for (const [image, afterId] of afterImages) {
      const beforeId = beforeImages.get(image)
      if (!beforeId) {
        this.logInfo(`${image}: newly tracked`)
      } else if (beforeId === 'not-present' && afterId !== 'not-present') {
        this.logSuccess(`${image}: pulled`)
      } else if (beforeId === afterId) {
        this.logInfo(`${image}: unchanged`)
      } else {
        this.logSuccess(`${image}: updated`)
      }
    }
  }

  private async migrateIpfsConfig(ipfsVersion: string, configPath: string): Promise<void> {
    const config = await readIpfsConfig(configPath)
    const repoVersion = this.getTargetRepoVersion(ipfsVersion) ?? (await readIpfsRepoVersion())
    const policy = getBgipfsIpfsConfigPolicy(config, repoVersion)
    const migrated = mergeIpfsConfig(config, policy.ownedKeys, policy.removedKeys)

    if (JSON.stringify(config) === JSON.stringify(migrated)) {
      this.logInfo('IPFS config is already compatible with the target Kubo version')
      return
    }

    const backupPath = await backupIpfsConfig(configPath)
    await writeIpfsConfig(migrated, configPath)
    this.logSuccess(`Migrated IPFS config for target Kubo version; backup saved to ${backupPath}`)
  }

  private async preflight(): Promise<void> {
    await execa('docker', ['compose', 'version'])
    await fs.access('docker-compose.yml')
  }

  private removeIpfsConfigBindMount(compose: string): string {
    return compose
      .split('\n')
      .filter((line) => line.trim() !== '- ./ipfs.config.json:/data/ipfs/config:ro')
      .join('\n')
  }

  private replaceServiceImage(compose: string, service: string, image: string): string {
    const lines = compose.split('\n')
    const servicePattern = new RegExp(`^  ${service}:\\s*$`)

    const serviceStart = lines.findIndex((line) => servicePattern.test(line))
    if (serviceStart === -1) {
      throw new Error(`Could not find ${service} service in docker-compose.yml`)
    }

    for (let index = serviceStart + 1; index < lines.length; index++) {
      if (/^ {2}[\w-]+:\s*$/.test(lines[index])) {
        break
      }

      if (/^ {4}image:\s*/.test(lines[index])) {
        lines[index] = `    image: ${image}`
        return lines.join('\n')
      }
    }

    throw new Error(`Could not find image for ${service} service in docker-compose.yml`)
  }

  private async stageIpfsConfigForUnmountedRepo(): Promise<void> {
    try {
      await fs.copyFile('ipfs.config.json', 'data/ipfs/config')
      this.logSuccess('Staged ipfs.config.json into data/ipfs/config')
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'EACCES' && nodeError.code !== 'EPERM') {
        throw error
      }

      throw new Error(
        'Cannot write data/ipfs/config with the current host user. Run this command, then retry the update:\n' +
          'sudo install -m 0644 -o "$(stat -c %u data/ipfs)" -g "$(stat -c %g data/ipfs)" ipfs.config.json data/ipfs/config',
      )
    }
  }

  private async updateManagedImageTags(versions: {
    clusterVersion: string
    ipfsVersion: string
    traefikVersion: string
  }): Promise<boolean> {
    const composePath = 'docker-compose.yml'
    const original = await fs.readFile(composePath, 'utf8')
    let updated = original

    updated = this.replaceServiceImage(updated, 'ipfs', `ipfs/kubo:${versions.ipfsVersion}`)
    updated = this.replaceServiceImage(updated, 'cluster', `ipfs/ipfs-cluster:${versions.clusterVersion}`)
    updated = this.replaceServiceImage(updated, 'traefik', `traefik:${versions.traefikVersion}`)
    updated = this.removeIpfsConfigBindMount(updated)

    if (updated === original) {
      this.logInfo('Docker image tags are already up to date')
      return false
    }

    const backupPath = `${composePath}.${new Date().toISOString().replaceAll(/[.:]/g, '-')}.bak`
    await fs.copyFile(composePath, backupPath)
    await fs.writeFile(composePath, updated)
    this.logSuccess(`Updated managed Docker image tags in ${composePath}`)
    this.logInfo(`Previous compose file saved to ${backupPath}`)
    return true
  }

  private async usesIpfsConfigBindMount(): Promise<boolean> {
    const compose = await fs.readFile('docker-compose.yml', 'utf8')
    return compose.split('\n').some((line) => line.trim() === '- ./ipfs.config.json:/data/ipfs/config:ro')
  }

  private async verifyUpdatedCluster(): Promise<void> {
    const running = await checkRunningContainers()
    for (const service of ['ipfs', 'cluster']) {
      if (!running.some((container) => container.includes(service))) {
        throw new Error(`${service} container is not running after update`)
      }
    }

    const versions = await getContainerVersions()
    this.logSuccess(`Running IPFS ${versions.ipfs} and IPFS Cluster ${versions.cluster}`)
  }
}
