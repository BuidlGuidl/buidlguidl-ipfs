import {Hook} from '@oclif/core'
import {execa} from 'execa'
import {promises as fs} from 'node:fs'

const hook: Hook<'init-cleanup'> = async function () {
  try {
    await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'down'])
    await fs.unlink('docker-compose.override.yml').catch(() => {})
  } catch {
    // Ignore cleanup errors
  }
}

export default hook
