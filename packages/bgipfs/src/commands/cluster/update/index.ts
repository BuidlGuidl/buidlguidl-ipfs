import {Flags, Interfaces} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

import {BaseCommand} from '../../../base-command.js'
import {getBgipfsIpfsConfigPolicy} from '../../../lib/bgipfs-owned-keys.js'
import {
  ensureServiceRestartPolicy,
  isValidDockerTag,
  removeIpfsConfigBindMount,
  replaceServiceImage,
  usesIpfsConfigBindMount,
} from '../../../lib/compose-file.js'
import {DEFAULT_VERSIONS} from '../../../lib/default-versions.js'
import {fileExists, isPermissionError} from '../../../lib/files.js'
import {
  LEGACY_IPFS_CONFIG_PATH,
  REPO_IPFS_CONFIG_PATH,
  backupIpfsConfig,
  computeIpfsConfigChanges,
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

type UpdateFlags = Interfaces.InferredFlags<typeof Update.flags>

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
      default: DEFAULT_VERSIONS.cluster,
      description: 'IPFS Cluster Docker tag to use',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force update: skip confirmation prompts',
    }),
    'ipfs-version': Flags.string({
      default: DEFAULT_VERSIONS.ipfs,
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
      default: DEFAULT_VERSIONS.traefik,
      description: 'Traefik Docker tag to use',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)
    let backupDir: string | undefined

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

      backupDir = await this.maybeCreateBackup(flags)

      const {composeChanged, willRemoveBindMount} = await this.prepareConfigAndCompose(flags)

      const [{imageIds: beforeImages}, beforeRunningImages] = await Promise.all([
        this.snapshotComposeImages(),
        isRunning ? this.getRunningServiceImageIds() : new Map<string, string>(),
      ])

      // Pull latest images first
      this.logInfo('Pulling latest images...')
      await execa('docker', ['compose', 'pull'])

      const {imageIds: afterImages, serviceImageIds: afterServiceImages} = await this.snapshotComposeImages()
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

      if (backupDir) {
        this.logInfo(`A backup was created in: ${backupDir}`)
      }
    } catch (error) {
      if (backupDir) {
        this.logInfo(`A backup was created before the update attempt in: ${backupDir}`)
      }

      this.logError(`Update failed: ${(error as Error).message}`)
    }
  }

  private async archiveLegacyIpfsConfig(): Promise<void> {
    if (!(await fileExists(LEGACY_IPFS_CONFIG_PATH))) {
      return
    }

    const archivePath = `${LEGACY_IPFS_CONFIG_PATH}.legacy-${new Date().toISOString().replaceAll(/[.:]/g, '-')}`
    await fs.rename(LEGACY_IPFS_CONFIG_PATH, archivePath)
    this.logInfo(`Archived legacy exported IPFS config to ${archivePath}`)
    this.logInfo(`The live Kubo config is now ${REPO_IPFS_CONFIG_PATH}`)
  }

  private async createBackup(backupDir: string, includeData: boolean): Promise<void> {
    if (await fileExists(backupDir)) {
      throw new Error(`Backup directory ${backupDir} already exists`)
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
        if ('optional' in item && item.optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.logInfo(`Skipping missing optional backup item ${item.src}`)
          continue
        }

        throw new Error(`Failed to backup ${item.src}: ${(error as Error).message}`)
      }
    }
  }

  private async getRunningServiceImageIds(): Promise<Map<string, string>> {
    const serviceImages = new Map<string, string>()

    try {
      const {stdout} = await execa('docker', ['compose', 'ps', '--format', 'json'])
      const containers = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {ID: string; Service: string})

      await Promise.all(
        containers.map(async (container) => {
          const {stdout: imageId} = await execa('docker', ['inspect', container.ID, '--format', '{{.Image}}'])
          serviceImages.set(container.Service, imageId.trim())
        }),
      )
    } catch {
      // Best-effort: if `docker compose ps` output cannot be parsed, only the
      // running-image staleness check is lost; compose/image changes still
      // trigger a restart.
      return new Map()
    }

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

  private async inspectImageId(image: string): Promise<string> {
    try {
      const {stdout} = await execa('docker', ['image', 'inspect', image, '--format', '{{.Id}}'])
      return stdout.trim()
    } catch {
      return 'not-present'
    }
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

  // Returns the backup directory when a backup was actually created.
  private async maybeCreateBackup(flags: UpdateFlags): Promise<string | undefined> {
    if (flags['no-backup']) {
      return undefined
    }

    const backupDir = flags['backup-dir'] || `backup_${new Date().toISOString().replaceAll(/[.:]/g, '').slice(0, 15)}`

    if (flags.force) {
      await this.createBackup(backupDir, flags['backup-data'])
      return backupDir
    }

    const shouldBackup = await this.confirm(
      `Would you like to create a backup before updating? (Will be stored in ${backupDir})`,
    )
    if (!shouldBackup) {
      this.logInfo('Skipping backup')
      return undefined
    }

    await this.createBackup(backupDir, flags['backup-data'])
    return backupDir
  }

  private async migrateIpfsConfig(targetIpfsVersion: string | undefined, configPath: string): Promise<void> {
    if (!(await fileExists(configPath))) {
      this.logWarning(`No IPFS config found at ${configPath}; skipping config migration`)
      return
    }

    const config = await readIpfsConfig(configPath)
    const targetRepoVersion = targetIpfsVersion === undefined ? undefined : getTargetRepoVersion(targetIpfsVersion)
    const repoVersion = targetRepoVersion ?? (await readIpfsRepoVersion())
    const policy = getBgipfsIpfsConfigPolicy(config, repoVersion)
    const changes = computeIpfsConfigChanges(config, policy.ownedKeys, policy.removedKeys)

    if (changes.length === 0) {
      this.logInfo('IPFS config is already compatible with the target Kubo version')
      return
    }

    const backupPath = await backupIpfsConfig(configPath)
    const migrated = mergeIpfsConfig(config, policy.ownedKeys, policy.removedKeys)
    await writeIpfsConfig(migrated, configPath)
    this.logSuccess(
      `Migrated IPFS config (${changes.map((change) => change.key).join(', ')}); backup saved to ${backupPath}`,
    )
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

  private async snapshotComposeImages(): Promise<{
    imageIds: Map<string, string>
    serviceImageIds: Map<string, string>
  }> {
    const {stdout} = await execa('docker', ['compose', 'config', '--format', 'json'])
    const composeConfig = JSON.parse(stdout) as {services: Record<string, {image?: string}>}

    const serviceImages = new Map<string, string>()
    for (const [service, serviceConfig] of Object.entries(composeConfig.services)) {
      if (serviceConfig.image) {
        serviceImages.set(service, serviceConfig.image)
      }
    }

    const imageIds = new Map<string, string>()
    await Promise.all(
      [...new Set(serviceImages.values())].map(async (image) => {
        imageIds.set(image, await this.inspectImageId(image))
      }),
    )

    const serviceImageIds = new Map<string, string>()
    for (const [service, image] of serviceImages) {
      serviceImageIds.set(service, imageIds.get(image) ?? 'not-present')
    }

    return {imageIds, serviceImageIds}
  }

  private async stageIpfsConfigForUnmountedRepo(): Promise<void> {
    try {
      await fs.copyFile(LEGACY_IPFS_CONFIG_PATH, REPO_IPFS_CONFIG_PATH)
      this.logSuccess(`Staged ${LEGACY_IPFS_CONFIG_PATH} into ${REPO_IPFS_CONFIG_PATH}`)
    } catch (error) {
      if (isPermissionError(error)) {
        throw new Error(ipfsConfigWritePermissionHint(REPO_IPFS_CONFIG_PATH))
      }

      throw error
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

    for (const service of ['ipfs', 'cluster', 'traefik']) {
      updated = ensureServiceRestartPolicy(updated, service)
    }

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
    // Repo migrations on large blockstores can take a while, so poll for a few
    // minutes before declaring the update failed.
    const maxAttempts = 36
    let consecutiveHealthyChecks = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // eslint-disable-next-line no-await-in-loop
        await delay(5000)
      }

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
    }

    throw new Error(
      'ipfs/cluster containers did not stay running after the update. ' +
        'Check `docker compose logs`; large repos may still be running a migration.',
    )
  }
}
