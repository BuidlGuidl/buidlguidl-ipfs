import {Args, Flags} from '@oclif/core'
import {createUploader} from 'ipfs-uploader'
import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../base-command.js'
import {readConfig} from '../../lib/upload/config.js'

export default class UploadCommand extends BaseCommand {
  static args = {
    path: Args.string({
      description: 'Path to file or directory',
      required: true,
    }),
  }

  static description = 'Upload a file or directory to IPFS'

  static examples = [
    '$ bgipfs upload path/to/file.txt',
    '$ bgipfs upload path/to/directory',
    '$ bgipfs upload --config ./custom/path/config.json path/to/file.txt',
  ]

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(UploadCommand)

    try {
      const stats = await stat(args.path)
      const configPath = flags.config ? join(flags.config) : undefined
      const config = await readConfig(configPath)
      const uploader = createUploader(config)

      const result = stats.isDirectory()
        ? await uploader.add.directory({path: args.path})
        : await uploader.add.file(args.path)

      if (result.results) {
        this.logInfo('Individual node results:')
        for (const [uploaderId, nodeResult] of result.results) {
          if (nodeResult.success) {
            this.logInfo(`✓ ${uploaderId}: ${nodeResult.cid}`)
          } else {
            this.logInfo(`✗ ${uploaderId}: ${nodeResult.error || 'Failed'}`)
          }
        }
      }

      if (result.success) {
        this.logSuccess(`File uploaded. CID: ${result.cid}`)
        if (result.errorCount) {
          this.logError(`${result.errorCount} / ${result.totalNodes} nodes failed`)
        } else {
          this.logSuccess(`Uploaded to ${result.successCount} / ${result.totalNodes} nodes`)
        }
      } else {
        console.log(result)
        this.logError('Upload failed')
      }
    } catch (error) {
      this.logError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
