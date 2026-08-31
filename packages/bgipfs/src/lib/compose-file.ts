import {promises as fs} from 'node:fs'

// Volume entry legacy compose files use to mount the exported IPFS config into the Kubo repo.
export const IPFS_CONFIG_BIND_MOUNT_LINE = '- ./ipfs.config.json:/data/ipfs/config:ro'

const DOCKER_TAG_PATTERN = /^\w[\w.-]{0,127}$/

export const isValidDockerTag = (tag: string): boolean => DOCKER_TAG_PATTERN.test(tag)

export const hasIpfsConfigBindMount = (compose: string): boolean =>
  compose.split('\n').some((line) => line.trim() === IPFS_CONFIG_BIND_MOUNT_LINE)

export const removeIpfsConfigBindMount = (compose: string): string =>
  compose
    .split('\n')
    .filter((line) => line.trim() !== IPFS_CONFIG_BIND_MOUNT_LINE)
    .join('\n')

export const usesIpfsConfigBindMount = async (composePath = 'docker-compose.yml'): Promise<boolean> => {
  const compose = await fs.readFile(composePath, 'utf8').catch(() => '')
  return hasIpfsConfigBindMount(compose)
}

// Ensure the service declares a restart policy so containers survive host
// reboots and daemon crashes; leaves any existing restart policy untouched.
export const ensureServiceRestartPolicy = (compose: string, service: string, policy = 'unless-stopped'): string => {
  const lines = compose.split('\n')
  const servicePattern = new RegExp(`^  ${service}:\\s*$`)

  const serviceStart = lines.findIndex((line) => servicePattern.test(line))
  if (serviceStart === -1) {
    throw new Error(`Could not find ${service} service in docker-compose.yml`)
  }

  for (let index = serviceStart + 1; index < lines.length; index++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[index])) {
      break
    }

    if (/^ {4}restart:\s*/.test(lines[index])) {
      return compose
    }
  }

  lines.splice(serviceStart + 1, 0, `    restart: ${policy}`)
  return lines.join('\n')
}

export const replaceServiceImage = (compose: string, service: string, image: string): string => {
  const lines = compose.split('\n')
  const servicePattern = new RegExp(`^  ${service}:\\s*$`)

  const serviceStart = lines.findIndex((line) => servicePattern.test(line))
  if (serviceStart === -1) {
    throw new Error(`Could not find ${service} service in docker-compose.yml`)
  }

  for (let index = serviceStart + 1; index < lines.length; index++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[index])) {
      break
    }

    if (/^ {4}image:\s*/.test(lines[index])) {
      lines[index] = `    image: ${image}`
      return lines.join('\n')
    }
  }

  throw new Error(`Could not find image for ${service} service in docker-compose.yml`)
}
