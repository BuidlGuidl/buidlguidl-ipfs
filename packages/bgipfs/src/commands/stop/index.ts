import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../base-command.js'

export default class Stop extends BaseCommand {
  static description = 'Stop IPFS cluster'

  static flags = {
    clean: Flags.boolean({
      char: 'c',
      default: false,
      description: 'Remove containers after stopping',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Stop)

    try {
      const services = ['ipfs', 'cluster', 'nginx']

      // Show stopping status for each service
      for (const service of services) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const {stdout} = await execa('docker', ['compose', 'ps', service, '--format', 'json'])
          const status = JSON.parse(stdout)
          if (status.State === 'running') {
            this.log(`Stopping ${service}...`)
          }
        } catch {
          // Ignore errors checking service status
        }
      }

      if (flags.clean) {
        this.logInfo('Stopping and removing containers...')
        await execa('docker', ['compose', 'down', '--remove-orphans', '-v'])
      } else {
        this.logInfo('Stopping IPFS cluster...')
        await execa('docker', ['compose', 'stop'])
      }

      this.logSuccess('IPFS cluster stopped')
    } catch (error) {
      this.logError(`Failed to stop cluster: ${(error as Error).message}`)
    }
  }
}
