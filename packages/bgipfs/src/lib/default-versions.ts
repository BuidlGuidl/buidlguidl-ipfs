// Single source of truth for the Docker image tags bgipfs manages. The
// templates ship these same tags; test/lib/default-versions.test.ts fails if
// they drift apart, so bump both together.
export const DEFAULT_VERSIONS = {
  cluster: 'v1.1.6',
  ipfs: 'v0.41.0',
  traefik: 'v3.6.1',
} as const
