import {Hook} from '@oclif/core'
import {execa} from 'execa'

const hook: Hook<'cleanup'> = async function () {
  try {
    await execa('docker', ['compose', '-f', 'init.docker-compose.yml', 'down'])
  } catch {
    // Ignore cleanup errors
  }
}

export default hook
