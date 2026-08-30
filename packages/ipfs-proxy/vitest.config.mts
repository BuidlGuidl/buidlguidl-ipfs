import { defineConfig } from 'vitest/config';

// Tests run in plain Node: the Hono app only uses web-standard APIs, and the
// pinned @cloudflare/vitest-pool-workers version cannot load the payment
// dependencies (viem/ox package-exports subpaths) inside workerd. Worker
// bundling is verified separately via `wrangler deploy --dry-run`.
export default defineConfig({
	test: {
		environment: 'node',
	},
});
