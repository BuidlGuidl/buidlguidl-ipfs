import {Flags} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

import {BaseCommand} from '../../base-command.js'

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

      // Remove data directory
      this.logInfo('Removing data directory...')
      await fs.rm('data', {force: true, recursive: true})

      if (flags.config) {
        // Remove config files
        this.logInfo('Removing configuration files...')
        const configFiles = ['.env', 'htpasswd', 'identity.json', 'service.json']

        await Promise.all(
          configFiles.map((file: string) =>
            fs.unlink(file).catch(() => {
              // Ignore errors for missing files
            }),
          ),
        )
      }

      this.logSuccess('Reset complete')
      if (flags.config) {
        this.logInfo("You can now run 'bgipfs config' to reconfigure the cluster")
      } else {
        this.logInfo("You can now run 'bgipfs start' to restart the cluster")
      }
    } catch (error) {
      this.logError(`Reset failed: ${(error as Error).message}`)
    }
  }
}
