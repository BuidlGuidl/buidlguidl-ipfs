import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../base-command.js'
import {commandExists, installDockerUbuntu, installIpfsClusterCtl, isUbuntu} from '../../lib/system.js'

export default class Install extends BaseCommand {
  static description = 'Install all required dependencies'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force reinstall of components',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Install)

    if (!flags.force) {
      const proceed = await this.confirm('This will install all dependencies. Continue?')
      if (!proceed) {
        this.logInfo('Installation cancelled')
        return
      }
    }

    try {
      await this.checkSystemRequirements()

      // Check Docker
      this.logInfo('Checking Docker installation...')
      const hasDocker = await commandExists('docker')

      if (hasDocker) {
        this.logSuccess('Docker is installed')

        // Check Docker Compose (built-in)
        this.logInfo('Checking Docker Compose...')
        try {
          await execa('docker', ['compose', 'version'])
          this.logSuccess('Docker Compose is available')
        } catch {
          this.logError('Docker Compose not available. Please ensure you have Docker v20.10.13 or later')
        }
      } else if (await isUbuntu()) {
        const installDocker = await this.confirm('Docker is not installed. Would you like to install it automatically?')
        if (installDocker) {
          this.logInfo('Installing Docker...')
          await installDockerUbuntu()
          this.logSuccess('Docker installed successfully')
        } else {
          this.logError('Docker is required. Please install Docker manually: https://docs.docker.com/get-docker/')
        }
      } else {
        this.logError('Docker is required. Please install Docker Desktop: https://docs.docker.com/get-docker/')
      }

      // Install ipfs-cluster-ctl
      this.logInfo('Installing ipfs-cluster-ctl...')
      try {
        const {stdout} = await execa('ipfs-cluster-ctl', ['--version'])
        this.logSuccess(`ipfs-cluster-ctl ${stdout.trim()} is already installed`)
      } catch {
        try {
          await installIpfsClusterCtl()
          const {stdout} = await execa('ipfs-cluster-ctl', ['--version'])
          this.logSuccess(`ipfs-cluster-ctl ${stdout.trim()} installed successfully`)
        } catch (error) {
          this.logError(
            'Failed to install ipfs-cluster-ctl. Please try installing manually:\n' +
              '1. Download from https://dist.ipfs.tech/ipfs-cluster-ctl/\n' +
              '2. Extract and move to /usr/local/bin/\n' +
              '3. Make executable with chmod +x\n\n' +
              `Original error: ${(error as Error).message}`,
          )
        }
      }

      this.logSuccess('All dependencies are installed and configured correctly')
    } catch (error) {
      this.logError(`Installation failed: ${(error as Error).message}`)
    }
  }

  private async checkSystemRequirements(): Promise<void> {
    // Check curl
    this.logInfo('Checking curl installation...')
    try {
      await execa('curl', ['--version'])
      this.logSuccess('curl is installed')
    } catch {
      this.logError('curl is required but not installed')
    }
  }
}
