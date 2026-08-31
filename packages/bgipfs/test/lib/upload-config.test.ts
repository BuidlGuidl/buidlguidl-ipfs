import {expect} from 'chai'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {readConfig, resolveUploaderConfig} from '../../src/lib/upload/config.js'
import {makeKeystore} from './keystore-fixture.js'

const KEY = `0x${'ab'.repeat(32)}`
const onPayment = () => {}

const errorOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
    throw new Error('expected rejection')
  } catch (error) {
    return error as Error
  }
}

describe('resolveUploaderConfig', () => {
  it('passes configs without payment through untouched', async () => {
    const config = {headers: {'X-API-Key': 'key'}, url: 'https://upload.bgipfs.com'}
    expect(await resolveUploaderConfig(config, {env: {}})).to.equal(config)
  })

  it('resolves the payer key from the named environment variable', async () => {
    const resolved = await resolveUploaderConfig(
      {headers: {}, payment: {maxAmount: '0.05', privateKeyEnv: 'MY_KEY'}, url: 'https://upload.bgipfs.com'},
      {env: {MY_KEY: ` ${KEY} `}, onPayment},
    )

    expect(resolved).to.deep.equal({
      headers: {},
      payment: {maxAmount: '0.05', onPayment, privateKey: KEY},
      url: 'https://upload.bgipfs.com',
    })
  })

  it('explains how to set a missing key', async () => {
    const error = await errorOf(
      resolveUploaderConfig({payment: {maxAmount: '0.05', privateKeyEnv: 'MY_KEY'}, url: 'https://x'}, {env: {}}),
    )
    expect(error.message).to.match(/MY_KEY is not set[\S\s]*export MY_KEY=0x/)
  })

  it('rejects keys that are not 32-byte hex', async () => {
    const error = await errorOf(
      resolveUploaderConfig(
        {payment: {maxAmount: '0.05', privateKeyEnv: 'MY_KEY'}, url: 'https://x'},
        {env: {MY_KEY: 'not-a-key'}},
      ),
    )
    expect(error.message).to.match(/MY_KEY must be a 32-byte hex private key/)
  })

  it('rejects incomplete payment sections', async () => {
    const error = await errorOf(
      resolveUploaderConfig({payment: {maxAmount: '', privateKeyEnv: 'MY_KEY'}, url: 'https://x'}, {env: {MY_KEY: KEY}}),
    )
    expect(error.message).to.match(/"maxAmount" and one of "keystore" or "privateKeyEnv" are required/)
  })

  it('rejects configuring both keystore and privateKeyEnv', async () => {
    const error = await errorOf(
      resolveUploaderConfig(
        {payment: {keystore: 'payer', maxAmount: '0.05', privateKeyEnv: 'MY_KEY'}, url: 'https://x'},
        {env: {MY_KEY: KEY}},
      ),
    )
    expect(error.message).to.match(/either "keystore" or "privateKeyEnv", not both/)
  })

  describe('keystore payment', () => {
    let keystorePath: string

    before(async () => {
      const dir = await mkdtemp(join(tmpdir(), 'bgipfs-keystore-'))
      keystorePath = join(dir, 'payer.json')
      await writeFile(keystorePath, JSON.stringify(makeKeystore(KEY as `0x${string}`, 'hunter2')))
    })

    it('decrypts with the password from the environment', async () => {
      const resolved = await resolveUploaderConfig(
        {payment: {keystore: keystorePath, maxAmount: '0.05'}, url: 'https://upload.bgipfs.com'},
        {env: {BGIPFS_KEYSTORE_PASSWORD: 'hunter2'}, onPayment},
      )
      expect(resolved).to.deep.equal({
        payment: {maxAmount: '0.05', onPayment, privateKey: KEY},
        url: 'https://upload.bgipfs.com',
      })
    })

    it('prompts for the password when the environment is unset', async () => {
      const prompted: string[] = []
      const resolved = await resolveUploaderConfig(
        {payment: {keystore: keystorePath, maxAmount: '0.05'}, url: 'https://x'},
        {
          env: {},
          async getPassword(path) {
            prompted.push(path)
            return 'hunter2'
          },
        },
      )
      expect(prompted).to.deep.equal([keystorePath])
      expect(resolved).to.have.nested.property('payment.privateKey', KEY)
    })

    it('prompts when the environment password is set but empty', async () => {
      const prompted: string[] = []
      const resolved = await resolveUploaderConfig(
        {payment: {keystore: keystorePath, maxAmount: '0.05'}, url: 'https://x'},
        {
          env: {BGIPFS_KEYSTORE_PASSWORD: ''},
          async getPassword(path) {
            prompted.push(path)
            return 'hunter2'
          },
        },
      )
      expect(prompted).to.deep.equal([keystorePath])
      expect(resolved).to.have.nested.property('payment.privateKey', KEY)
    })

    it('rejects a wrong password', async () => {
      const error = await errorOf(
        resolveUploaderConfig(
          {payment: {keystore: keystorePath, maxAmount: '0.05'}, url: 'https://x'},
          {env: {BGIPFS_KEYSTORE_PASSWORD: 'nope'}},
        ),
      )
      expect(error.message).to.match(/Wrong keystore password/)
    })

    it('explains how to supply a password non-interactively', async () => {
      const error = await errorOf(
        resolveUploaderConfig({payment: {keystore: keystorePath, maxAmount: '0.05'}, url: 'https://x'}, {env: {}}),
      )
      expect(error.message).to.match(/BGIPFS_KEYSTORE_PASSWORD or run interactively/)
    })

    it('points missing keystores at cast wallet import', async () => {
      const error = await errorOf(
        resolveUploaderConfig(
          {payment: {keystore: '/nonexistent/ks.json', maxAmount: '0.05'}, url: 'https://x'},
          {env: {BGIPFS_KEYSTORE_PASSWORD: 'x'}},
        ),
      )
      expect(error.message).to.match(/cast wallet import/)
    })
  })
})

const keystoreEntry = (keystore: string, url: string) => ({payment: {keystore, maxAmount: '0.05'}, url})

describe('readConfig with multiple entries', () => {
  it('prompts sequentially and unlocks each keystore only once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bgipfs-multi-keystore-'))
    const ks1 = join(dir, 'payer1.json')
    const ks2 = join(dir, 'payer2.json')
    await writeFile(ks1, JSON.stringify(makeKeystore(KEY as `0x${string}`, 'hunter2')))
    await writeFile(ks2, JSON.stringify(makeKeystore(KEY as `0x${string}`, 'hunter2')))
    const configPath = join(dir, 'ipfs-upload.config.json')
    // ks1 appears twice: the second occurrence must come from the memo
    await writeFile(
      configPath,
      JSON.stringify([keystoreEntry(ks1, 'https://a'), keystoreEntry(ks2, 'https://b'), keystoreEntry(ks1, 'https://c')]),
    )

    let active = 0
    let maxActive = 0
    const prompted: string[] = []
    const resolved = await readConfig(configPath, {
      env: {},
      async getPassword(path) {
        active += 1
        maxActive = Math.max(maxActive, active)
        prompted.push(path)
        await new Promise((resolve) => {
          setTimeout(resolve, 20)
        })
        active -= 1
        return 'hunter2'
      },
    })

    // Interactive prompts cannot overlap on one terminal
    expect(maxActive).to.equal(1)
    expect(prompted).to.deep.equal([ks1, ks2])
    expect(resolved).to.be.an('array').with.lengthOf(3)
    for (const config of resolved as unknown[]) {
      expect(config).to.have.nested.property('payment.privateKey', KEY)
    }
  })
})
