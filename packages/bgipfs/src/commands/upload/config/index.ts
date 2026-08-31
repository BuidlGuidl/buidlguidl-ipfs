import {Args, Flags} from '@oclif/core'
import {access, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {
  CONFIG_FILENAME,
  DEFAULT_MAX_PAYMENT,
  DEFAULT_PAYMENT_KEY_ENV,
  KEYSTORE_PASSWORD_ENV,
  UploadConfigFile,
  UploadNodeConfig,
} from '../../../lib/upload/config.js'

const DEFAULT_NODE_URL = 'http://127.0.0.1:5001'
const BGIPFS_UPLOAD_URL = 'https://upload.bgipfs.com'

export default class ConfigCommand extends BaseCommand {
  static args = {
    action: Args.string({
      description: 'Action to perform (init|get)',
      options: ['init', 'get'],
      required: true,
    }),
  }

  static description = 'Manage IPFS upload configuration'

  static examples = [
    '$ bgipfs upload config init',
    '$ bgipfs upload config init --nodeUrl https://upload.bgipfs.com --apiKey <key>',
    '$ bgipfs upload config init --pay',
    '$ bgipfs upload config init --pay --keystore my-wallet',
    '$ bgipfs upload config init --pay --paymentKeyEnv MY_WALLET_KEY --maxPayment 0.02',
    '$ bgipfs upload config get',
  ]

  static flags = {
    apiKey: Flags.string({
      char: 'k',
      description: 'BGIPFS API key',
      required: false,
    }),
    keystore: Flags.string({
      description:
        'Foundry keystore name (under ~/.foundry/keystores, see "cast wallet import") or path to an Ethereum keystore v3 file to pay from; implies --pay',
      exclusive: ['paymentKeyEnv'],
      required: false,
    }),
    maxPayment: Flags.string({
      description: `Spend cap per upload in USDC when paying (default ${DEFAULT_MAX_PAYMENT}); implies --pay`,
      required: false,
    }),
    nodeAuth: Flags.string({
      char: 'a',
      description: 'Node authorization header',
      required: false,
    }),
    nodeUrl: Flags.string({
      char: 'u',
      description: `Node URL (default ${DEFAULT_NODE_URL}, or ${BGIPFS_UPLOAD_URL} when paying)`,
      required: false,
    }),
    pay: Flags.boolean({
      description:
        'Pay per upload (MPP/x402, USDC) instead of using an API key. The wallet key is read from an environment variable at upload time, never stored',
      required: false,
    }),
    paymentKeyEnv: Flags.string({
      description: `Environment variable holding the payer wallet's private key (default ${DEFAULT_PAYMENT_KEY_ENV}); implies --pay`,
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConfigCommand)

    switch (args.action) {
      case 'init': {
        const pay =
          flags.pay || flags.keystore !== undefined || flags.paymentKeyEnv !== undefined || flags.maxPayment !== undefined
        const config: UploadNodeConfig = {
          headers: {},
          url: flags.nodeUrl ?? (pay ? BGIPFS_UPLOAD_URL : DEFAULT_NODE_URL),
        }

        if (flags.apiKey) {
          config.headers = {
            'X-API-Key': flags.apiKey,
          }
        } else if (flags.nodeAuth) {
          config.headers = {Authorization: flags.nodeAuth}
        }

        if (pay) {
          config.payment = flags.keystore
            ? {keystore: flags.keystore, maxAmount: flags.maxPayment ?? DEFAULT_MAX_PAYMENT}
            : {
                maxAmount: flags.maxPayment ?? DEFAULT_MAX_PAYMENT,
                privateKeyEnv: flags.paymentKeyEnv ?? DEFAULT_PAYMENT_KEY_ENV,
              }
        }

        await this.initConfig(config)
        break
      }

      case 'get': {
        await this.getConfig()
        break
      }

      default: {
        this.error(`Unknown action: ${args.action}`)
      }
    }
  }

  private async getConfig(): Promise<void> {
    const config = await this.readConfig()
    this.logInfo(JSON.stringify(config, null, 2))
  }

  private async initConfig(config: UploadNodeConfig): Promise<void> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      await access(configFilePath)
      this.logWarning(`Configuration file already exists at ${CONFIG_FILENAME}.`)
    } catch {
      await writeFile(configFilePath, JSON.stringify(config, null, 2))
      this.logSuccess('Configuration file initialized successfully.')
      if (config.payment?.keystore) {
        this.logInfo(
          `Uploads will be paid from keystore "${config.payment.keystore}" ` +
            `(cap ${config.payment.maxAmount} USDC per upload). ` +
            `You will be prompted for its password, or set ${KEYSTORE_PASSWORD_ENV} for unattended use. ` +
            'Use a dedicated low-balance wallet.',
        )
      } else if (config.payment) {
        this.logInfo(
          `Uploads will be paid from the wallet in $${config.payment.privateKeyEnv} ` +
            `(cap ${config.payment.maxAmount} USDC per upload). Export it before uploading:\n` +
            `  export ${config.payment.privateKeyEnv}=0x...\n` +
            'Use a dedicated low-balance wallet.',
        )
      }
    }
  }

  private async readConfig(): Promise<UploadConfigFile> {
    const configFilePath = join(process.cwd(), CONFIG_FILENAME)

    try {
      const configContent = await readFile(configFilePath, 'utf8')
      return JSON.parse(configContent)
    } catch {
      this.logError('Configuration file not found. Run upload init command first.')
      throw new Error('Configuration file not found. Run upload init command first.')
    }
  }
}
