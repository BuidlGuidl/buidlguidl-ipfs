import {Args, Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../base-command.js'

export default class Logs extends BaseCommand {
  static args = {
    service: Args.string({
      description: 'Service to show logs for (ipfs, cluster, nginx)',
      options: ['ipfs', 'cluster', 'nginx'],
      required: false,
    }),
  }

  static description = 'Show container logs'

  static flags = {
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow log output',
    }),
    tail: Flags.integer({
      char: 'n',
      default: 100,
      description: 'Number of lines to show from the end of logs',
    }),
    timestamps: Flags.boolean({
      char: 't',
      default: false,
      description: 'Show timestamps',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Logs)

    try {
      const services = args.service ? [args.service] : ['ipfs', 'cluster', 'nginx']
      const logArgs = ['compose', 'logs']

      if (flags.follow) logArgs.push('--follow')
      if (flags.timestamps) logArgs.push('--timestamps')
      if (flags.tail) logArgs.push('--tail', flags.tail.toString())

      logArgs.push(...services)

      // Show logs
      const {stdout} = await execa('docker', logArgs, {
        stdio: flags.follow ? 'inherit' : undefined,
      })

      if (!flags.follow) {
        this.log(stdout)
      }
    } catch (error) {
      this.logError(`Failed to get logs: ${(error as Error).message}`)
    }
  }
}
