import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

import {BaseCommand} from '../../../base-command.js'
import {getBgipfsIpfsConfigPolicy} from '../../../lib/bgipfs-owned-keys.js'
import {
  isValidDockerTag,
  removeIpfsConfigBindMount,
  replaceServiceImage,
  usesIpfsConfigBindMount,
} from '../../../lib/compose-file.js'
import {
  LEGACY_IPFS_CONFIG_PATH,
  REPO_IPFS_CONFIG_PATH,
  backupIpfsConfig,
  getLiveIpfsConfigPath,
  getTargetRepoVersion,
  ipfsConfigWritePermissionHint,
  mergeIpfsConfig,
  readIpfsConfig,
  readIpfsRepoVersion,
  writeIpfsConfig,
} from '../../../lib/ipfs-config.js'
import {checkRunningContainers, getContainerVersions} from '../../../lib/system.js'
import Restart from '../restart/index.js'
import Start from '../start/index.js'

const VERSION_FLAGS = ['cluster-version', 'ipfs-version', 'traefik-version'] as const

interface UpdateFlags {
  'backup-data': boolean
  'backup-dir': string | undefined
  'cluster-version': string
  force: boolean
  'ipfs-version': string
  'no-backup': boolean
  'skip-compose-update': boolean
  'traefik-version': string
}

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
      description:
        'Leave docker-compose.yml untouched (skips image tag updates and legacy config bind mount removal; the IPFS config migration still runs against the current repo version)',
    }),
    'traefik-version': Flags.string({
      default: 'v3.6.1',
      description: 'Traefik Docker tag to use',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)

    try {
      await this.preflight(flags)

      // Check if services are running
      const running = await checkRunningContainers()
      const isRunning = running.length > 0

      // Get current versions if services are running
      if (isRunning) {
        try {
          const currentVersions = await getContainerVersions()
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

      await this.maybeCreateBackup(flags)

      const {composeChanged, willRemoveBindMount} = await this.prepareConfigAndCompose(flags)

      const beforeImages = await this.getComposeImageIds()
      const beforeRunningImages = isRunning ? await this.getRunningServiceImageIds() : new Map<string, string>()

      // Pull latest images first
      this.logInfo('Pulling latest images...')
      await execa('docker', ['compose', 'pull'])

      const afterImages = await this.getComposeImageIds()
      const afterServiceImages = await this.getComposeServiceImageIds()
      this.logImageChanges(beforeImages, afterImages)

      const imagesChanged = [...afterImages].some(
        ([image, imageId]) => beforeImages.get(image) !== undefined && beforeImages.get(image) !== imageId,
      )
      const runningImagesOutdated = isRunning && this.hasRunningImageMismatch(beforeRunningImages, afterServiceImages)

      if (isRunning && !composeChanged && !imagesChanged && !runningImagesOutdated) {
        this.logInfo('No updates available - all images are up to date')
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

      await this.verifyUpdatedCluster()
      this.logSuccess('IPFS cluster updated successfully')
      if (willRemoveBindMount) {
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
    const hasLegacyConfig = await fs
      .access(LEGACY_IPFS_CONFIG_PATH)
      .then(() => true)
      .catch(() => false)

    if (!hasLegacyConfig) {
      return
    }

    const archivePath = `${LEGACY_IPFS_CONFIG_PATH}.legacy-${new Date().toISOString().replaceAll(/[.:]/g, '-')}`
    await fs.rename(LEGACY_IPFS_CONFIG_PATH, archivePath)
    this.logInfo(`Archived legacy exported IPFS config to ${archivePath}`)
    this.logInfo(`The live Kubo config is now ${REPO_IPFS_CONFIG_PATH}`)
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
      {dest: 'ipfs.config.json', optional: true, src: LEGACY_IPFS_CONFIG_PATH},
      {dest: 'data/ipfs/config', optional: true, src: REPO_IPFS_CONFIG_PATH},
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
    const composeConfig = JSON.parse(stdout) as {services: Record<string, {image?: string}>}
    const serviceImages = new Map<string, string>()

    await Promise.all(
      Object.entries(composeConfig.services).map(async ([service, serviceConfig]) => {
        if (!serviceConfig.image) {
          return
        }

        try {
          const {stdout: imageId} = await execa('docker', [
            'image',
            'inspect',
            serviceConfig.image,
            '--format',
            '{{.Id}}',
          ])
          serviceImages.set(service, imageId.trim())
        } catch {
          serviceImages.set(service, 'not-present')
        }
      }),
    )

    return serviceImages
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
      } else if (afterId === 'not-present') {
        this.logWarning(`${image}: not present locally after pull`)
      } else if (beforeId === 'not-present') {
        this.logSuccess(`${image}: pulled`)
      } else if (beforeId === afterId) {
        this.logInfo(`${image}: unchanged`)
      } else {
        this.logSuccess(`${image}: updated`)
      }
    }
  }

  private async maybeCreateBackup(flags: UpdateFlags): Promise<void> {
    if (flags['no-backup']) {
      return
    }

    const backupDir = flags['backup-dir'] || `backup_${new Date().toISOString().replaceAll(/[.:]/g, '').slice(0, 15)}`

    if (flags.force) {
      await this.createBackup(backupDir, flags['backup-data'])
      return
    }

    const shouldBackup = await this.confirm(
      `Would you like to create a backup before updating? (Will be stored in ${backupDir})`,
    )
    if (shouldBackup) {
      await this.createBackup(backupDir, flags['backup-data'])
    } else {
      this.logInfo('Skipping backup')
    }
  }

  private async migrateIpfsConfig(targetIpfsVersion: string | undefined, configPath: string): Promise<void> {
    const hasConfig = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false)

    if (!hasConfig) {
      this.logWarning(`No IPFS config found at ${configPath}; skipping config migration`)
      return
    }

    const config = await readIpfsConfig(configPath)
    const targetRepoVersion = targetIpfsVersion === undefined ? undefined : getTargetRepoVersion(targetIpfsVersion)
    const repoVersion = targetRepoVersion ?? (await readIpfsRepoVersion())
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

  private async preflight(flags: UpdateFlags): Promise<void> {
    for (const flag of VERSION_FLAGS) {
      if (!isValidDockerTag(flags[flag])) {
        throw new Error(`Invalid Docker image tag for --${flag}: "${flags[flag]}"`)
      }
    }

    await execa('docker', ['compose', 'version'])
    await fs.access('docker-compose.yml')
  }

  private async prepareConfigAndCompose(
    flags: UpdateFlags,
  ): Promise<{composeChanged: boolean; willRemoveBindMount: boolean}> {
    const skipComposeUpdate = flags['skip-compose-update']
    const usesBindMount = await usesIpfsConfigBindMount()
    const willRemoveBindMount = usesBindMount && !skipComposeUpdate

    if (usesBindMount && skipComposeUpdate) {
      this.logWarning(
        'Legacy read-only IPFS config bind mount detected, but --skip-compose-update leaves it in place. ' +
          'Kubo upgrades cannot migrate the repo until it is removed; re-run without --skip-compose-update.',
      )
    }

    // The config migration always runs against the live config; it only
    // targets the pinned Kubo version when the compose tags are updated to it.
    await this.migrateIpfsConfig(skipComposeUpdate ? undefined : flags['ipfs-version'], await getLiveIpfsConfigPath())

    if (willRemoveBindMount) {
      await this.stageIpfsConfigForUnmountedRepo()
    }

    const composeChanged = skipComposeUpdate
      ? false
      : await this.updateManagedImageTags({
          clusterVersion: flags['cluster-version'],
          ipfsVersion: flags['ipfs-version'],
          traefikVersion: flags['traefik-version'],
        })

    return {composeChanged, willRemoveBindMount}
  }

  private async stageIpfsConfigForUnmountedRepo(): Promise<void> {
    try {
      await fs.copyFile(LEGACY_IPFS_CONFIG_PATH, REPO_IPFS_CONFIG_PATH)
      this.logSuccess(`Staged ${LEGACY_IPFS_CONFIG_PATH} into ${REPO_IPFS_CONFIG_PATH}`)
    } catch (error) {
      const {code} = error as NodeJS.ErrnoException
      if (code !== 'EACCES' && code !== 'EPERM') {
        throw error
      }

      throw new Error(ipfsConfigWritePermissionHint(REPO_IPFS_CONFIG_PATH))
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

    updated = replaceServiceImage(updated, 'ipfs', `ipfs/kubo:${versions.ipfsVersion}`)
    updated = replaceServiceImage(updated, 'cluster', `ipfs/ipfs-cluster:${versions.clusterVersion}`)
    updated = replaceServiceImage(updated, 'traefik', `traefik:${versions.traefikVersion}`)
    updated = removeIpfsConfigBindMount(updated)

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

  private async verifyUpdatedCluster(): Promise<void> {
    this.logInfo('Verifying services after update...')
    const requiredServices = ['ipfs', 'cluster']
    let consecutiveHealthyChecks = 0

    for (let attempt = 0; attempt < 8; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const running = await checkRunningContainers()
      const missing = requiredServices.filter((service) => !running.some((container) => container.includes(service)))

      if (missing.length === 0) {
        consecutiveHealthyChecks++
        // Require two healthy checks in a row so a container that starts and
        // then exits (e.g. on a failed repo migration) is not reported healthy.
        if (consecutiveHealthyChecks >= 2) {
          // eslint-disable-next-line no-await-in-loop
          const versions = await getContainerVersions()
          this.logSuccess(`Running IPFS ${versions.ipfs} and IPFS Cluster ${versions.cluster}`)
          return
        }
      } else {
        consecutiveHealthyChecks = 0
        this.logInfo(`Waiting for ${missing.join(', ')} to start...`)
      }

      // eslint-disable-next-line no-await-in-loop
      await delay(5000)
    }

    throw new Error(
      'ipfs/cluster containers did not stay running after the update. ' +
        'Check `docker compose logs`; large repos may still be running a migration.',
    )
  }
}
