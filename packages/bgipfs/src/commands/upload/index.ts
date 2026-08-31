import {password} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {PaymentDetails, UploadResult, createUploader, formatPaymentDetails} from 'ipfs-uploader'
import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../base-command.js'
import {CONFIG_FILENAME, DEFAULT_PAYMENT_KEY_ENV, readConfig} from '../../lib/upload/config.js'

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

    let result: UploadResult
    try {
      const configPath = flags.config ? join(flags.config) : undefined
      const config = await readConfig(configPath, {
        getPassword: (keystorePath) => password({mask: true, message: `Password for keystore ${keystorePath}:`}),
        onPayment: (payment) =>
          this.logInfo(`Paying ${formatPaymentDetails(payment)} to ${payment.recipient} from ${payment.payer}`),
      })
      const uploader = createUploader(config)

      if (isHttpUrl(args.path)) {
        console.log('Uploading URL:', args.path)
        result = await uploader.add.url(args.path)
      } else {
        const stats = await stat(args.path)
        result = stats.isDirectory()
          ? await uploader.add.directory({dirPath: args.path})
          : await uploader.add.file(args.path)
      }
    } catch (error) {
      this.logError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    // Outside the try: logError exits via a thrown error, which must not be re-reported above.
    this.handleResult(result)
  }

  private handleResult(result: UploadResult) {
    if (result.results) {
      this.logInfo('Individual node results:')
      for (const [uploaderId, nodeResult] of result.results) {
        if (nodeResult.success) {
          const paid = nodeResult.payment ? ` (paid ${formatPaymentDetails(nodeResult.payment)})` : ''
          this.logInfo(`✓ ${uploaderId}: ${nodeResult.cid}${paid}`)
        } else {
          this.logInfo(`✗ ${uploaderId}: ${nodeResult.error || 'Failed'}`)
        }
      }
    }

    const paymentRequired = findPaymentRequired(result)
    if (result.success) {
      this.logSuccess(`File uploaded. CID: ${result.cid}`)
      if (result.payment) {
        this.logSuccess(`Paid ${formatPaymentDetails(result.payment)} from ${result.payment.payer}`)
      }

      if (result.errorCount) {
        this.logError(`${result.errorCount} / ${result.totalNodes} nodes failed`)
      } else if (result.successCount) {
        this.logSuccess(`Uploaded to ${result.successCount} / ${result.totalNodes} nodes`)
      }
    } else {
      if (paymentRequired) {
        this.logInfo(
          `This endpoint charges ${formatPaymentDetails(paymentRequired)} per upload. To pay automatically, add a payment section to ${CONFIG_FILENAME}:\n` +
            `  "payment": { "privateKeyEnv": "${DEFAULT_PAYMENT_KEY_ENV}", "maxAmount": "0.05" }\n` +
            `and export ${DEFAULT_PAYMENT_KEY_ENV}=0x... (or run "bgipfs upload config init --pay" in a fresh directory). ` +
            'Alternatively use an API key from https://www.bgipfs.com.',
        )
      } else if (!result.results) {
        console.log(result)
      }

      this.logError(result.error ? `Upload failed: ${result.error}` : 'Upload failed')
    }
  }
}

const isHttpUrl = (value: string): boolean => {
  try {
    const {protocol} = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// The 402 challenge behind a failed upload, from the top-level result or any failed node.
const findPaymentRequired = (result: UploadResult): PaymentDetails | undefined =>
  result.paymentRequired ?? result.results?.find(([, node]) => node.paymentRequired)?.[1].paymentRequired
