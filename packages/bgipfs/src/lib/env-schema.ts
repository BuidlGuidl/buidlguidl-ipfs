import {z} from 'zod'

const peerAddressPattern = /^\/dns4\/[^/]+\/tcp\/9096\/ipfs\/[\w-]+$/
const secretPattern = /^[\da-f]{64}$/
// Domain pattern based on RFC 1035 with some limitations
const domainPattern = /^(?:[\dA-Za-z](?:[\dA-Za-z-]{0,61}[\dA-Za-z])?\.)+[A-Za-z]{2,}$/

export const envSchema = z
  .object({
    ADMIN_EMAIL: z.string().email('Must be a valid email address').optional(),
    AUTH_PASSWORD: z.string().optional(),
    AUTH_USER: z.string().default('admin'),
    GATEWAY_DOMAIN: z.string().regex(domainPattern, 'Must be a valid domain name').optional(),
    PEERADDRESSES: z.string().refine((val) => {
      if (!val) return true // Empty is valid for first node
      return val
        .split(',')
        .map((addr) => addr.trim())
        .every((addr) => peerAddressPattern.test(addr))
    }, 'Invalid peer address format. Expected: /dns4/{ip-or-domain}/tcp/9096/ipfs/{peerid}'),
    PEERNAME: z.string().min(1),
    SECRET: z.string().regex(secretPattern, 'Must be a 64-character hex string'),
    UPLOAD_DOMAIN: z.string().regex(domainPattern, 'Must be a valid domain name').optional(),
  })
  .passthrough()

export type EnvConfig = z.infer<typeof envSchema>
