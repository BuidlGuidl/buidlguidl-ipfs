import {z} from 'zod'

const peerAddressPattern = /^\/dns4\/[^/]+\/tcp\/9096\/ipfs\/[\w-]+$/
const secretPattern = /^[\da-f]{64}$/

export const envSchema = z
  .object({
    AUTH_PASSWORD: z.string().optional(),
    // Authentication
    AUTH_USER: z.string().default('admin'),
    // Docker settings
    DOCKER_COMPOSE_VERSION: z.string().default('3.8'),

    PEERADDRESSES: z.string().refine((val) => {
      if (!val) return true // Empty is valid for first node
      return val
        .split(',')
        .map((addr) => addr.trim())
        .every((addr) => peerAddressPattern.test(addr))
    }, 'Invalid peer address format. Expected: /dns4/{ip-or-domain}/tcp/9096/ipfs/{peerid}'),

    // Basic settings
    PEERNAME: z.string().min(1),
    SECRET: z.string().regex(secretPattern, 'Must be a 64-character hex string'),
  })
  .passthrough()

export type EnvConfig = z.infer<typeof envSchema>
