import { z } from 'zod'
import dotenv from 'dotenv'

// Load .env file
dotenv.config()

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000')
})

// This will throw if required env vars are missing
const env = envSchema.parse(process.env)

interface Config {
  server: {
    port: number;
  };
}

const config: Config = {
  server: {
    port: env.PORT
  }
}

export default config 