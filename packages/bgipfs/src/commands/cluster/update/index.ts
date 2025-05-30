import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'
import path from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {checkRunningContainers, getContainerVersions} from '../../../lib/system.js'
import Restart from '../restart/index.js'
import Start from '../start/index.js'

export default class Update extends BaseCommand {
  static description = 'Update IPFS and IPFS Cluster to their latest versions'

  static examples = [
    'bgipfs cluster update',
    'bgipfs cluster update --no-backup',
    'bgipfs cluster update --backup-dir ./my-backup',
  ]

  static flags = {
    'backup-dir': Flags.string({
      description: 'Directory to store backup (defaults to ./backup_YYYYMMDD_HHMMSS)',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force update: skip confirmation prompts',
    }),
    'no-backup': Flags.boolean({
      default: false,
      description: 'Skip creating a backup before updating',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)

    try {
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
          this.logError(`Failed to get current versions: ${(error as Error).message}`)
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
          await this.createBackup(backupDir)
        } else {
          const shouldBackup = await this.confirm(
            `Would you like to create a backup before updating? (Will be stored in ${backupDir})`,
          )
          if (shouldBackup) {
            await this.createBackup(backupDir)
          } else {
            this.logInfo('Skipping backup')
          }
        }
      }

      // Pull latest images first
      this.logInfo('Pulling latest images...')
      await execa('docker', ['compose', 'pull'])

      // Check if versions changed
      if (isRunning && !(await this.checkVersions(currentVersions))) {
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

  private async checkVersions(currentVersions?: {cluster: string; ipfs: string}): Promise<boolean> {
    try {
      const newVersions = await getContainerVersions()
      if (currentVersions) {
        const ipfsUpdated = newVersions.ipfs !== currentVersions.ipfs
        const clusterUpdated = newVersions.cluster !== currentVersions.cluster

        if (!ipfsUpdated && !clusterUpdated) {
          this.logInfo('No updates available - already running latest versions')
          return false
        }

        this.logInfo(`New versions available:
  IPFS: ${currentVersions.ipfs} -> ${newVersions.ipfs}
  IPFS Cluster: ${currentVersions.cluster} -> ${newVersions.cluster}`)
      }

      return true
    } catch (error) {
      this.logError(`Failed to check new versions: ${(error as Error).message}`)
      return true // Continue with update if version check fails
    }
  }

  private async createBackup(backupDir: string): Promise<void> {
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

    // List of files and directories to backup
    const itemsToBackup = [
      {dest: 'ipfs', src: 'data/ipfs'},
      {dest: 'ipfs-cluster', src: 'data/ipfs-cluster'},
      {dest: 'ipfs.config.json', src: 'ipfs.config.json'},
      {dest: 'service.json', src: 'service.json'},
      {dest: 'identity.json', src: 'identity.json'},
      {dest: 'auth', src: 'auth'},
    ]

    // Copy each item
    await Promise.all(
      itemsToBackup.map(async (item) => {
        try {
          this.logInfo(`Backing up ${item.src}...`)
          await fs.cp(item.src, path.join(backupDir, item.dest), {recursive: true})
          this.logSuccess(`Successfully backed up ${item.src}`)
        } catch (error) {
          this.logError(`Failed to backup ${item.src}: ${(error as Error).message}`)
        }
      }),
    )
  }
}
