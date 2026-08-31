import {createDecipheriv, pbkdf2Sync, scryptSync, timingSafeEqual} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {keccak256} from 'viem'

/**
 * Ethereum keystore v3 (Web3 Secret Storage) decryption, as written by
 * `cast wallet import` (Foundry), geth, and most other Ethereum tooling.
 * Implemented with node:crypto + viem's keccak256 - no extra dependencies.
 */

interface KeystoreCrypto {
  cipher: string
  cipherparams: {iv: string}
  ciphertext: string
  kdf: string
  kdfparams: {
    c?: number
    dklen: number
    n?: number
    p?: number
    prf?: string
    r?: number
    salt: string
  }
  mac: string
}

export interface KeystoreV3 {
  Crypto?: KeystoreCrypto
  crypto?: KeystoreCrypto
  version: number
}

// Resolves a keystore reference: anything path-like is used as a file path,
// a bare name is looked up in Foundry's keystore directory
// ($FOUNDRY_DIR/keystores, default ~/.foundry/keystores).
export const resolveKeystorePath = (nameOrPath: string, env: NodeJS.ProcessEnv = process.env): string => {
  if (isAbsolute(nameOrPath) || nameOrPath.includes('/') || nameOrPath.startsWith('~')) {
    return nameOrPath.startsWith('~/') ? join(homedir(), nameOrPath.slice(2)) : nameOrPath
  }

  const foundryDir = env.FOUNDRY_DIR || join(homedir(), '.foundry')
  return join(foundryDir, 'keystores', nameOrPath)
}

export const readKeystore = async (path: string): Promise<KeystoreV3> => {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch {
    throw new Error(`Could not read keystore at ${path}. Create one with: cast wallet import <name>`)
  }

  const parsed = JSON.parse(content) as KeystoreV3
  if (parsed.version !== 3 || !(parsed.crypto ?? parsed.Crypto)) {
    throw new Error(`${path} is not an Ethereum keystore v3 file`)
  }

  return parsed
}

// Decrypts a keystore v3 payload into a 0x-prefixed private key.
export const decryptKeystore = (keystore: KeystoreV3, password: string): `0x${string}` => {
  const crypto = keystore.crypto ?? keystore.Crypto
  if (!crypto) {
    throw new Error('Keystore has no crypto section')
  }

  if (crypto.cipher !== 'aes-128-ctr') {
    throw new Error(`Unsupported keystore cipher: ${crypto.cipher}`)
  }

  const derivedKey = deriveKey(crypto, password)
  const ciphertext = Buffer.from(crypto.ciphertext, 'hex')

  const mac = Buffer.from(keccak256(Buffer.concat([derivedKey.subarray(16, 32), ciphertext])).slice(2), 'hex')
  const expectedMac = Buffer.from(crypto.mac.toLowerCase().replace(/^0x/, ''), 'hex')
  if (mac.length !== expectedMac.length || !timingSafeEqual(mac, expectedMac)) {
    throw new Error('Wrong keystore password (MAC mismatch)')
  }

  const decipher = createDecipheriv('aes-128-ctr', derivedKey.subarray(0, 16), Buffer.from(crypto.cipherparams.iv, 'hex'))
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return `0x${privateKey.toString('hex')}`
}

const deriveKey = (crypto: KeystoreCrypto, password: string): Buffer => {
  const {kdf, kdfparams} = crypto
  const {c, dklen, n, p, prf, r, salt: saltHex} = kdfparams
  const salt = Buffer.from(saltHex.replace(/^0x/, ''), 'hex')
  const passwordBuffer = Buffer.from(password, 'utf8')

  switch (kdf) {
    case 'scrypt': {
      if (!n || !r || !p) {
        throw new Error('Keystore scrypt parameters are incomplete')
      }

      return scryptSync(passwordBuffer, salt, dklen, {
        N: n,
        maxmem: 256 * n * r, // node's default 32MiB cap is too small for geth-strength params
        p,
        r,
      })
    }

    case 'pbkdf2': {
      if (prf !== 'hmac-sha256') {
        throw new Error(`Unsupported keystore pbkdf2 prf: ${prf}`)
      }

      if (!c) {
        throw new Error('Keystore pbkdf2 parameters are incomplete')
      }

      return pbkdf2Sync(passwordBuffer, salt, c, dklen, 'sha256')
    }

    default: {
      throw new Error(`Unsupported keystore kdf: ${kdf}`)
    }
  }
}
