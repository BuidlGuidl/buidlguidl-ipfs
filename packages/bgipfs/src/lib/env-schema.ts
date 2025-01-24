import {z} from 'zod'

const peerAddressPattern = /^\/dns4\/[^/]+\/tcp\/9096\/ipfs\/[\w-]+$/
const secretPattern = /^[\da-f]{64}$/
// Domain pattern based on RFC 1035 with some limitations
const domainPattern = /^(?:[\dA-Za-z](?:[\dA-Za-z-]{0,61}[\dA-Za-z])?\.)+[A-Za-z]{2,}$/

// Base schema with core IPFS cluster fields
export const baseSchema = z
  .object({
    ADMIN_PASSWORD: z.string().min(8, 'Admin password must be at least 8 characters long'),
    ADMIN_USERNAME: z.string().min(3, 'Admin username must be at least 3 characters long'),
    PEERADDRESSES: z.string().refine((val) => {
      if (!val) return true // Empty is valid for first node
      return val
        .split(',')
        .map((addr) => addr.trim())
        .every((addr) => peerAddressPattern.test(addr))
    }, 'Invalid peer address format. Expected: /dns4/{ip-or-domain}/tcp/9096/ipfs/{peerid}'),
    PEERNAME: z.string().min(3, 'Peer name must be at least 3 characters long'),
    SECRET: z.string().regex(secretPattern, 'Must be a 64-character hex string'),
    USER_PASSWORD: z.string().min(8, 'User password must be at least 8 characters long'),
    USER_USERNAME: z.string().min(3, 'User username must be at least 3 characters long'),
  })
  .passthrough()

// DNS schema extends base schema with authentication fields
export const dnsSchema = baseSchema.extend({
  GATEWAY_DOMAIN: z.string().regex(domainPattern, 'Must be a valid domain name'),
  UPLOAD_DOMAIN: z.string().regex(domainPattern, 'Must be a valid domain name'),
})

// Partial schema for reading incomplete configurations
export const readPartialBaseSchema = baseSchema.partial()
export const readPartialDnsSchema = dnsSchema.partial()
// Type exports
export type BaseConfig = z.infer<typeof baseSchema>
export type DnsConfig = z.infer<typeof dnsSchema>
export type PartialBaseConfig = z.infer<typeof readPartialBaseSchema>
export type PartialDnsConfig = z.infer<typeof readPartialDnsSchema>
