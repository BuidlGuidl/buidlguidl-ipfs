import { z } from 'zod'
import dotenv from 'dotenv'

// Load .env file
dotenv.config()

const envSchema = z.object({
  PORT: z.string().transform(Number).default("3001"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_USERNAME: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),
  IPFS_URL: z.string().default("http://127.0.0.1:5555"),
});

// This will throw if required env vars are missing
const env = envSchema.parse(process.env);

interface Config {
  server: {
    port: number;
    corsOrigin: string;
  };
  auth: {
    username?: string;
    password?: string;
  };
  ipfs: {
    url: string;
  };
}

const config: Config = {
  server: {
    port: env.PORT,
    corsOrigin: env.CORS_ORIGIN,
  },
  auth: {
    username: env.AUTH_USERNAME,
    password: env.AUTH_PASSWORD,
  },
  ipfs: {
    url: env.IPFS_URL,
  },
};

export default config 