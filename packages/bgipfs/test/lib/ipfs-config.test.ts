import {expect} from 'chai'
import {chmod, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {
  backupIpfsConfig,
  computeIpfsConfigChanges,
  getTargetRepoVersion,
  mergeIpfsConfig,
  readIpfsConfig,
  readIpfsRepoVersion,
  writeIpfsConfig,
} from '../../src/lib/ipfs-config.js'

describe('ipfs-config', () => {
  let workdir: string

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'bgipfs-ipfs-config-'))
  })

  afterEach(async () => {
    await rm(workdir, {force: true, recursive: true})
  })

  it('computes changes for nested dotted keys', () => {
    const config = {
      Reprovider: {
        Strategy: 'all',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const changes = computeIpfsConfigChanges(config, {
      'Provide.Strategy': 'pinned+entities',
      'Routing.Type': 'dht',
    })

    expect(changes).to.deep.equal([
      {
        key: 'Provide.Strategy',
        nextValue: 'pinned+entities',
        previousValue: undefined,
        type: 'set',
      },
      {
        key: 'Routing.Type',
        nextValue: 'dht',
        previousValue: 'auto',
        type: 'set',
      },
    ])
  })

  it('computes removals for deprecated keys', () => {
    const config = {
      Reprovider: {
        Strategy: 'roots',
      },
      Routing: {
        Type: 'dht',
      },
    }

    const changes = computeIpfsConfigChanges(
      config,
      {
        'Routing.Type': 'dht',
      },
      ['Reprovider'],
    )

    expect(changes).to.deep.equal([
      {
        key: 'Reprovider',
        nextValue: undefined,
        previousValue: {
          Strategy: 'roots',
        },
        type: 'remove',
      },
    ])
  })

  it('removes deprecated keys while merging owned keys', () => {
    const config = {
      Reprovider: {
        Strategy: 'all',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const merged = mergeIpfsConfig(
      config,
      {
        'Provide.Strategy': 'pinned+entities',
        'Routing.Type': 'dht',
      },
      ['Reprovider'],
    )

    expect(merged).to.deep.equal({
      Provide: {
        Strategy: 'pinned+entities',
      },
      Routing: {
        Type: 'dht',
      },
    })
  })

  it('does not report current keys as changes', () => {
    const config = {
      Provide: {
        Strategy: 'pinned+entities',
      },
      Routing: {
        Type: 'dht',
      },
    }

    const changes = computeIpfsConfigChanges(config, {
      'Provide.Strategy': 'pinned+entities',
      'Routing.Type': 'dht',
    })

    expect(changes).to.deep.equal([])
  })

  it('does not report absent removals as changes', () => {
    const changes = computeIpfsConfigChanges(
      {
        Routing: {
          Type: 'dht',
        },
      },
      {},
      ['Reprovider'],
    )

    expect(changes).to.deep.equal([])
  })

  it('computes current reprovider strategy changes for legacy configs', () => {
    const config = {
      Reprovider: {
        Strategy: 'all',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const changes = computeIpfsConfigChanges(
      config,
      {
        'Provide.Strategy': 'pinned+entities',
        'Routing.Type': 'dht',
      },
      ['Reprovider'],
    )

    expect(changes).to.deep.equal([
      {
        key: 'Reprovider',
        nextValue: undefined,
        previousValue: {
          Strategy: 'all',
        },
        type: 'remove',
      },
      {
        key: 'Provide.Strategy',
        nextValue: 'pinned+entities',
        previousValue: undefined,
        type: 'set',
      },
      {
        key: 'Routing.Type',
        nextValue: 'dht',
        previousValue: 'auto',
        type: 'set',
      },
    ])
  })

  it('computes changes for nested dotted keys with existing provide config', () => {
    const config = {
      Provide: {
        Strategy: 'all',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const changes = computeIpfsConfigChanges(config, {
      'Provide.Strategy': 'pinned+entities',
      'Routing.Type': 'dht',
    })

    expect(changes).to.deep.equal([
      {
        key: 'Provide.Strategy',
        nextValue: 'pinned+entities',
        previousValue: 'all',
        type: 'set',
      },
      {
        key: 'Routing.Type',
        nextValue: 'dht',
        previousValue: 'auto',
        type: 'set',
      },
    ])
  })

  it('computes changes for legacy nested dotted keys', () => {
    const config = {
      Reprovider: {
        Strategy: 'all',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const changes = computeIpfsConfigChanges(config, {
      'Reprovider.Strategy': 'roots',
      'Routing.Type': 'dht',
    })

    expect(changes).to.deep.equal([
      {
        key: 'Reprovider.Strategy',
        nextValue: 'roots',
        previousValue: 'all',
        type: 'set',
      },
      {
        key: 'Routing.Type',
        nextValue: 'dht',
        previousValue: 'auto',
        type: 'set',
      },
    ])
  })

  it('merges owned keys while preserving unrelated config', () => {
    const config = {
      Addresses: {
        Swarm: ['/ip4/0.0.0.0/tcp/4001'],
      },
      Identity: {
        PeerID: 'peer-id',
        PrivKey: 'private-key',
      },
      Routing: {
        Type: 'auto',
      },
    }

    const merged = mergeIpfsConfig(config, {
      'Provide.Strategy': 'pinned+entities',
      'Routing.Type': 'dht',
    })

    expect(merged).to.deep.equal({
      Addresses: {
        Swarm: ['/ip4/0.0.0.0/tcp/4001'],
      },
      Identity: {
        PeerID: 'peer-id',
        PrivKey: 'private-key',
      },
      Provide: {
        Strategy: 'pinned+entities',
      },
      Routing: {
        Type: 'dht',
      },
    })
    expect(config).to.deep.equal({
      Addresses: {
        Swarm: ['/ip4/0.0.0.0/tcp/4001'],
      },
      Identity: {
        PeerID: 'peer-id',
        PrivKey: 'private-key',
      },
      Routing: {
        Type: 'auto',
      },
    })
  })

  it('backs up and writes ipfs config JSON', async () => {
    const configPath = path.join(workdir, 'ipfs.config.json')
    const backupDir = path.join(workdir, 'config-backup')
    await writeFile(configPath, '{"Routing":{"Type":"auto"}}\n')

    const backupPath = await backupIpfsConfig(configPath, backupDir)
    await writeIpfsConfig({Routing: {Type: 'dht'}}, configPath)

    const backupFiles = await readdir(backupDir)
    expect(backupFiles).to.have.length(1)
    expect(backupPath).to.equal(path.join(backupDir, backupFiles[0]))
    expect(await readFile(backupPath, 'utf8')).to.equal('{"Routing":{"Type":"auto"}}\n')
    expect(await readIpfsConfig(configPath)).to.deep.equal({Routing: {Type: 'dht'}})
  })

  it('reads repo version when present', async () => {
    const versionPath = path.join(workdir, 'version')
    await writeFile(versionPath, '18\n')

    expect(await readIpfsRepoVersion(versionPath)).to.equal(18)
  })

  it('returns undefined when repo version is unavailable or invalid', async () => {
    const versionPath = path.join(workdir, 'version')
    await writeFile(versionPath, 'not-a-number\n')

    expect(await readIpfsRepoVersion(versionPath)).to.equal(undefined)
    expect(await readIpfsRepoVersion(path.join(workdir, 'missing'))).to.equal(undefined)
  })

  it('maps Kubo versions to their target repo version', () => {
    expect(getTargetRepoVersion('v0.41.0')).to.equal(18)
    expect(getTargetRepoVersion('0.38.0')).to.equal(18)
    expect(getTargetRepoVersion('v0.41.0-rc1')).to.equal(18)
    expect(getTargetRepoVersion('v1.0.0')).to.equal(18)
    expect(getTargetRepoVersion('v0.37.9')).to.equal(undefined)
    expect(getTargetRepoVersion('release')).to.equal(undefined)
    expect(getTargetRepoVersion('latest')).to.equal(undefined)
  })

  it('reports a permission hint when the config is not writable', async function () {
    if (process.getuid?.() === 0) {
      this.skip()
    }

    const configPath = path.join(workdir, 'config')
    await writeFile(configPath, '{}\n')
    await chmod(configPath, 0o444)

    try {
      await writeIpfsConfig({Routing: {Type: 'dht'}}, configPath)
      expect.fail('expected writeIpfsConfig to throw')
    } catch (error) {
      expect((error as Error).message).to.include('sudo chown')
      expect((error as Error).message).to.include(configPath)
    }
  })
})
