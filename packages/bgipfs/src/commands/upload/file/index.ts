import {Args, Flags} from '@oclif/core'
import {IpfsUploader} from 'ipfs-uploader'
import {join} from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {readConfig} from '../../../lib/upload/config.js'

export default class FileCommand extends BaseCommand {
  static args = {
    file: Args.string({
      description: 'Path to file',
      required: true,
    }),
  }

  static description = 'Upload a file to IPFS'

  static examples = [
    '$ bgipfs upload file path/to/file.txt',
    '$ bgipfs upload file --config ./custom/path/config.json path/to/file.txt',
  ]

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FileCommand)

    try {
      const configPath = flags.config ? join(flags.config) : undefined
      const config = await readConfig(configPath)
      const uploader = new IpfsUploader(config)
      const result = await uploader.add.file(args.file)
      this.logSuccess(`File uploaded successfully. CID: ${result.cid}`)
    } catch (error) {
      this.logError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
