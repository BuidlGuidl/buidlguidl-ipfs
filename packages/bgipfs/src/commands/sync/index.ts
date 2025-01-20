import {Args, Flags} from '@oclif/core'
import all from 'it-all'
import { Options, create } from 'kubo-rpc-client'
import * as fs from 'node:fs/promises'

import {BaseCommand} from '../../base-command.js'

interface IpfsConfig {
  destination: Options
  origin: Options
}

export default class Sync extends BaseCommand {

  static args = {
    mode: Args.string({
      description: 'Mode: ls, pin or add',
      options: ['ls', 'pin', 'add'],
      required: true,
    }),
  }

 static override description = 'List pinned CIDs'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    'bgipfs sync ls',
    'bgipfs sync pin',
    'bgipfs sync add',
    'bgipfs sync ls --savePins',
  ]

  static override flags = {
    savePins: Flags.boolean({
      default: false,
      description: 'Save pinned CIDs to a file',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Sync)
    const config = await this.loadConfig()
    
    const originIpfs = create(config.origin)
    const destinationIpfs = create(config.destination)
    
    const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-')
    const pinsFile = `pins-${timestamp}.txt`
    
    let pinCount = 0
    for await (const { cid, type } of originIpfs.pin.ls()) {
      this.logInfo(`${cid.toString()} ${type}`)
      if(flags.savePins) {
        await fs.appendFile(pinsFile, `${cid.toString()}\t${type}\t${new Date().toISOString()}\n`)
      }

      pinCount++
      if(args.mode === 'ls') {
        continue
      }

      if (args.mode === 'add') {
        const file = await all(originIpfs.cat(cid))
        await destinationIpfs.add(file, {
          cidVersion: 1,
        })
      }

      if (args.mode === 'pin') {
          await destinationIpfs.pin.add(cid)
      }

      this.logSuccess(`${cid.toString()} repinned`)
    }

    this.logSuccess(`${pinCount} pinned CIDs`)

  }

  private async loadConfig(): Promise<IpfsConfig> {
    try {
      const configFile = await fs.readFile('ipfs-sync.config.json', 'utf8')
      return JSON.parse(configFile)
    } catch {
      this.error('Config file not found. Run "bgipfs sync:config" first to create it.')
    }
  }
}
