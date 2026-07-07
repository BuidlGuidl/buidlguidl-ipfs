import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../../base-command.js'

export default class Reset extends BaseCommand {
  static description = 'Reset IPFS cluster and remove all data'

  static flags = {
    config: Flags.boolean({
      char: 'c',
      default: false,
      description: 'Also remove configuration files',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompts',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Reset)

    if (!flags.force) {
      this.logWarning('WARNING: This will remove all IPFS data!')
      const proceed = await this.confirm('Are you sure you want to continue?')
      if (!proceed) {
        this.logInfo('Reset cancelled')
        return
      }

      if (flags.config) {
        this.logWarning('WARNING: This will also remove all configuration files!')
        const proceedConfig = await this.confirm('Are you sure you want to remove configuration?')
        if (!proceedConfig) {
          this.logInfo('Continuing without removing configuration')
          flags.config = false
        }
      }
    }

    try {
      // Stop and remove all containers first
      this.logInfo('Stopping and removing containers...')
      await execa('docker', ['compose', 'down', '--remove-orphans', '-v'])

      if (flags.config) {
        // Remove config files before the data directory, which can fail on
        // container-owned files; the config cleanup should still complete.
        this.logInfo('Removing configuration files...')
        const configFiles = ['.env', 'htpasswd', 'identity.json', 'ipfs.config.json', 'service.json']

        await Promise.all(
          configFiles.map((file: string) =>
            fs.unlink(file).catch(() => {
              // Ignore errors for missing files
            }),
          ),
        )
      }

      // Remove data directory
      this.logInfo('Removing data directory...')
      await this.removeDataDirectory()

      this.logSuccess('Reset complete')
      if (flags.config) {
        this.logInfo("You can now run 'bgipfs cluster config' to reconfigure the cluster")
      } else {
        this.logInfo("You can now run 'bgipfs cluster start' to restart the cluster")
      }
    } catch (error) {
      this.logError(`Reset failed: ${(error as Error).message}`)
    }
  }

  private async removeDataDirectory(): Promise<void> {
    try {
      await fs.rm('data', {force: true, recursive: true})
    } catch (error) {
      const {code} = error as NodeJS.ErrnoException
      if (code !== 'EACCES' && code !== 'EPERM') {
        throw error
      }

      throw new Error(
        'Cannot remove the data directory as the current host user (its contents are owned by the container user). ' +
          'Remove it manually:\nsudo rm -rf data',
      )
    }
  }
}
