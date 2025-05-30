import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {execa} from 'execa'

import {BaseCommand} from '../../../base-command.js'
import {checkRunningContainers} from '../../../lib/system.js'

export default class IpfsPeer extends BaseCommand {
  static description = 'Connect to another IPFS node'

  static examples = ['bgipfs cluster ipfs-peer --domain example.com --peer-id QmPeerId', 'bgipfs cluster ipfs-peer']

  static flags = {
    domain: Flags.string({
      char: 'd',
      description: 'Domain of the IPFS node to connect to',
    }),
    'peer-id': Flags.string({
      char: 'p',
      description: 'Peer ID of the IPFS node to connect to',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(IpfsPeer)

    try {
      // Check if services are running
      const running = await checkRunningContainers()
      if (running.length === 0) {
        this.logError('No IPFS cluster services are running')
        return
      }

      // Get or prompt for domain and peer ID
      let {domain} = flags
      let peerId = flags['peer-id']

      if (!domain) {
        domain = await input({
          message: 'Enter the domain of the IPFS node to connect to',
          validate(value) {
            if (!value) return 'Domain is required'
            if (!/^(?:[\dA-Za-z](?:[\dA-Za-z-]{0,61}[\dA-Za-z])?\.)+[A-Za-z]{2,}$/.test(value)) {
              return 'Must be a valid domain name'
            }

            return true
          },
        })
      }

      if (!peerId) {
        peerId = await input({
          message: 'Enter the Peer ID of the IPFS node to connect to',
          validate(value) {
            if (!value) return 'Peer ID is required'
            if (!/^[\dA-Za-z]{52}$/.test(value)) {
              return 'Must be a valid Peer ID (52 base58 characters)'
            }

            return true
          },
        })
      }

      // Connect to the peer
      this.logInfo(`Connecting to IPFS node at ${domain}...`)
      const multiaddr = `/dns4/${domain}/tcp/4001/p2p/${peerId}`

      try {
        await execa('docker', ['exec', 'ipfs', 'ipfs', 'swarm', 'connect', multiaddr])
        this.logSuccess('Successfully connected to peer')
      } catch (error) {
        this.logError(`Failed to connect to peer: ${(error as Error).message}`)
        return
      }

      // Verify connection
      this.logInfo('Verifying connection...')
      const {stdout: peers} = await execa('docker', ['exec', 'ipfs', 'ipfs', 'swarm', 'peers'])

      if (peers.includes(peerId)) {
        this.logSuccess('Connection verified!')
        // this.logInfo('Connected peers:')
        // this.log(peers)
      } else {
        this.logError('Failed to verify connection - peer not found in swarm peers')
      }
    } catch (error) {
      this.logError(`Failed to connect to peer: ${(error as Error).message}`)
    }
  }
}
