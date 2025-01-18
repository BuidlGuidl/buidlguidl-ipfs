import {execa} from 'execa'

import {BaseCommand} from '../../base-command.js'

export default class Version extends BaseCommand {
  static description = 'Show version information'

  async run(): Promise<void> {
    try {
      this.log(`bgipfs version: ${this.config.version}`)

      // Check ipfs-cluster-ctl version
      try {
        const {stdout: clusterVersion} = await execa('ipfs-cluster-ctl', ['--version'])
        this.log(`ipfs-cluster-ctl: ${clusterVersion.trim()}`)
      } catch {
        this.log('ipfs-cluster-ctl: not installed')
      }
    } catch (error) {
      this.logError(`Failed to get version info: ${(error as Error).message}`)
    }
  }
}
