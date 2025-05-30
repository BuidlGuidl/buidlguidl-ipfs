import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../../base-command.js'
import {EnvManager} from '../../../lib/env-manager.js'
import {DnsConfig, dnsSchema} from '../../../lib/env-schema.js'
import {checkRunningContainers} from '../../../lib/system.js'

const waitForIpfs = async (maxAttempts = 5, delayMs = 2000): Promise<void> => {
  let attempt = 1
  while (attempt <= maxAttempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await execa('docker', ['exec', 'ipfs', 'ipfs', 'id'])
      return // Success, IPFS is up
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`IPFS failed to start after ${maxAttempts} attempts: ${(error as Error).message}`)
      }

      attempt++
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs)
      })
    }
  }
}

export default class IpfsAnnounce extends BaseCommand {
  static description = 'Configure IPFS to announce its public domain for peering'

  static examples = ['bgipfs cluster ipfs-announce', 'bgipfs cluster ipfs-announce --domain example.com']

  static flags = {
    domain: Flags.string({
      char: 'd',
      description: 'Public domain to announce for IPFS peering',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force update: skip confirmation prompts',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(IpfsAnnounce)

    try {
      // Check if services are running
      const running = await checkRunningContainers()
      if (running.length === 0) {
        this.logError('IPFS cluster is not running. Please start it first with "bgipfs cluster start"')
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

      // Confirm update
      if (!flags.force) {
        const shouldUpdate = await this.confirm(
          `Are you sure you want to configure IPFS to announce ${domain} for peering?`,
        )
        if (!shouldUpdate) {
          this.logInfo('Update cancelled')
          return
        }
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

      // 5. Wait for IPFS to be up and ready
      this.logInfo('Waiting for IPFS to be ready...')
      await waitForIpfs()

      // Verify IPFS is up and running
      this.logInfo('Verifying IPFS is running...')
      const {stdout: id} = await execa('docker', ['exec', 'ipfs', 'ipfs', 'id'])
      this.logSuccess('IPFS configured successfully!')
      this.logInfo('Your Addresses:')
      this.log(id)
    } catch (error) {
      this.logError(`Failed to configure IPFS peering: ${(error as Error).message}`)
    }
  }
}