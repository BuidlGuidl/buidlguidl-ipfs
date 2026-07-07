import {promises as fs} from 'node:fs'
import path from 'node:path'

import {usesIpfsConfigBindMount} from './compose-file.js'

export const LEGACY_IPFS_CONFIG_PATH = 'ipfs.config.json'
export const REPO_IPFS_CONFIG_PATH = 'data/ipfs/config'

export interface IpfsConfigChange {
  key: string
  nextValue: unknown
  previousValue: unknown
  type: 'remove' | 'set'
}

export const computeIpfsConfigChanges = (
  config: Record<string, unknown>,
  ownedKeys: Record<string, unknown>,
  removedKeys: string[] = [],
): IpfsConfigChange[] =>
  [
    ...removedKeys
      .filter((key) => getNestedValue(config, key) !== undefined)
      .map((key) => ({
        key,
        nextValue: undefined,
        previousValue: getNestedValue(config, key),
        type: 'remove' as const,
      })),
    ...Object.entries(ownedKeys)
    .filter(([key, nextValue]) => !isEqual(getNestedValue(config, key), nextValue))
    .map(([key, nextValue]) => ({
      key,
      nextValue,
      previousValue: getNestedValue(config, key),
      type: 'set' as const,
    })),
  ]

export const mergeIpfsConfig = (
  config: Record<string, unknown>,
  ownedKeys: Record<string, unknown>,
  removedKeys: string[] = [],
): Record<string, unknown> => {
  const merged = structuredClone(config)

  for (const key of removedKeys) {
    deleteNestedValue(merged, key)
  }

  for (const [key, value] of Object.entries(ownedKeys)) {
    setNestedValue(merged, key, value)
  }

  return merged
}

// The IPFS config file bgipfs should read and write: the Kubo repo config at
// data/ipfs/config, unless the compose file still bind-mounts the legacy
// exported ipfs.config.json over it (in which case that file is the live one).
export const getLiveIpfsConfigPath = async (): Promise<string> => {
  const hasRepoConfig = await fs
    .access(REPO_IPFS_CONFIG_PATH)
    .then(() => true)
    .catch(() => false)

  if (!hasRepoConfig) {
    return LEGACY_IPFS_CONFIG_PATH
  }

  return (await usesIpfsConfigBindMount()) ? LEGACY_IPFS_CONFIG_PATH : REPO_IPFS_CONFIG_PATH
}

// Repo version the given Kubo release will migrate to. Kubo 0.38 moved to repo
// version 18; we assume 18 for anything newer (including future majors) since
// the bgipfs config policy only branches at >= 18. Returns undefined for
// older releases and non-semver tags like `release`.
export const getTargetRepoVersion = (ipfsVersion: string): number | undefined => {
  const match = ipfsVersion.match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return undefined
  }

  const [, major, minor] = match.map(Number)
  return major > 0 || minor >= 38 ? 18 : undefined
}

export const ipfsConfigWritePermissionHint = (configPath: string): string =>
  `Cannot write ${configPath} as the current host user. Take ownership of the file and retry:\n` +
  `sudo chown "$(id -u):$(id -g)" ${configPath}`

export const readIpfsConfig = async (configPath = LEGACY_IPFS_CONFIG_PATH): Promise<Record<string, unknown>> => {
  const content = await fs.readFile(configPath, 'utf8')
  const parsed = JSON.parse(content) as unknown

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${configPath} must contain a JSON object`)
  }

  return parsed as Record<string, unknown>
}

export const readIpfsRepoVersion = async (versionPath = 'data/ipfs/version'): Promise<number | undefined> => {
  try {
    const content = await fs.readFile(versionPath, 'utf8')
    const version = Number.parseInt(content.trim(), 10)
    return Number.isNaN(version) ? undefined : version
  } catch {
    return undefined
  }
}

export const backupIpfsConfig = async (
  configPath = LEGACY_IPFS_CONFIG_PATH,
  backupDir = 'config-backup',
): Promise<string> => {
  await fs.mkdir(backupDir, {recursive: true})
  const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-')
  const backupPath = path.join(backupDir, `${path.basename(configPath)}.${timestamp}`)
  await fs.copyFile(configPath, backupPath)
  return backupPath
}

export const writeIpfsConfig = async (
  config: Record<string, unknown>,
  configPath = LEGACY_IPFS_CONFIG_PATH,
): Promise<void> => {
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
  } catch (error) {
    const {code} = error as NodeJS.ErrnoException
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(ipfsConfigWritePermissionHint(configPath))
    }

    throw error
  }
}

const getNestedValue = (config: Record<string, unknown>, key: string): unknown => {
  let current: unknown = config

  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

const setNestedValue = (config: Record<string, unknown>, key: string, value: unknown): void => {
  const segments = key.split('.')
  let current = config

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {}
    }

    current = current[segment] as Record<string, unknown>
  }

  current[segments.at(-1) as string] = value
}

const deleteNestedValue = (config: Record<string, unknown>, key: string): void => {
  const segments = key.split('.')
  let current: Record<string, unknown> = config

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      return
    }

    current = next as Record<string, unknown>
  }

  delete current[segments.at(-1) as string]
}

const isEqual = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
