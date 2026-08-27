import {Flags} from '@oclif/core'
import {promises as fs} from 'node:fs'
import path from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {fileExists} from '../../../lib/files.js'

export default class Backup extends BaseCommand {
  static description = 'Create a backup of IPFS cluster data and configuration'

  static examples = ['bgipfs cluster backup', 'bgipfs cluster backup --output ./my-backup']

  static flags = {
    output: Flags.string({
      char: 'o',
      description: 'Output directory for backup (defaults to ./backup_YYYYMMDD_HHMMSS)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Backup)

    try {
      // Generate backup directory name if not provided
      const backupDir = flags.output || `backup_${new Date().toISOString().replaceAll(/[.:]/g, '').slice(0, 15)}`

      this.logInfo(`Creating backup in ${backupDir}...`)

      if (await fileExists(backupDir)) {
        throw new Error(`Backup directory ${backupDir} already exists`)
      }

      // Create backup directory
      await fs.mkdir(backupDir, {recursive: true})

      // List of files and directories to backup. The legacy exported IPFS
      // config only exists on clusters that still bind-mount it; the live
      // config is captured as part of data/ipfs.
      const itemsToBackup: Array<{dest: string; optional?: boolean; src: string}> = [
        {dest: 'ipfs', src: 'data/ipfs'},
        {dest: 'ipfs-cluster', src: 'data/ipfs-cluster'},
        {dest: 'ipfs.config.json', optional: true, src: 'ipfs.config.json'},
        {dest: 'service.json', src: 'service.json'},
        {dest: 'identity.json', src: 'identity.json'},
        {dest: 'auth', src: 'auth'},
      ]

      // Copy each item
      const copiedItems = await Promise.all(
        itemsToBackup.map(async (item) => {
          try {
            this.logInfo(`Backing up ${item.src}...`)
            await fs.cp(item.src, path.join(backupDir, item.dest), {recursive: true})
            this.logSuccess(`Successfully backed up ${item.src}`)
            return item
          } catch (error) {
            if (item.optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
              this.logInfo(`Skipping missing optional backup item ${item.src}`)
              return
            }

            this.logError(`Failed to backup ${item.src}: ${(error as Error).message}`)
          }
        }),
      )

      // Verify backup
      this.logInfo('Verifying backup...')
      await Promise.all(
        copiedItems
          .filter((item) => item !== undefined)
          .map(async (item) => {
            try {
              await fs.access(path.join(backupDir, item.dest))
              this.logSuccess(`Verified ${item.dest} in backup`)
            } catch {
              this.logError(`Failed to verify ${item.dest} in backup`)
            }
          }),
      )

      this.logSuccess(`Backup completed successfully in ${backupDir}`)
      this.logInfo('Backup includes:')
      this.log('- IPFS node data')
      this.log('- IPFS Cluster data')
      this.log('- Configuration files')
      this.log('- Authentication files')
    } catch (error) {
      this.logError(`Backup failed: ${(error as Error).message}`)
    }
  }
}
