import {createCipheriv, randomBytes, scryptSync} from 'node:crypto'
import {keccak256} from 'viem'

import {KeystoreV3} from '../../src/lib/upload/keystore.js'

// Builds an Ethereum keystore v3 JSON (scrypt, Foundry-default strength) for tests.
export const makeKeystore = (privateKey: `0x${string}`, passphrase: string, n = 8192): KeystoreV3 => {
  const salt = randomBytes(32)
  const iv = randomBytes(16)
  const [r, p, dklen] = [8, 1, 32]
  const derivedKey = scryptSync(Buffer.from(passphrase, 'utf8'), salt, dklen, {N: n, maxmem: 256 * n * r, p, r})
  const cipher = createCipheriv('aes-128-ctr', derivedKey.subarray(0, 16), iv)
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2), 'hex')), cipher.final()])
  const mac = keccak256(Buffer.concat([derivedKey.subarray(16, 32), ciphertext])).slice(2)

  return {
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: {iv: iv.toString('hex')},
      ciphertext: ciphertext.toString('hex'),
      kdf: 'scrypt',
      kdfparams: {dklen, n, p, r, salt: salt.toString('hex')},
      mac,
    },
    version: 3,
  }
}
