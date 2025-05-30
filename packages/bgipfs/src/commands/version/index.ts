import {execa} from 'execa'

import {BaseCommand} from '../../base-command.js'
import {checkRunningContainers, getContainerVersions} from '../../lib/system.js'

export default class Version extends BaseCommand {
  static description = 'Show version information for bgipfs, ipfs-cluster-ctl, and running containers'

  static examples = ['bgipfs version']

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

      // Check container versions if running
      const running = await checkRunningContainers()
      if (running.length > 0) {
        try {
          const versions = await getContainerVersions()
          this.log('\nRunning container versions:')
          this.log(`  IPFS: ${versions.ipfs}`)
          this.log(`  IPFS Cluster: ${versions.cluster}`)
        } catch (error) {
          this.logError(`Failed to get container versions: ${(error as Error).message}`)
        }
      }
    } catch (error) {
      this.logError(`Failed to get version info: ${(error as Error).message}`)
    }
  }
}
