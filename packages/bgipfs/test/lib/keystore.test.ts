import {expect} from 'chai'
import {join} from 'node:path'

import {decryptKeystore, resolveKeystorePath} from '../../src/lib/upload/keystore.js'
import {makeKeystore} from './keystore-fixture.js'

// Official Web3 Secret Storage Definition test vectors: password "testpassword"
// encrypting secret 0x7a28...fe9d, one per KDF.
const SECRET = '0x7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d'
const PASSWORD = 'testpassword'

const pbkdf2Vector = {
  crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: {iv: '6087dab2f9fdbbfaddc31a909735c1e6'},
    ciphertext: '5318b4d5bcd28de64ee5559e671353e16f075ecae9f99c7a79a38af5f869aa46',
    kdf: 'pbkdf2',
    kdfparams: {
      c: 262_144,
      dklen: 32,
      prf: 'hmac-sha256',
      salt: 'ae3cd4e7013836a3df6bd7241b12db061dbe2c6785853cce422d148a624ce0bd',
    },
    mac: '517ead924a9d0dc3124507e3393d175ce3ff7c1e96529c6c555ce9e51205e9b2',
  },
  version: 3,
}

const errorOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
    throw new Error('expected rejection')
  } catch (error) {
    return error as Error
  }
}

describe('decryptKeystore', () => {
  it('decrypts the spec pbkdf2 test vector', async () => {
    expect(await decryptKeystore(pbkdf2Vector, PASSWORD)).to.equal(SECRET)
  })

  // The spec's scrypt vector uses r=1 with n=262144, which OpenSSL rejects
  // (it enforces scrypt's N < 2^(16r)); real keystores use r=8, covered here.
  it('round-trips a generated Foundry-strength (n=8192) scrypt keystore', async () => {
    const key = `0x${'ab'.repeat(32)}` as const
    expect(await decryptKeystore(makeKeystore(key, 'hunter2'), 'hunter2')).to.equal(key)
  })

  it('round-trips a geth-strength (n=262144) scrypt keystore', async () => {
    const key = `0x${'cd'.repeat(32)}` as const
    expect(await decryptKeystore(makeKeystore(key, 'hunter2', 262_144), 'hunter2')).to.equal(key)
  })

  it('rejects a wrong password via the MAC check', async () => {
    const error = await errorOf(decryptKeystore(pbkdf2Vector, 'wrong-password'))
    expect(error.message).to.match(/Wrong keystore password/)
  })

  it('rejects unsupported ciphers', async () => {
    const bad = {...pbkdf2Vector, crypto: {...pbkdf2Vector.crypto, cipher: 'aes-256-gcm'}}
    const error = await errorOf(decryptKeystore(bad, PASSWORD))
    expect(error.message).to.match(/Unsupported keystore cipher/)
  })
})

describe('resolveKeystorePath', () => {
  it('resolves bare names inside the Foundry keystore directory', () => {
    expect(resolveKeystorePath('payer', {FOUNDRY_DIR: '/opt/foundry'})).to.equal('/opt/foundry/keystores/payer')
  })

  it('defaults to ~/.foundry for bare names', () => {
    expect(resolveKeystorePath('payer', {})).to.match(/\.foundry\/keystores\/payer$/)
  })

  it('passes paths through', () => {
    expect(resolveKeystorePath('/tmp/ks.json', {})).to.equal('/tmp/ks.json')
    expect(resolveKeystorePath('./ks.json', {})).to.equal('./ks.json')
  })

  it('expands ~/', () => {
    expect(resolveKeystorePath('~/wallets/ks.json', {})).to.equal(join(process.env.HOME || '', 'wallets/ks.json'))
  })
})
