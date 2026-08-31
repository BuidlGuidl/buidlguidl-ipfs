import {KuboOptions, PaymentDetails, UploaderConfig} from 'ipfs-uploader'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {decryptKeystore, readKeystore, resolveKeystorePath} from './keystore.js'

export const CONFIG_FILENAME = 'ipfs-upload.config.json'

export const DEFAULT_PAYMENT_KEY_ENV = 'BGIPFS_PAYMENT_KEY'
export const DEFAULT_MAX_PAYMENT = '0.05'
export const KEYSTORE_PASSWORD_ENV = 'BGIPFS_KEYSTORE_PASSWORD'

/**
 * Payment section of ipfs-upload.config.json. The wallet key itself is never
 * stored in the file: it comes from either an encrypted keystore (`keystore`)
 * or an environment variable (`privateKeyEnv`) at upload time.
 */
export interface UploadPaymentConfig {
  /** Foundry keystore name (under ~/.foundry/keystores) or path to an Ethereum keystore v3 file */
  keystore?: string
  /** Spend cap per upload, in display units of the accepted currency (USDC) */
  maxAmount: string
  /** Name of the environment variable holding the payer wallet's hex private key */
  privateKeyEnv?: string
}

/** Shape of ipfs-upload.config.json for a single IPFS node / bgipfs endpoint. */
export type UploadNodeConfig = {payment?: UploadPaymentConfig} & KuboOptions

export type UploadConfigFile = Array<UploadNodeConfig | UploaderConfig> | UploadNodeConfig | UploaderConfig

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv
  /** Interactive password prompt for keystore decryption (used when $BGIPFS_KEYSTORE_PASSWORD is not set) */
  getPassword?: (keystorePath: string) => Promise<string>
  onPayment?: (payment: PaymentDetails) => void
}

const hasPaymentConfig = (config: unknown): config is {payment: UploadPaymentConfig} & UploadNodeConfig =>
  Boolean(config && typeof config === 'object' && 'payment' in config && config.payment)

const isHexKey = (value: string): value is `0x${string}` => /^0x[\da-f]{64}$/i.test(value)

// Turns a config-file entry into an ipfs-uploader config, resolving the payer
// key from the configured keystore or environment variable.
export const resolveUploaderConfig = async (
  config: UploadNodeConfig | UploaderConfig,
  options: ResolveOptions = {},
): Promise<UploaderConfig> => {
  if (!hasPaymentConfig(config)) {
    return config
  }

  const {payment, ...node} = config
  const {keystore, maxAmount, privateKeyEnv} = payment
  if (!maxAmount || (!privateKeyEnv && !keystore)) {
    throw new Error(
      `Invalid payment config in ${CONFIG_FILENAME}: "maxAmount" and one of "keystore" or "privateKeyEnv" are required`,
    )
  }

  if (privateKeyEnv && keystore) {
    throw new Error(`Invalid payment config in ${CONFIG_FILENAME}: set either "keystore" or "privateKeyEnv", not both`)
  }

  const env = options.env ?? process.env
  const privateKey = keystore
    ? await keystorePrivateKey(keystore, env, options.getPassword)
    : envPrivateKey(privateKeyEnv as string, env)

  return {
    ...node,
    payment: {maxAmount, onPayment: options.onPayment, privateKey},
  }
}

export async function readConfig(
  configPath?: string,
  options: ResolveOptions = {},
): Promise<UploaderConfig | UploaderConfig[]> {
  let parsed: UploadConfigFile
  try {
    const targetPath = configPath || join(process.cwd(), CONFIG_FILENAME)
    const configContent = await readFile(targetPath, 'utf8')
    parsed = JSON.parse(configContent)
  } catch {
    throw new Error('Failed to read config file. Run "bgipfs upload config init" first.')
  }

  return Array.isArray(parsed)
    ? Promise.all(parsed.map((entry) => resolveUploaderConfig(entry, options)))
    : resolveUploaderConfig(parsed, options)
}

const envPrivateKey = (privateKeyEnv: string, env: NodeJS.ProcessEnv): `0x${string}` => {
  const privateKey = env[privateKeyEnv]?.trim()
  if (!privateKey) {
    throw new Error(
      `Payment is configured but ${privateKeyEnv} is not set. Export the payer wallet's private key:\n` +
        `  export ${privateKeyEnv}=0x...`,
    )
  }

  if (!isHexKey(privateKey)) {
    throw new Error(`${privateKeyEnv} must be a 32-byte hex private key (0x followed by 64 hex characters)`)
  }

  return privateKey
}

const keystorePrivateKey = async (
  keystore: string,
  env: NodeJS.ProcessEnv,
  getPassword?: ResolveOptions['getPassword'],
): Promise<`0x${string}`> => {
  const path = resolveKeystorePath(keystore, env)
  const parsed = await readKeystore(path)

  const password = env[KEYSTORE_PASSWORD_ENV] ?? (await getPassword?.(path))
  if (password === undefined) {
    throw new Error(`Keystore payment needs a password: set ${KEYSTORE_PASSWORD_ENV} or run interactively`)
  }

  const privateKey = decryptKeystore(parsed, password)
  if (!isHexKey(privateKey)) {
    throw new Error(`${path} does not contain a 32-byte private key`)
  }

  return privateKey
}
