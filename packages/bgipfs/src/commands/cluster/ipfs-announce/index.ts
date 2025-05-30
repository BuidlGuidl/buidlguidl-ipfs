import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../../base-command.js'
import {EnvManager} from '../../../lib/env-manager.js'
import {DnsConfig, dnsSchema} from '../../../lib/env-schema.js'
import {checkRunningContainers} from '../../../lib/system.js'

export default class IpfsAnnounce extends BaseCommand {
  static description = 'Configure IPFS to announce its public domain for peering'

  static examples = ['bgipfs cluster ipfs-announce', 'bgipfs cluster ipfs-announce --domain example.com']

  static flags = {
    domain: Flags.string({
      char: 'd',
      description: 'Public domain to announce for IPFS peering',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(IpfsAnnounce)

    try {
      // Check if services are running
      const running = await checkRunningContainers()
      if (running.length === 0) {
        this.logError('No IPFS cluster services are running')
        return
      }

      // Get or prompt for domain
      const env = new EnvManager()
      const currentEnv = (await env.readEnv({schema: dnsSchema})) as DnsConfig
      let domain = flags.domain || currentEnv.IPFS_PEERING_DOMAIN

      if (!domain) {
        domain = await input({
          message: 'Enter the public domain to announce for IPFS peering',
          validate(value) {
            if (!value) return 'Domain is required'
            if (!/^(?:[\dA-Za-z](?:[\dA-Za-z-]{0,61}[\dA-Za-z])?\.)+[A-Za-z]{2,}$/.test(value)) {
              return 'Must be a valid domain name'
            }

            return true
          },
        })
      }

      // Update .env with the domain
      await env.updateEnv([{key: 'IPFS_PEERING_DOMAIN', value: domain}])

      // Configure IPFS to announce the domain
      this.logInfo('Configuring IPFS to announce domain...')

      // 1. Ensure IPFS listens on all interfaces
      await execa('docker', [
        'exec',
        'ipfs',
        'ipfs',
        'config',
        '--json',
        'Addresses.Swarm',
        '["/ip4/0.0.0.0/tcp/4001","/ip6/::/tcp/4001"]',
      ])

      // 2. Announce the public DNS name
      await execa('docker', [
        'exec',
        'ipfs',
        'ipfs',
        'config',
        '--json',
        'Addresses.Announce',
        `["/dns4/${domain}/tcp/4001"]`,
      ])

      // 3. Clear any no-announce filters
      await execa('docker', ['exec', 'ipfs', 'ipfs', 'config', '--json', 'Addresses.NoAnnounce', '[]'])

      // 4. Restart IPFS to apply changes
      this.logInfo('Restarting IPFS to apply changes...')
      await execa('docker', ['restart', 'ipfs'])

      // 5. Get and display the Peer ID
      const {stdout: peerId} = await execa('docker', ['exec', 'ipfs', 'ipfs', 'id'])
      this.logSuccess('IPFS configured successfully!')
      this.logInfo('Your Peer ID:')
      this.log(peerId)
    } catch (error) {
      this.logError(`Failed to configure IPFS peering: ${(error as Error).message}`)
    }
  }
}
