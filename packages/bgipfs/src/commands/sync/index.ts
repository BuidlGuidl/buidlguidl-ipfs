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
    'bgipfs sync ls --limit 10',
    'bgipfs sync pin --limit 5',
    'bgipfs sync add --statusFile sync-status.csv',
    'bgipfs sync add --statusFile sync-status.csv --retry',
    'bgipfs sync add --chunkSize 20 --progressUpdate 50',
    'bgipfs sync add --errorThreshold 25 --errorWindow 50',
  ]

  static override flags = {
    chunkSize: Flags.integer({
      default: 10,
      description: 'Number of pins to process in parallel',
    }),
    errorThreshold: Flags.integer({
      default: 50,
      description: 'Stop if rolling error rate exceeds this percentage (0-100)',
    }),
    errorWindow: Flags.integer({
      default: 100,
      description: 'Number of pins to consider for rolling error rate',
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
    retry: Flags.boolean({
      default: false,
      description: 'Retry failed pins from status file',
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
    const errorWindow: boolean[] = []

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
        const processedPins = await this.getProcessedPins(statusFile, flags.retry ? 1 : undefined)
        if (processedPins.size > 0) {
          const originalCount = pins.length
          pins = pins.filter((pin) => !processedPins.has(pin.cid))
          if (flags.retry) {
            this.logInfo(`Retrying ${pins.length} failed pins`)
          } else {
            this.logInfo(`Skipping ${originalCount - pins.length} already processed pins`)
          }
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

          // Update error window
          for (const result of results) errorWindow.push(Boolean(result.error))

          // Check rolling error rate
          const errorRate = this.calculateRollingErrorRate(errorWindow, flags.errorWindow)
          if (errorRate > flags.errorThreshold) {
            this.logError(`Rolling error rate (${errorRate.toFixed(1)}%) exceeded threshold (${flags.errorThreshold}%)`)
            this.logError('Stopping sync due to high error rate. Check origin IPFS node status.')
            break
          }

          if (pinCount - lastProgressUpdate >= flags.progressUpdate) {
            const elapsedMinutes = (Date.now() - startTime) / 1000 / 60
            const rate = pinCount / elapsedMinutes
            const totalErrorRate = (errorCount / pinCount) * 100
            this.logInfo(
              `Progress: ${pinCount} pins processed (${rate.toFixed(1)} pins/minute), ` +
                `${errorCount} errors (${totalErrorRate.toFixed(1)}% total, ${errorRate.toFixed(1)}% rolling)`,
            )
            lastProgressUpdate = pinCount
          }
        }

        const totalMinutes = (Date.now() - startTime) / 1000 / 60
        const finalErrorRate = (errorCount / pinCount) * 100
        const finalRollingRate = this.calculateRollingErrorRate(errorWindow, flags.errorWindow)
        this.logSuccess(
          `Completed ${pinCount} pins in ${totalMinutes.toFixed(1)} minutes ` +
            `(${errorCount} errors, ${finalErrorRate.toFixed(1)}% total, ${finalRollingRate.toFixed(1)}% rolling)`,
        )
        this.logInfo(`Results saved to ${statusFile}`)
      }
    } catch (error) {
      this.error(`Sync operation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private calculateRollingErrorRate(errorWindow: boolean[], windowSize: number): number {
    const recentErrors = errorWindow.slice(-windowSize)
    if (recentErrors.length === 0) return 0
    return (recentErrors.filter(Boolean).length / recentErrors.length) * 100
  }

  private async getProcessedPins(statusFile: string, successFilter?: number): Promise<Set<string>> {
    try {
      const content = await fs.readFile(statusFile, 'utf8')
      const lines = content.split('\n').slice(1) // Skip header
      return new Set(
        lines
          .filter((line) => line.trim())
          .filter((line) => {
            if (successFilter === undefined) return true
            const success = line.split(',')[2]
            return Number(success) === successFilter
          })
          .map((line) => line.split(',')[0]),
      )
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
        cid: result.cid,
        error: result.error || '',
        size: result.size,
        success: result.error ? 0 : 1,
        type: result.type,
      })
    }
  }

  private async writeCsvLine(file: string, data: Record<string, number | string>) {
    // Ensure columns are written in the correct order
    const orderedData = [data.cid, data.type, data.success, data.size, data.error]
    const line = orderedData.join(',') + '\n'
    await fs.appendFile(file, line)
  }
}
