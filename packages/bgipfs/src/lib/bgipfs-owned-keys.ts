export interface BgipfsIpfsConfigPolicy {
  ownedKeys: Record<string, unknown>
  removedKeys: string[]
}

const COMMON_OWNED_KEYS: Record<string, unknown> = {
  'Gateway.NoFetch': true,
  'Routing.Type': 'dht',
}

export const getBgipfsIpfsConfigPolicy = (
  config: Record<string, unknown>,
  repoVersion?: number,
): BgipfsIpfsConfigPolicy => {
  const usesProvideConfig =
    repoVersion === undefined ? hasObject(config, 'Provide') || !hasObject(config, 'Reprovider') : repoVersion >= 18

  if (usesProvideConfig) {
    return {
      ownedKeys: {
        'Provide.Strategy': 'pinned+entities',
        ...COMMON_OWNED_KEYS,
      },
      removedKeys: ['Reprovider'],
    }
  }

  return {
    ownedKeys: {
      'Reprovider.Strategy': 'roots',
      ...COMMON_OWNED_KEYS,
    },
    removedKeys: [],
  }
}

const hasObject = (config: Record<string, unknown>, key: string): boolean => {
  const value = config[key]
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
