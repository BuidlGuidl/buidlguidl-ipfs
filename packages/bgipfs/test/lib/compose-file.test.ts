import {expect} from 'chai'

import {
  hasIpfsConfigBindMount,
  isValidDockerTag,
  removeIpfsConfigBindMount,
  replaceServiceImage,
} from '../../src/lib/compose-file.js'

const SAMPLE_COMPOSE = `services:
  ipfs:
    container_name: ipfs
    image: ipfs/kubo:release
    volumes:
      - ./data/ipfs:/data/ipfs
      - ./ipfs.config.json:/data/ipfs/config:ro

  cluster:
    container_name: cluster
    image: ipfs/ipfs-cluster:\${IPFS_CLUSTER_VERSION:-latest}
    volumes:
      - ./data/ipfs-cluster:/data/ipfs-cluster

  traefik:
    image: traefik:v3.1
    ports:
      - "5555:5555"
`

describe('compose-file', () => {
  describe('replaceServiceImage', () => {
    it('replaces only the named service image', () => {
      const updated = replaceServiceImage(SAMPLE_COMPOSE, 'ipfs', 'ipfs/kubo:v0.41.0')

      expect(updated).to.include('    image: ipfs/kubo:v0.41.0')
      expect(updated).to.not.include('ipfs/kubo:release')
      // eslint-disable-next-line no-template-curly-in-string
      expect(updated).to.include('image: ipfs/ipfs-cluster:${IPFS_CLUSTER_VERSION:-latest}')
      expect(updated).to.include('image: traefik:v3.1')
    })

    it('replaces images for later services', () => {
      const updated = replaceServiceImage(SAMPLE_COMPOSE, 'traefik', 'traefik:v3.6.1')

      expect(updated).to.include('    image: traefik:v3.6.1')
      expect(updated).to.include('image: ipfs/kubo:release')
    })

    it('leaves unrelated lines untouched', () => {
      const updated = replaceServiceImage(SAMPLE_COMPOSE, 'cluster', 'ipfs/ipfs-cluster:v1.1.6')

      expect(updated.split('\n')).to.have.length(SAMPLE_COMPOSE.split('\n').length)
      expect(updated).to.include('      - ./data/ipfs-cluster:/data/ipfs-cluster')
    })

    it('throws when the service is missing', () => {
      expect(() => replaceServiceImage(SAMPLE_COMPOSE, 'nginx', 'nginx:latest')).to.throw(
        'Could not find nginx service',
      )
    })

    it('throws when the service has no image line', () => {
      const compose = `services:\n  ipfs:\n    container_name: ipfs\n  cluster:\n    image: ipfs/ipfs-cluster:v1.1.6\n`
      expect(() => replaceServiceImage(compose, 'ipfs', 'ipfs/kubo:v0.41.0')).to.throw(
        'Could not find image for ipfs service',
      )
    })
  })

  describe('removeIpfsConfigBindMount', () => {
    it('removes the legacy bind mount line only', () => {
      const updated = removeIpfsConfigBindMount(SAMPLE_COMPOSE)

      expect(updated).to.not.include('ipfs.config.json')
      expect(updated).to.include('      - ./data/ipfs:/data/ipfs')
      expect(updated.split('\n')).to.have.length(SAMPLE_COMPOSE.split('\n').length - 1)
    })

    it('is a no-op when the bind mount is absent', () => {
      const compose = removeIpfsConfigBindMount(SAMPLE_COMPOSE)
      expect(removeIpfsConfigBindMount(compose)).to.equal(compose)
    })
  })

  describe('hasIpfsConfigBindMount', () => {
    it('detects the bind mount regardless of indentation', () => {
      expect(hasIpfsConfigBindMount(SAMPLE_COMPOSE)).to.equal(true)
      expect(hasIpfsConfigBindMount('  - ./ipfs.config.json:/data/ipfs/config:ro\n')).to.equal(true)
    })

    it('returns false when absent', () => {
      expect(hasIpfsConfigBindMount(removeIpfsConfigBindMount(SAMPLE_COMPOSE))).to.equal(false)
      expect(hasIpfsConfigBindMount('')).to.equal(false)
    })
  })

  describe('isValidDockerTag', () => {
    it('accepts common tags', () => {
      expect(isValidDockerTag('v0.41.0')).to.equal(true)
      expect(isValidDockerTag('1.1.6')).to.equal(true)
      expect(isValidDockerTag('latest')).to.equal(true)
      expect(isValidDockerTag('v0.41.0-rc1')).to.equal(true)
    })

    it('rejects malformed tags', () => {
      expect(isValidDockerTag('')).to.equal(false)
      expect(isValidDockerTag('v1 latest')).to.equal(false)
      expect(isValidDockerTag('v1\n    privileged: true')).to.equal(false)
      expect(isValidDockerTag('.hidden')).to.equal(false)
      expect(isValidDockerTag('-leading-dash')).to.equal(false)
    })
  })
})
