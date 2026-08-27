import {expect} from 'chai'
import {readFile} from 'node:fs/promises'

import {DEFAULT_VERSIONS} from '../../src/lib/default-versions.js'

const readTemplate = async (name: string): Promise<string> =>
  readFile(new URL(`../../templates/${name}`, import.meta.url), 'utf8')

describe('default-versions', () => {
  it('matches the tags pinned in the compose template', async () => {
    const compose = await readTemplate('docker-compose.yml')

    expect(compose).to.include(`image: ipfs/kubo:${DEFAULT_VERSIONS.ipfs}`)
    expect(compose).to.include(`image: ipfs/ipfs-cluster:${DEFAULT_VERSIONS.cluster}`)
    expect(compose).to.include(`image: traefik:${DEFAULT_VERSIONS.traefik}`)
  })

  it('matches the tags pinned in the init compose template', async () => {
    const compose = await readTemplate('init.docker-compose.yml')

    expect(compose).to.include(`image: ipfs/kubo:${DEFAULT_VERSIONS.ipfs}`)
    expect(compose).to.include(`image: ipfs/ipfs-cluster:${DEFAULT_VERSIONS.cluster}`)
  })
})
