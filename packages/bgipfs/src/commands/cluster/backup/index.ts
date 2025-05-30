import {Flags} from '@oclif/core'
import {promises as fs} from 'node:fs'
import path from 'node:path'

import {BaseCommand} from '../../../base-command.js'

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

      // Check if backup directory exists
      try {
        await fs.access(backupDir)
        this.logError(`Backup directory ${backupDir} already exists`)
        return
      } catch {
        // Directory doesn't exist, which is what we want
      }

      // Create backup directory
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

      // Verify backup
      this.logInfo('Verifying backup...')
      await Promise.all(
        itemsToBackup.map(async (item) => {
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
