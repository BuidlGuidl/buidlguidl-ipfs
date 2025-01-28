import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../../base-command.js'
import Start from '../start/index.js'
import Stop from '../stop/index.js'

export default class Restart extends BaseCommand {
  static description = 'Restart the IPFS cluster'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force restart: skip confirmation prompt',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Restart)

    if (!flags.force) {
      const shouldRestart = await this.confirm('Are you sure you want to restart the IPFS cluster?')
      if (!shouldRestart) {
        this.logInfo('Restart cancelled')
        return
      }
    }

    // Check if DNS mode is currently active by looking for port 80 mapping
    const isDnsMode = await execa('docker', ['compose', 'ps'])
      .then(({stdout}) => stdout.includes('0.0.0.0:80->80/tcp'))
      .catch(() => false)

    this.logInfo(`Restarting IPFS cluster in ${isDnsMode ? 'DNS' : 'IP'} mode...`)

    this.logInfo('Stopping IPFS cluster...')
    await Stop.run([])

    this.logInfo('Starting IPFS cluster...')
    await (isDnsMode ? Start.run(['--mode', 'dns']) : Start.run([]))

    this.logSuccess('IPFS cluster restarted successfully')
  }
}
