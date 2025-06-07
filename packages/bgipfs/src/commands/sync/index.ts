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

  static override description = 'Sync pins from an origin IPFS node to a destination IPFS node'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    'bgipfs sync ls',
    'bgipfs sync pin',
    'bgipfs sync add',
    'bgipfs sync ls --savePins',
    'bgipfs sync ls --limit 10',
    'bgipfs sync pin --limit 5',
  ]

  static override flags = {
    chunkSize: Flags.integer({
      default: 10,
      description: 'Number of pins to process in parallel',
    }),
    limit: Flags.integer({
      description: 'Limit the number of pins to process (useful for testing)',
      required: false,
    }),
    pinSource: Flags.string({
      default: 'origin',
      description: 'Source of pins: "origin" or path to CSV file',
    }),
    progressUpdate: Flags.integer({
      default: 100,
      description: 'Number of pins to process before showing progress',
    }),
    savePins: Flags.boolean({
      default: false,
      description: 'Save pinned CIDs to a file',
    }),
    statusFile: Flags.string({
      description: 'File to track sync status. If exists, will resume from last state.',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Sync)
    const config = await this.loadConfig()

    const originIpfs = create(config.origin)
    const destinationIpfs = create(config.destination)

    const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-')
    const lsFile = flags.pinSource === 'origin' ? `sync-ls-${timestamp}.csv` : flags.pinSource
    const statusFile = flags.statusFile || `sync-status-${timestamp}.csv`

    let pinCount = 0
    let errorCount = 0
    let lastProgressUpdate = 0
    const startTime = Date.now()

    try {
      // Step 1: Get all pins and save to CSV
      if (flags.pinSource === 'origin') {
        this.logInfo('Reading pins from origin node...')
        const pins: Array<{cid: string; type: string}> = []
        for await (const {cid, type} of originIpfs.pin.ls({type: 'recursive'})) {
          pins.push({cid: cid.toString(), type})
          if (flags.limit && pins.length >= flags.limit) break
        }

        await this.savePinsToCsv(pins, lsFile)
        this.logSuccess(`Saved ${pins.length} pins to ${lsFile}`)
      }

      // Step 2: Process pins in parallel chunks
      if (args.mode !== 'ls') {
        this.logInfo('Processing pins...')
        const fileContent = await fs.readFile(lsFile, 'utf8')
        const lines = fileContent.split('\n').slice(1) // Skip header
        let pins = lines
          .filter((line) => line.trim())
          .map((line) => {
            const [cid, type] = line.split(',')
            return {cid, type}
          })

        // Filter out already processed pins if status file exists
        const processedPins = await this.getProcessedPins(statusFile)
        if (processedPins.size > 0) {
          const originalCount = pins.length
          pins = pins.filter((pin) => !processedPins.has(pin.cid))
          this.logInfo(`Skipping ${originalCount - pins.length} already processed pins`)
        }

        // Process in chunks
        const chunks = []
        for (let i = 0; i < pins.length; i += flags.chunkSize) {
          chunks.push(pins.slice(i, i + flags.chunkSize))
        }

        for (const chunk of chunks) {
          if (flags.limit && pinCount >= flags.limit) {
            this.logInfo(`Reached limit of ${flags.limit} pins`)
            break
          }

          // eslint-disable-next-line no-await-in-loop
          const results = await this.processChunk(chunk, originIpfs, destinationIpfs, args.mode === 'pin')
          // eslint-disable-next-line no-await-in-loop
          await this.writeChunkResults(statusFile, results)

          // Update progress
          pinCount += chunk.length
          errorCount += results.filter((r) => r.error).length

          if (pinCount - lastProgressUpdate >= flags.progressUpdate) {
            const elapsedMinutes = (Date.now() - startTime) / 1000 / 60
            const rate = pinCount / elapsedMinutes
            this.logInfo(`Progress: ${pinCount} pins processed (${rate.toFixed(1)} pins/minute), ${errorCount} errors`)
            lastProgressUpdate = pinCount
          }
        }

        const totalMinutes = (Date.now() - startTime) / 1000 / 60
        this.logSuccess(`Completed ${pinCount} pins in ${totalMinutes.toFixed(1)} minutes (${errorCount} errors)`)
        this.logInfo(`Results saved to ${statusFile}`)
      }
    } catch (error) {
      this.error(`Sync operation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async getProcessedPins(statusFile: string): Promise<Set<string>> {
    try {
      const content = await fs.readFile(statusFile, 'utf8')
      const lines = content.split('\n').slice(1) // Skip header
      return new Set(lines.filter((line) => line.trim()).map((line) => line.split(',')[0]))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create it with headers
        await fs.writeFile(statusFile, 'cid,type,success,size,error\n')
        return new Set()
      }

      throw error
    }
  }

  private async loadConfig(): Promise<IpfsConfig> {
    try {
      const configFile = await fs.readFile('ipfs-sync.config.json', 'utf8')
      return JSON.parse(configFile)
    } catch {
      this.error('Config file not found. Run "bgipfs sync:config" first to create it.')
    }
  }

  private async processChunk(
    chunk: Array<{cid: string; type: string}>,
    originIpfs: ReturnType<typeof create>,
    destinationIpfs: ReturnType<typeof create>,
    pinOnly: boolean,
  ): Promise<Array<{cid: string; error?: string; size: number; type: string}>> {
    return Promise.all(
      chunk.map(async (pin) => {
        const result = await this.syncPin(pin.cid, originIpfs, destinationIpfs, pinOnly)
        return {
          ...pin,
          ...result,
        }
      }),
    )
  }

  private async savePinsToCsv(pins: Array<{cid: string; type: string}>, filename: string): Promise<void> {
    await fs.writeFile(filename, 'cid,type\n')
    for (const pin of pins) {
      // eslint-disable-next-line no-await-in-loop
      await this.writeCsvLine(filename, pin)
    }
  }

  private async syncPin(
    cid: string,
    originIpfs: ReturnType<typeof create>,
    destinationIpfs: ReturnType<typeof create>,
    pinOnly: boolean,
  ): Promise<{error?: string; size: number}> {
    try {
      let size = 0
      if (pinOnly) {
        await destinationIpfs.pin.add(cid)
      } else {
        const file = await all(originIpfs.cat(cid))
        size = file.length
        await destinationIpfs.add(file, {
          cidVersion: cid.startsWith('bafy') ? 1 : 0,
        })
      }

      return {size}
    } catch (error) {
      return {
        error: `Failed to process ${cid}: ${error instanceof Error ? error.message : String(error)}`,
        size: 0,
      }
    }
  }

  private async writeChunkResults(
    filename: string,
    results: Array<{cid: string; error?: string; size: number; type: string}>,
  ): Promise<void> {
    for (const result of results) {
      // eslint-disable-next-line no-await-in-loop
      await this.writeCsvLine(filename, {
        ...result,
        success: result.error ? 0 : 1,
      })
    }
  }

  private async writeCsvLine(file: string, data: Record<string, number | string>) {
    const line = Object.values(data).join(',') + '\n'
    await fs.appendFile(file, line)
  }
}
