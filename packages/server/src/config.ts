import { z } from 'zod'
import dotenv from 'dotenv'

// Load .env file
dotenv.config()

const envSchema = z.object({
  PORT: z.string().transform(Number).default("3001"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

// This will throw if required env vars are missing
const env = envSchema.parse(process.env);

interface Config {
  server: {
    port: number;
    corsOrigin: string;
  };
}

const config: Config = {
  server: {
    port: env.PORT,
    corsOrigin: env.CORS_ORIGIN,
  },
};

export default config 