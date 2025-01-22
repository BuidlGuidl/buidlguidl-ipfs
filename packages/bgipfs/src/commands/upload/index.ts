import {Args, Flags} from '@oclif/core'
import {UploadResult, createUploader} from 'ipfs-uploader'
import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../base-command.js'
import {readConfig} from '../../lib/upload/config.js'

export default class UploadCommand extends BaseCommand {
  static args = {
    path: Args.string({
      description: 'Path to file/directory or URL to upload',
      required: true,
    }),
  }

  static description = 'Upload a file, directory, or URL to IPFS'

  static examples = [
    '$ bgipfs upload path/to/file.txt',
    '$ bgipfs upload path/to/directory',
    '$ bgipfs upload https://example.com',
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
      const configPath = flags.config ? join(flags.config) : undefined
      const config = await readConfig(configPath)
      const uploader = createUploader(config)

      // Check if input is a URL
      try {
        const url = new URL(args.path)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          console.log('Uploading URL:', args.path)
          const result = await uploader.add.url(args.path)
          this.handleResult(result)
          return
        }
      } catch {
        // Not a URL, continue with file/directory handling
      }

      // Handle file/directory upload
      const stats = await stat(args.path)
      const result = stats.isDirectory()
        ? await uploader.add.directory({dirPath: args.path})
        : await uploader.add.file(args.path)

      this.handleResult(result)
    } catch (error) {
      this.logError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private handleResult(result: UploadResult) {
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
      } else if (result.successCount) {
        this.logSuccess(`Uploaded to ${result.successCount} / ${result.totalNodes} nodes`)
      }
    } else {
      console.log(result)
      this.logError('Upload failed')
    }
  }
}
